import { prisma } from "@/lib/prisma";
import { xId, XConnectionError } from "@/lib/x/connection";
import { xHash, xMediaBytes } from "@/lib/x/media";
import { randomUUID, xAccessToken, xAccount, xRequest, xPostFingerprint, xGrant, XBusy, XPublishError, X_RECONNECT, type XPost } from "@/lib/x/publishing";
import type { PublishResult } from "./providers";

type Upload = { id: string; offset: number; segment: number; stage: "append" | "finalize" | "processing" | "ready"; expiresAt: number; checkAt?: number };
type State = { lease: string; publishJobId: string; startedAt: number; upload?: Upload };
const waiting = (error = "X is preparing this post. Rumi will check its progress automatically."): PublishResult => ({ ok: false, pending: true, error });
const stop = (error: string, code?: number): PublishResult => ({ ok: false, retryable: false, error, code });
const unknown = "X did not confirm whether this post was published. Check your X profile before creating another post; Rumi will not send this one twice.";
const numericId = (id: unknown): id is string => typeof id === "string" && /^\d{1,30}$/.test(id);

export async function publishX(input: { organizationId?: string; contentItemId?: string; publishJobId?: string; externalAccountId: string }): Promise<PublishResult> {
  const org = input.organizationId, jobId = input.publishJobId;
  if (!org || !jobId || !input.contentItemId) return stop("X publishing context is missing.");
  let stateId: string | undefined, lease: string | undefined, submitting = false;
  let state: State | undefined;
  const patch = async (status: string, extra: Record<string, unknown> = {}) => {
    const result = await prisma.job.updateMany({ where: { id: stateId!, organizationId: org, status: submitting ? "submitting" : "working", payload: { path: ["lease"], equals: lease! } }, data: { status, payload: JSON.parse(JSON.stringify(state)), ...extra } });
    if (!result.count) throw new XBusy();
  };
  try {
    const job = await prisma.publishJob.findFirst({ where: { id: jobId, organizationId: org, contentItemId: input.contentItemId, platform: "x" } });
    if (!job || !["publishing", "retry"].includes(job.status)) return stop("This X post is not queued for publishing.");
    const saved = await prisma.job.findFirst({ where: { id: `x_settings_${jobId}`, organizationId: org, type: "X_POST_SETTINGS", status: "ready" } });
    const post = saved?.payload as unknown as XPost | undefined;
    if (!post || post.contentItemId !== job.contentItemId || post.connectionId !== job.socialConnectionId || post.accountId !== input.externalAccountId) return stop("Review and approve this X post again.");
    const { fingerprint, ...snapshot } = post;
    if (xPostFingerprint(snapshot) !== fingerprint) return stop("The X post settings changed. Review and approve it again.");
    stateId = xId("delivery", `${org}:${fingerprint}`);
    let previous = await prisma.job.findFirst({ where: { id: stateId, organizationId: org, type: "X_POST" } });
    if (!previous) {
      try { previous = await prisma.job.create({ data: { id: stateId, organizationId: org, type: "X_POST", status: "ready", payload: { lease: "", publishJobId: jobId, startedAt: Date.now() } } }); }
      catch (error) { if ((error as { code?: string }).code === "P2002") return waiting(); throw error; }
    }
    const receipt = previous.result as { postId?: string } | null;
    if (previous.status === "succeeded" && numericId(receipt?.postId)) return { ok: true, externalId: receipt.postId };
    if (["submitting", "uncertain"].includes(previous.status)) return stop(unknown);
    state = previous.payload as unknown as State;
    if (previous.status === "failed" && state.publishJobId === jobId) return stop(previous.error || "Review this X post before trying again.");
    if (previous.status === "working" && Date.now() - previous.updatedAt.getTime() < 120000) return waiting();
    if (!["ready", "working", "failed"].includes(previous.status)) return stop(unknown);
    lease = randomUUID();
    state = { ...state, lease, publishJobId: jobId, ...(previous.status === "failed" ? { startedAt: Date.now() } : {}) };
    // A deliberate retry may restart a rejected, incomplete upload. Keep ready
    // media and receipts, and keep resumable uploads after transient failures.
    if (previous.status === "failed" && state.upload?.stage !== "ready") delete state.upload;
    const claimed = await prisma.job.updateMany({ where: { id: stateId, organizationId: org, status: previous.status, updatedAt: previous.updatedAt }, data: { status: "working", payload: JSON.parse(JSON.stringify(state)), error: null } });
    if (!claimed.count) return waiting();
    if (Date.now() - state.startedAt > 2 * 60 * 60 * 1000) throw new XPublishError("X took too long to prepare this media. Review the reel and try again.");

    const currentPost = async () => {
      if (!await prisma.publishJob.findFirst({ where: { id: jobId, organizationId: org, platform: "x", status: { in: ["publishing", "retry"] } } })) throw new XPublishError("This X post was cancelled. Review and approve it again before posting.");
      const item = await prisma.contentItem.findFirst({ where: { id: post.contentItemId, campaign: { brand: { organizationId: org } }, status: { in: ["approved", "scheduled", "published"] } } });
      if (!item || (item.caption || item.headline || "") !== post.text || item.mediaUrl !== post.mediaUrl) throw new XPublishError("This post changed after approval. Review and approve it again before sending it to X.");
      const connection = await prisma.socialConnection.findFirst({ where: { id: post.connectionId, organizationId: org, provider: "x", externalId: post.accountId, status: "connected" } });
      if (!connection) throw new XPublishError(X_RECONNECT);
      return connection;
    };
    const connection = await currentPost();
    const accessToken = await xAccessToken(connection);
    const deadline = Date.now() + 25000;
    if (post.media) {
      const media = await xMediaBytes(org, post.contentItemId, post.media);
      if (xHash(media.bytes) !== post.media.hash) throw new XPublishError("The selected photo or reel changed after approval. Review and approve it again for X.");
      if (state.upload && state.upload.expiresAt <= Date.now() + 60000) { delete state.upload; await patch("working"); }
      if (!state.upload) {
        const result = await xRequest("/2/media/upload/initialize", accessToken, { total_bytes: media.bytes.length, media_type: media.contentType, media_category: post.media.kind === "video" ? "tweet_video" : "tweet_image" });
        if (!numericId(result.data?.id)) throw new XPublishError("X did not accept the media upload. Try the post again.");
        state.upload = { id: result.data.id, offset: 0, segment: 0, stage: "append", expiresAt: Date.now() + Math.min(Number(result.data.expires_after_secs) || 86400, 86400) * 1000 };
        await patch("working");
      }
      const upload = state.upload;
      while (upload.stage === "append" && upload.offset < media.bytes.length) {
        if (Date.now() > deadline) { await patch("ready"); return waiting(); }
        const end = Math.min(upload.offset + 4 * 1024 * 1024, media.bytes.length);
        const chunk = new FormData();
        chunk.set("segment_index", String(upload.segment));
        chunk.set("media", new Blob([new Uint8Array(media.bytes.subarray(upload.offset, end))], { type: media.contentType }), post.media.kind === "video" ? "reel.mp4" : "photo.jpg");
        await xRequest(`/2/media/upload/${upload.id}/append`, accessToken, chunk);
        upload.offset = end; upload.segment++;
        if (end === media.bytes.length) upload.stage = "finalize";
        await patch("working");
      }
      const processing = (result: any) => {
        if (result.data?.id !== upload.id || result.errors?.length) throw new XPublishError("X did not confirm the media status. Review the upload before trying again.");
        const info = result.data?.processing_info;
        if (info?.state === "failed") throw new XPublishError("X could not process this media. Export the photo or reel again and review it before posting.");
        if (!info || info.state === "succeeded") upload.stage = "ready";
        else if (["pending", "in_progress"].includes(info.state)) { upload.stage = "processing"; upload.checkAt = Date.now() + Math.min(Math.max(Number(info.check_after_secs) || 5, 1), 300) * 1000; }
        else throw new XPublishError("X returned an unknown media status. Review the upload before trying again.");
      };
      if (upload.stage === "finalize") {
        if (Date.now() > deadline) { await patch("ready"); return waiting(); }
        // Persist before finalization: after a timeout, inspect this upload instead of starting over.
        upload.stage = "processing"; await patch("working");
        processing(await xRequest(`/2/media/upload/${upload.id}/finalize`, accessToken, null));
        await patch("working");
      } else if (upload.stage === "processing" && (!upload.checkAt || upload.checkAt <= Date.now())) {
        processing(await xRequest(`/2/media/upload?command=STATUS&media_id=${upload.id}`, accessToken));
        await patch("working");
      }
      if (upload.stage !== "ready" || Date.now() > deadline) { await patch("ready"); return waiting(); }
    }
    // Check exact account identity and current approval immediately before the public write.
    let account;
    try { account = await xAccount(accessToken); }
    catch (error) { throw new XPublishError(error instanceof XConnectionError && error.reason === "credits" ? "X requires API credits. Check your X Developer Console balance before trying again." : X_RECONNECT); }
    if (account.id !== post.accountId) throw new XPublishError("The X account does not match this post. Reconnect the intended account in Settings.");
    if (xGrant(await currentPost()).accessToken !== accessToken) throw new XPublishError("The X authorization changed. Review the connection and try again.");
    await patch("submitting"); submitting = true;
    let result;
    try { result = await xRequest("/2/tweets", accessToken, { text: post.text, ...(state.upload ? { media: { media_ids: [state.upload.id] } } : {}) }); }
    catch (error) {
      // Only explicit rejection proves no post was created. A timeout/5xx must never be resubmitted.
      const rejected = error instanceof XPublishError && [400, 401, 402, 403, 404, 413, 422, 429].includes(error.code || 0);
      await patch(rejected ? "failed" : "uncertain", { error: rejected ? error.message : unknown });
      return rejected ? stop(error.message, error.code) : stop(unknown);
    }
    if (!numericId(result.data?.id)) { await patch("uncertain", { error: unknown }); return stop(unknown); }
    await patch("succeeded", { progress: 100, result: { postId: result.data.id }, error: null });
    return { ok: true, externalId: result.data.id };
  } catch (error) {
    if (submitting) return stop(unknown);
    if (stateId && lease && state) {
      const message = error instanceof XPublishError ? error.message : undefined;
      await patch(message ? "failed" : "ready", { error: message || null }).catch(() => {});
    }
    if (error instanceof XBusy) return waiting();
    if (error instanceof XPublishError) return stop(error.message, error.code);
    return { ok: false, retryable: true, error: "X could not prepare this post yet. Rumi will retry without creating a duplicate post." };
  }
}
