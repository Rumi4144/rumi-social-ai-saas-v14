import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { labCanRun, labConfigured, labCost, labDailyLimit, labModels, type LabInput } from "@/lib/ai-lab/catalog";
import { labJobId, labRefresh, labSummary, type LabPayload } from "@/lib/ai-lab/jobs";
import { labQuote, labSubmit, LabProviderError } from "@/lib/ai-lab/providers";

export const maxDuration = 60;
const inputSchema = z.object({ model: z.enum(["flux", "infinitetalk", "speech"]), prompt: z.string().trim().min(10).max(2000), imageAssetId: z.string().max(150).optional(), audioAssetId: z.string().max(150).optional(), voiceId: z.enum(["Calm_Woman", "Friendly_Person", "Patient_Man"]).optional() }).strict().refine(input => input.model !== "speech" || (input.prompt.length <= 600 && Boolean(input.voiceId)), "Choose a voice and a script up to 600 characters.");
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("quote"), organizationId: z.string(), input: inputSchema }),
  z.object({ action: z.literal("generate"), organizationId: z.string(), quoteId: z.string().max(150), requestId: z.string().uuid(), acknowledge: z.literal(true) }),
  z.object({ action: z.literal("refresh"), organizationId: z.string(), jobId: z.string().max(150) }),
]);
async function inputMedia(org: string, input: LabInput) {
  if (input.model !== "infinitetalk") return undefined;
  const assets = await prisma.mediaAsset.findMany({ where: { organizationId: org, id: { in: [input.imageAssetId || "", input.audioAssetId || ""] }, kind: "ai_lab_input", status: "ready", createdAt: { gt: new Date(Date.now() - 6 * 86400000) } } });
  const image = assets.find(a => a.id === input.imageAssetId && (a.metadata as {kind?:string})?.kind === "image");
  const audio = assets.find(a => a.id === input.audioAssetId && (a.metadata as {kind?:string})?.kind === "audio");
  if (!image?.url || !audio?.url) throw new Error("Choose a current presenter photo and voice recording from this workspace.");
  return { image: image.url, audio: audio.url };
}
export async function GET() {
  try {
    const ctx = await tenantContext();
    if (!labCanRun(ctx.role)) throw new Error("FORBIDDEN");
    const jobs = await prisma.job.findMany({ where: { organizationId: ctx.organizationId, type: "AI_LAB" }, orderBy: { createdAt: "desc" }, take: 30 });
    return NextResponse.json({ organizationId: ctx.organizationId, dailyLimitUsd: labDailyLimit(), models: Object.entries(labModels).map(([id, model]) => ({ id, ...model, configured: labConfigured(id as LabInput["model"]) })), jobs: jobs.map(labSummary) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error, "Could not open the test lab."); }
}
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (!labCanRun(ctx.role)) throw new Error("FORBIDDEN");
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
      catch { return NextResponse.json({ error: "Could not confirm a price below $1. Check your uploaded files and provider account. No sample was started." }, { status: 422 }); }
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
