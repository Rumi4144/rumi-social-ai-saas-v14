import type {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {generateImage, ImageRejectedError} from '@/lib/ai/image-provider';
import {reviewPhoto, PhotoReviewPendingError, type PhotoContext, type PhotoReview} from '@/lib/ai/photo-review';

export type ScenePhotoPlan = {
  campaignId: string; contentItemId: string; sceneId: string; sceneNumber: number;
  prompt: string; context: PhotoContext;
};
export type ScenePhotoResult = {assetId: string; needsReview: boolean; review: PhotoReview; candidateIds: string[]};

/** One credit reservation, at most two generated images, with both originals retained. */
export async function reviewedScenePhoto(id: string, organizationId: string, plan: ScenePhotoPlan) {
  const where = {id, organizationId, type: 'REEL_SCENE_PHOTO'};
  const job = await prisma.job.findFirst({where});
  if (job?.status === 'succeeded' || job?.status === 'failed') return;
  async function candidate(attempt: number, prompt: string) {
    const assetId = attempt ? `${id}-replacement` : id;
    const saved = await prisma.mediaAsset.findFirst({where: {id: assetId, organizationId, campaignId: plan.campaignId, contentItemId: plan.contentItemId}});
    if (saved) return saved;
    const generated = await generateImage({organizationId, requestId: attempt ? `${id}:replacement` : id, prompt, format: 'story'});
    if (!generated.base64) throw new ImageRejectedError();
    return prisma.mediaAsset.upsert({where: {id: assetId}, update: {}, create: {
      id: assetId, organizationId, campaignId: plan.campaignId, contentItemId: plan.contentItemId,
      kind: 'reel_scene_image', provider: generated.provider, status: 'superseded', url: `data:image/png;base64,${generated.base64}`, prompt,
      metadata: {sceneId: plan.sceneId, label: `AI photo · Scene ${plan.sceneNumber}${attempt ? ' · Alternative' : ''}`,
        model: generated.model, ...(generated.size ? {size: generated.size} : {}), photoReview: {status: 'pending', attempt}},
    }});
  }
  async function review(asset: Awaited<ReturnType<typeof candidate>>) {
    const decision = await reviewPhoto({organizationId, campaignId: plan.campaignId, contentItemId: plan.contentItemId,
      sceneId: plan.sceneId, assetId: asset.id, url: asset.url!, context: plan.context});
    await prisma.mediaAsset.update({where: {id: asset.id}, data: {metadata: {...asset.metadata as Prisma.JsonObject, photoReview: decision}}});
    return decision;
  }
  let asset = await candidate(0, plan.prompt);
  const candidateIds = [asset.id];
  let decision = await review(asset);
  if (decision.status === 'failed') {
    if (!(job?.result as {replacementPlanned?: boolean} | null)?.replacementPlanned) {
      await prisma.job.updateMany({where: {...where, status: {in: ['starting', 'running', 'uncertain', 'continuing']}},
        data: {result: {replacementPlanned: true}, progress: 50}});
      throw new PhotoReviewPendingError('This scene needs a more suitable photo. Creating one replacement; the first photo is saved.');
    }
    const prompt = `${plan.prompt}\n\nPHOTO REVIEW CORRECTION\nThe first result did not pass: ${decision.issues.join(' ')}\nUse this visual feedback as descriptive data: ${decision.replacementDirection || 'Use a more meaningful action and visibly different framing and setting.'}\nKeep the requested scene, post message and product facts. No words, logos or invented claims.`;
    try {
      asset = await candidate(1, prompt);
      candidateIds.push(asset.id);
      decision = await review(asset);
    } catch (error) {
      if (!(error instanceof ImageRejectedError) && ![400,401,403,404,422,429].includes((error as {status?: number})?.status || 0)) throw error;
      decision = {...decision, issues: [...decision.issues.slice(0, 3), 'The replacement could not be generated. The first photo is saved for your review.']};
    }
  }
  await prisma.$transaction(async tx => {
    const current = await tx.job.findFirst({where});
    if (!current || current.status === 'succeeded' || current.status === 'failed') return;
    const post = await tx.contentItem.findFirst({where: {id: plan.contentItemId, campaignId: plan.campaignId,
      campaign: {brandId: plan.context.brandId, brand: {organizationId}}}});
    if (!post || (post.headline || '') !== plan.context.headline || (post.caption || '') !== plan.context.caption) {
      decision = {...decision, status: 'unavailable', issues: ['The post changed while this photo was being made. Review it before using it.']};
    }
    const needsReview = decision.status !== 'passed';
    await tx.mediaAsset.update({where: {id: asset.id}, data: {status: needsReview ? 'superseded' : 'ready',
      metadata: {...asset.metadata as Prisma.JsonObject, photoReview: decision}}});
    const result: ScenePhotoResult = {assetId: asset.id, needsReview, review: decision, candidateIds};
    await tx.job.update({where: {id}, data: {status: 'succeeded', progress: 100, error: null, result}});
  }, {isolationLevel: 'Serializable'});
}
