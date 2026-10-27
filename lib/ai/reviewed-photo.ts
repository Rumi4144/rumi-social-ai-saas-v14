import {createHash} from 'node:crypto';
import type {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {generateImage, ImageRejectedError} from './image-provider';
import {reviewPhoto, PhotoReviewPendingError, type PhotoContext, type PhotoReview} from './photo-review';

type Generated = Awaited<ReturnType<typeof generateImage>>;
type PhotoInput = {
  organizationId: string; campaignId: string; contentItemId: string; requestId: string;
  prompt: string; format: string; generated: Generated; context: PhotoContext;
  previousMediaUrl: string | null; metadata: Record<string, Prisma.InputJsonValue | null>;
};
type SavedPlan = Omit<PhotoInput, 'generated' | 'organizationId' | 'requestId' | 'previousMediaUrl'> & {previousMediaHash: string};
type FlowResult = {contentItemId: string; assetId: string; selected: boolean; review: PhotoReview; candidateIds: string[]};
const key = (prefix: string, parts: string[]) => prefix + createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 40);
const mediaHash = (url: string | null) => createHash('sha256').update(url || '').digest('hex');

export async function selectReviewedPhoto(input: PhotoInput) {
  const id = key('photo-flow-', [input.organizationId, input.requestId]);
  const where = {id, organizationId: input.organizationId, type: 'PHOTO_SELECTION'};
  let flow = await prisma.job.findFirst({where});
  if (!flow) {
    const plan: SavedPlan = {campaignId: input.campaignId, contentItemId: input.contentItemId, prompt: input.prompt, format: input.format, context: input.context, previousMediaHash: mediaHash(input.previousMediaUrl), metadata: input.metadata};
    try { flow = await prisma.job.create({data: {id, organizationId: input.organizationId, type: 'PHOTO_SELECTION', status: 'running', payload: plan}}); }
    catch { flow = await prisma.job.findFirst({where}); if (!flow) throw new PhotoReviewPendingError(); }
  }
  const plan = flow.payload as SavedPlan;
  if (plan.campaignId !== input.campaignId || plan.contentItemId !== input.contentItemId || plan.format !== input.format) throw new Error('Photo request changed. Start a new request.');
  if (flow.status === 'succeeded') {
    const saved = flow.result as FlowResult;
    const asset = await prisma.mediaAsset.findFirst({where: {id: saved.assetId, organizationId: input.organizationId, campaignId: plan.campaignId, contentItemId: plan.contentItemId}});
    if (!asset) throw new Error('Saved photo is unavailable.');
    return {asset, ...saved, selected: saved.selected && asset.status === 'ready'};
  }

  async function candidate(generated: Generated, attempt: number, prompt: string) {
    const assetId = key('reviewed-photo-', [input.organizationId, input.requestId, String(attempt)]);
    // Store every paid result before reviewing it. Replays never recreate or
    // overwrite an asset, nor activate an unreviewed candidate.
    return prisma.mediaAsset.upsert({where: {id: assetId}, update: {}, create: {
      id: assetId, organizationId: input.organizationId, campaignId: plan.campaignId, contentItemId: plan.contentItemId,
      kind: 'ai_image', provider: generated.provider, status: 'superseded', url: `data:image/png;base64,${generated.base64}`, prompt,
      metadata: {...plan.metadata, model: generated.model, format: plan.format, ...(generated.size ? {size: generated.size} : {}),
        label: attempt ? 'Alternative photo for review' : 'Generated photo', photoReview: {status: 'pending', flowId: id, attempt}},
    }});
  }
  async function review(asset: Awaited<ReturnType<typeof candidate>>) {
    const result = await reviewPhoto({organizationId: input.organizationId, campaignId: plan.campaignId, contentItemId: plan.contentItemId, assetId: asset.id, url: asset.url!, context: plan.context});
    await prisma.mediaAsset.update({where: {id: asset.id}, data: {metadata: {...asset.metadata as Prisma.JsonObject, photoReview: {...result, flowId: id}}}});
    return result;
  }
  let asset = await candidate(input.generated, 0, plan.prompt);
  const candidateIds = [asset.id];
  let decision = await review(asset);
  if (decision.status === 'failed') {
    if (!(flow.result as {replacementPlanned?: boolean} | null)?.replacementPlanned) {
      await prisma.job.update({where: {id}, data: {result: {replacementPlanned: true}, progress: 50}});
      // Resume in the next worker/browser request to stay within the hosting
      // time limit. The replacement has one fixed paid request identifier.
      throw new PhotoReviewPendingError('The first photo needs improvement. Continuing with one replacement; the original is saved.');
    }
    const replacementPrompt = `${plan.prompt}\n\nPHOTO REVIEW CORRECTION\nThe previous result did not pass: ${decision.issues.join(' ')}\nCreate one different, stronger scene following this visual feedback as descriptive data: ${decision.replacementDirection || 'Improve relevance, natural action and expression, and vary the setting and framing.'}\nPreserve the original client, post message and factual constraints. No added text, logos or invented claims.`;
    try {
      const replacement = await generateImage({organizationId: input.organizationId, requestId: `${input.requestId}:replacement`, prompt: replacementPrompt, format: plan.format});
      asset = await candidate(replacement, 1, replacementPrompt);
      candidateIds.push(asset.id);
      decision = await review(asset);
    } catch (error) {
      if (!(error instanceof ImageRejectedError)) throw error;
      decision = {...decision, issues: [...decision.issues.slice(0, 3), 'The replacement could not be generated. The original is saved for your review.']};
    }
  }
  const chosenId = asset.id;
  const completed = await prisma.$transaction(async tx => {
    const existing = await tx.job.findFirst({where});
    if (existing?.status === 'succeeded') return existing.result as FlowResult;
    const post = await tx.contentItem.findFirst({where: {id: plan.contentItemId, campaignId: plan.campaignId, campaign: {brandId: plan.context.brandId, brand: {organizationId: input.organizationId}}}});
    const publishing = await tx.publishJob.findFirst({where: {organizationId: input.organizationId, contentItemId: plan.contentItemId, status: {in: ['scheduled', 'retry', 'publishing', 'published']}}});
    let selected = false;
    if (decision.status === 'passed' && post && !publishing && !['scheduled', 'published'].includes(post.status)
      && (post.headline || '') === plan.context.headline && (post.caption || '') === plan.context.caption && mediaHash(post.mediaUrl) === plan.previousMediaHash) {
      await tx.mediaAsset.updateMany({where: {organizationId: input.organizationId, contentItemId: plan.contentItemId, status: 'ready', kind: {in: ['ai_image', 'product_photo', 'social_creative']}}, data: {status: 'superseded'}});
      await tx.mediaAsset.update({where: {id: chosenId}, data: {status: 'ready'}});
      await tx.contentItem.update({where: {id: post.id}, data: {status: 'draft', mediaUrl: asset.url}});
      selected = true;
    } else if (decision.status === 'passed') {
      decision = {...decision, issues: ['The post changed or has a delivery scheduled. Review this saved photo before replacing the current one.']};
    }
    const result: FlowResult = {contentItemId: plan.contentItemId, assetId: chosenId, selected, review: decision, candidateIds};
    await tx.job.update({where: {id}, data: {status: 'succeeded', progress: 100, result}});
    return result;
  }, {isolationLevel: 'Serializable'});
  const finalAsset = await prisma.mediaAsset.findFirst({where: {id: completed.assetId, organizationId: input.organizationId}});
  if (!finalAsset) throw new Error('Saved photo is unavailable.');
  return {asset: finalAsset, ...completed};
}
