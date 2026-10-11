import { prisma } from "@/lib/prisma";
import { businessAccessToken, googleJson, GOOGLE_BUSINESS_PROVIDER, LOCATION_NAME } from "@/lib/google-business/client";
import type { PublishResult } from "./providers";

export function googleBusinessPost(caption: string, mediaUrl?: string | null) {
  const summary = caption.trim();
  if (!summary || summary.length > 1500) throw new Error("Google Business Profile posts need text of at most 1,500 characters. Edit this post before publishing.");
  const body: { languageCode: string; topicType: string; summary: string; media?: { mediaFormat: string; sourceUrl: string }[] } = { languageCode: "en-US", topicType: "STANDARD", summary };
  if (mediaUrl) {
    const appUrl = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://rumisocialai.com");
    const url = new URL(mediaUrl, appUrl);
    if (url.protocol !== "https:" || url.username || url.password || /\/api\/video\/|\.(mp4|webm|mov)(?:$|[?#])/i.test(url.toString())) throw new Error("Google Business Profile currently supports text and photo posts here. Choose a photo instead of a video.");
    if (url.origin === appUrl.origin && /^\/api\/media\/[^/]+(?:\/publish)?$/.test(url.pathname)) url.pathname = url.pathname.replace(/^\/api\/media\/([^/]+)(?:\/publish)?$/, "/api/media/$1/publish");
    body.media = [{ mediaFormat: "PHOTO", sourceUrl: url.toString() }];
  }
  return body;
}
export async function publishGoogleBusiness(input: { organizationId?: string; contentItemId?: string; publishJobId?: string; externalAccountId: string; caption: string; mediaUrl?: string | null }): Promise<PublishResult> {
  const stop = (error: string): PublishResult => ({ ok: false, retryable: false, error });
  if (!input.organizationId || !input.contentItemId || !input.publishJobId || !LOCATION_NAME.test(input.externalAccountId)) return stop("Google Business Profile publishing context is missing.");
  const stateId = `google_business_${input.publishJobId}`;
  try {
    // Resolve the exact queued connection, not any matching account in another workspace.
    const job = await prisma.publishJob.findFirst({ where: { id: input.publishJobId, organizationId: input.organizationId, contentItemId: input.contentItemId, platform: GOOGLE_BUSINESS_PROVIDER } });
    const connection = job && await prisma.socialConnection.findFirst({ where: { id: job.socialConnectionId, organizationId: input.organizationId, provider: GOOGLE_BUSINESS_PROVIDER, externalId: input.externalAccountId, status: "connected" } });
    if (!connection) return stop("Reconnect this Google business location in Settings.");
    const previous = await prisma.job.findFirst({ where: { id: stateId, organizationId: input.organizationId, type: "GOOGLE_BUSINESS_POST" } });
    const prior = previous?.result as { name?: string } | null;
    if (previous?.status === "succeeded" && prior?.name) return { ok: true, externalId: prior.name };
    if (previous && (previous.status !== "processing" || !prior?.name)) return stop("This Google post needs review. Check your Business Profile before trying again to avoid duplicates.");
    const accessToken = await businessAccessToken(connection);
    let post: { name?: string; state?: string; searchUrl?: string };
    if (previous && prior?.name) {
      if (!prior.name.startsWith(`${input.externalAccountId}/localPosts/`) || !/^accounts\/[\w-]+\/locations\/[\w-]+\/localPosts\/[\w-]+$/.test(prior.name)) return stop("Invalid Google post receipt.");
      post = await googleJson(`https://mybusiness.googleapis.com/v4/${prior.name}`, accessToken);
    } else {
      const body = googleBusinessPost(input.caption, input.mediaUrl);
      // Google checks the current user's access to this precise location before any write.
      await googleJson(`https://mybusinessbusinessinformation.googleapis.com/v1/${input.externalAccountId.split("/").slice(2).join("/")}?readMask=name,title`, accessToken);
      const current = await prisma.socialConnection.findFirst({ where: { id: connection.id, organizationId: input.organizationId, status: "connected", externalId: input.externalAccountId } });
      if (!current) return stop("The Google connection changed. Check Settings before publishing.");
      try { await prisma.job.create({ data: { id: stateId, organizationId: input.organizationId, type: "GOOGLE_BUSINESS_POST", status: "starting", payload: { publishJobId: input.publishJobId, location: input.externalAccountId } } }); }
      catch { return stop("This Google post has already started. Check publishing history."); }
      post = await googleJson(`https://mybusiness.googleapis.com/v4/${input.externalAccountId}/localPosts`, accessToken, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    if (!post.name || !post.name.startsWith(`${input.externalAccountId}/localPosts/`)) return stop("Google did not confirm the post. Check your Business Profile before trying again.");
    const result = { name: post.name, state: post.state || "PROCESSING", searchUrl: post.searchUrl || "" };
    if (post.state === "REJECTED") { await prisma.job.update({ where: { id: stateId }, data: { status: "failed", result, error: "Google rejected this post." } }); return stop("Google rejected this post. Review it in your Business Profile."); }
    if (post.state !== "LIVE") { await prisma.job.update({ where: { id: stateId }, data: { status: "processing", result } }); return { ok: false, pending: true, retryable: true, error: "Google is reviewing this post. Its existing status will be checked again." }; }
    await prisma.job.update({ where: { id: stateId }, data: { status: "succeeded", progress: 100, result } }).catch(() => null);
    return { ok: true, externalId: post.name };
  } catch (error) { return stop(error instanceof Error ? error.message : "Google Business Profile publishing could not be confirmed. Review publishing history before retrying."); }
}
