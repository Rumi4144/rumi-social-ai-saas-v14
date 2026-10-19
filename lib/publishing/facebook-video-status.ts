import type { PublishResult } from "./providers";

// Meta's upload receipt precedes encoding. A video ID alone is not proof of playback.
export async function facebookVideoStatus(videoId: string, pageAccessToken: string): Promise<PublishResult> {
  const pending = (error: string): PublishResult => ({ok:false,pending:true,externalId:videoId,error});
  if (!/^\d+$/.test(videoId)) return pending("Facebook video status could not be verified.");
  try {
    const url = new URL(`https://graph.facebook.com/v23.0/${videoId}`);
    url.searchParams.set("fields","status");
    const response = await fetch(url,{headers:{Authorization:`Bearer ${pageAccessToken}`},cache:"no-store",signal:AbortSignal.timeout(10000)});
    const data = await response.json();
    if (!response.ok) return pending("Facebook accepted the upload, but its playback status could not be verified. Check the existing Facebook post before retrying.");
    const status=data.status;
    const phases=[status?.uploading_phase?.status,status?.processing_phase?.status,status?.publishing_phase?.status];
    if (status?.video_status === "error" || phases.some(value=>value === "error" || value === "failed")) return {ok:false,retryable:false,externalId:videoId,error:"Facebook could not process this video. The existing post may not play. Check the saved video before uploading a replacement."};
    if (status?.video_status === "ready" && !phases.some(value=>value === "in_progress" || value === "not_started")) return {ok:true,externalId:videoId};
    return pending("Facebook is processing the video. It is not confirmed playable yet.");
  } catch {return pending("Facebook playback status is temporarily unavailable. Check the existing post before retrying.");}
}
