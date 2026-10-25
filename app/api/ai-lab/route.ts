import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { LabPriceLimitError, labCanRun, labAccentAvailable, labConfigured, labCost, labDailyLimit, labModels, type LabInput } from "@/lib/ai-lab/catalog";
import { labJobId, labRefresh, labSummary, type LabPayload } from "@/lib/ai-lab/jobs";
import { labQuote, labSubmit, LabProviderError } from "@/lib/ai-lab/providers";

export const maxDuration = 60;
const inputSchema = z.object({ model: z.enum(["flux", "infinitetalk", "kling", "speech", "holding", "veo"]), prompt: z.string().trim().min(10).max(2000), imageAssetId: z.string().max(150).optional(), audioAssetId: z.string().max(150).optional(), productAssetId: z.string().max(150).optional(), productLayout: z.literal("beside").optional(), holdingPose: z.enum(["guitar", "guitar-standing-strum", "reference"]).optional(), productReviewed: z.boolean().optional(), voiceId: z.enum(["Calm_Woman", "Friendly_Person", "Patient_Man", "Casual_Guy", "Wise_Woman", "Elegant_Man", "Deep_Voice_Man"]).optional(), accentSpeaker: z.string().min(1).max(150).optional(), voiceAccent: z.enum(["original", "american", "british", "australian", "indian", "southern", "french", "persian", "spanish", "italian"]).optional(), voiceEmotion: z.enum(["neutral", "happy"]).optional(), voiceSpeed: z.number().min(0.85).max(1.15).optional(), campaignId: z.string().min(1).max(150).optional(), contentItemId: z.string().min(1).max(150).optional() }).strict().refine(input => input.model !== "veo" || (Boolean(input.imageAssetId) && Boolean(input.productAssetId) && !input.audioAssetId && !input.productLayout), "Veo needs two original photos and generates its own audio.").refine(input => !input.productLayout || (["infinitetalk", "kling"].includes(input.model) && Boolean(input.productAssetId)), "Choose a product photo for the presenter layout.").refine(input => input.model !== "speech" || (input.prompt.length <= 600 && Boolean(input.voiceId)), "Choose a voice and a script up to 600 characters.").refine(input => input.model !== "speech" || !input.voiceId || labAccentAvailable(input.voiceId,input.voiceAccent ?? "original",input.accentSpeaker), "Choose an accent available for this voice.").refine(input => Boolean(input.campaignId) === Boolean(input.contentItemId), "Choose both a campaign and post.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quote"), organizationId: z.string(), input: inputSchema }),
  z.object({ action: z.literal("generate"), organizationId: z.string(), quoteId: z.string().max(150), requestId: z.string().uuid(), acknowledge: z.literal(true) }),
  z.object({ action: z.literal("refresh"), organizationId: z.string(), jobId: z.string().max(150) }),
]);
class LabInputError extends Error {}
async function inputMedia(org: string, input: LabInput) {
  if (input.campaignId && input.contentItemId) {
    const post = await prisma.contentItem.findFirst({ where: { id: input.contentItemId, campaignId: input.campaignId, campaign: { brand: { organizationId: org } } }, select: { id: true } });
    if (!post) throw new LabInputError("Campaign post not found in this workspace.");
  }
  if (!["infinitetalk", "kling", "holding", "veo"].includes(input.model)) return undefined;
  const assets = await prisma.mediaAsset.findMany({ where: { organizationId: org, id: { in: [input.imageAssetId || "", (input.model === "holding" || input.model === "veo") ? input.productAssetId || "" : input.audioAssetId || "", input.productLayout === "beside" ? input.productAssetId || "" : ""] }, kind: "ai_lab_input", status: "ready", createdAt: { gt: new Date(Date.now() - 6 * 86400000) } } });
  const image = assets.find(a => a.id === input.imageAssetId && (a.metadata as {kind?:string})?.kind === "image");
  if (input.model === "holding" || input.model === "veo") {
    const product = assets.find(a => a.id === input.productAssetId && (a.metadata as {kind?:string})?.kind === "image");
    if (!image?.url || !product?.url || image.id === product.id) throw new LabInputError("Choose two current image references from this workspace.");
    if (input.model === "veo" && [image, product].some(asset => (asset.metadata as {source?:string})?.source === "generated_holding")) throw new LabInputError("Veo requires original presenter and product photos, not a prepared holding image.");
    return { image: image.url, product: product.url };
  }
  if (input.productLayout === "beside") {
    const product = assets.find(a => a.id === input.productAssetId && (a.metadata as {kind?:string})?.kind === "image");
    if (!product?.url || product.id === image?.id || (image?.metadata as {source?:string})?.source === "generated_holding") throw new LabInputError("Choose an original presenter and a current product photo for the separate layout.");
  }
  if ((image?.metadata as {source?:string})?.source === "generated_holding" && input.productReviewed !== true) throw new LabInputError("Review the prepared product photo before creating a video.");
  const audio = assets.find(a => a.id === input.audioAssetId && (a.metadata as {kind?:string})?.kind === "audio");
  if (!image?.url || !audio?.url) throw new LabInputError("Choose a current presenter photo and voice recording from this workspace.");
  return { image: image.url, audio: audio.url };
}
export async function GET() {
  try {
    const ctx = await tenantContext();
    if (!labCanRun(ctx.role, ctx.isSuperAdmin)) throw new Error("FORBIDDEN");
    const jobs = await prisma.job.findMany({ where: { organizationId: ctx.organizationId, type: "AI_LAB" }, orderBy: { createdAt: "desc" }, take: 30 });
    const inputs = await prisma.mediaAsset.findMany({ where: { organizationId: ctx.organizationId, kind: "ai_lab_input", status: "ready", createdAt: { gt: new Date(Date.now() - 6 * 86400000) } }, orderBy: { createdAt: "desc" }, take: 40 });
    return NextResponse.json({ inputs: inputs.filter(asset => (asset.metadata as {kind?:string})?.kind === "image").map(asset => ({id:asset.id, name:(asset.metadata as {filename?:string})?.filename || ((asset.metadata as {source?:string})?.source === "generated_holding" ? "Prepared product presenter" : "Saved presenter or product photo"), needsReview:(asset.metadata as {source?:string})?.source === "generated_holding" })), organizationId: ctx.organizationId, dailyLimitUsd: labDailyLimit(), models: Object.entries(labModels).map(([id, model]) => ({ id, ...model, configured: labConfigured(id as LabInput["model"]) })), jobs: jobs.map(labSummary) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error, "Could not open the test lab."); }
}
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (!labCanRun(ctx.role, ctx.isSuperAdmin)) throw new Error("FORBIDDEN");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a model and describe one sample." }, { status: 400 });
    const p = parsed.data;
    if (p.organizationId !== ctx.organizationId) return NextResponse.json({ error: "Your workspace changed. Reload the test lab." }, { status: 409 });
    if (p.action === "refresh") {
      const job = await prisma.job.findFirst({ where: { id: p.jobId, organizationId: ctx.organizationId, type: "AI_LAB" } });
      if (!job) return NextResponse.json({ error: "Sample not found." }, { status: 404 });
      return NextResponse.json({ job: labSummary(await labRefresh(job)) });
    }
    if (p.action === "quote") {
      if (!labConfigured(p.input.model)) return NextResponse.json({ error: "This provider needs administrator setup before you can test it." }, { status: 503 });
      let estimateUsd: number;
      try { estimateUsd = labCost(await labQuote(p.input, await inputMedia(ctx.organizationId, p.input))); }
      catch (error) {
        if(error instanceof LabPriceLimitError)return NextResponse.json({error:error.message,code:"LAB_PRICE_LIMIT",estimateUsd:error.estimateUsd},{status:422});
        if(error instanceof LabInputError)return NextResponse.json({error:error.message+" Upload or select the references again. No sample was started.",code:"LAB_INPUT_UNAVAILABLE"},{status:422});
        return NextResponse.json({ error: "The provider could not price this sample. Check its account balance and that the uploaded image and audio are supported. No sample was started.",code:"LAB_PRICE_UNAVAILABLE" }, { status: 422 });
      }
      const quote = await prisma.job.create({ data: { organizationId: ctx.organizationId, type: "AI_LAB_QUOTE", status: "quoted", payload: { ...p.input, estimateUsd } } });
      return NextResponse.json({ quoteId: quote.id, estimateUsd, expiresAt: new Date(quote.createdAt.getTime() + 120000).toISOString() });
    }
    const id = labJobId(ctx.organizationId, p.requestId);
    const existing = await prisma.job.findFirst({ where: { id, organizationId: ctx.organizationId, type: "AI_LAB" } });
    if (existing) return NextResponse.json({ job: labSummary(existing) });
    const quote = await prisma.job.findFirst({ where: { id: p.quoteId, organizationId: ctx.organizationId, type: "AI_LAB_QUOTE", status: "quoted", createdAt: { gt: new Date(Date.now() - 120000) } } });
    if (!quote) return NextResponse.json({ error: "This estimate has expired or was already used. Get a fresh estimate." }, { status: 409 });
    const payload = quote.payload as unknown as LabPayload;
    if (!labConfigured(payload.model)) return NextResponse.json({ error: "Provider setup is incomplete." }, { status: 503 });
    const media = await inputMedia(ctx.organizationId, payload);
    let job;
    try {
      job = await prisma.$transaction(async tx => {
        const today = new Date(); today.setUTCHours(0,0,0,0);
        const daily = await tx.job.findMany({ where: { organizationId: ctx.organizationId, type: "AI_LAB", createdAt: { gte: today } } });
        const reserved = daily.reduce((sum, item) => sum + (item.payload as unknown as LabPayload).estimateUsd, 0);
        if (daily.length >= 20 || reserved + payload.estimateUsd > labDailyLimit()) throw new Error("LAB_BUDGET");
        const active = await tx.job.findFirst({ where: { organizationId: ctx.organizationId, type: "AI_LAB", status: { in: ["starting", "running", "saving", "uncertain"] } } });
        if (active) throw new Error("LAB_ACTIVE");
        const used = await tx.job.updateMany({ where: { id: quote.id, organizationId: ctx.organizationId, status: "quoted" }, data: { status: "used" } });
        if (!used.count) throw new Error("LAB_DUPLICATE");
        return tx.job.create({ data: { id, organizationId: ctx.organizationId, type: "AI_LAB", status: "starting", progress: 5, payload: { ...payload } } });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const duplicate = await prisma.job.findFirst({ where: { id, organizationId: ctx.organizationId, type: "AI_LAB" } });
      if (duplicate) return NextResponse.json({ job: labSummary(duplicate) });
      const code = error instanceof Error ? error.message : "";
      return NextResponse.json({ error: code === "LAB_BUDGET" ? "Today's test allowance is used. No sample was started. Allowance resets at midnight UTC." : code === "LAB_ACTIVE" ? "Check the existing sample before starting another. No new sample was started." : "Another request changed the lab. Reload before continuing; no new sample was started." }, { status: 409 });
    }
    let task: { taskId: string; pollingUrl?: string } | undefined;
    try {
      task = await labSubmit(payload, media);
      job = await prisma.job.update({ where: { id }, data: { status: "running", progress: 10, payload: { ...payload, ...task } } });
    } catch (error) {
      // Retry only the database write when submission was confirmed, never the paid call.
      if (task) {
        job = await prisma.job.update({ where: { id }, data: { status: "running", progress: 10, payload: { ...payload, ...task }, error: "The sample was submitted. Checking its status may take a little longer." } });
        return NextResponse.json({ job: labSummary(job) });
      }
      const definitive = error instanceof LabProviderError && error.definitive;
      job = await prisma.job.update({ where: { id }, data: { status: definitive ? "failed" : "uncertain", error: definitive ? "The provider rejected this request. Check the account before starting another sample." : "Submission could not be confirmed. Automatic resubmission is blocked to avoid a duplicate charge. Ask your administrator to reconcile this request with the provider." } });
    }
    return NextResponse.json({ job: labSummary(job) });
  } catch (error) { return apiError(error, "Could not complete this test-lab request."); }
}
