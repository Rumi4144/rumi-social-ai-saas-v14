import { get } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
export const maxDuration = 60;
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext();
    const url = new URL(req.url);
    const job = await prisma.job.findFirst({ where: { id: url.searchParams.get("jobId") || "", organizationId: ctx.organizationId, type: "RUNWAY_VIDEO", status: "succeeded" } });
    if (!job) return new Response("Video not found", { status: 404 });
    const pathname = `runway/${ctx.organizationId}/${job.id}.mp4`;
    const result = await get(pathname, { access: "private" });
    if (result?.statusCode !== 200) return new Response("Video unavailable", { status: 404 });
    return new Response(result.stream, { headers: { "Content-Type": "video/mp4", "Cache-Control": "private, no-store", "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="rumi-video-${job.id}.mp4"` } });
  } catch (error) { return apiError(error, "Could not load the video."); }
}
