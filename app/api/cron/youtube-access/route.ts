import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/security/crypto";
import { prisma } from "@/lib/prisma";
import { youtubeAccessToken } from "@/lib/publishing/youtube";
import { deleteYouTubeData } from "@/lib/publishing/youtube-data";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // API-derived upload metadata is not retained indefinitely.
  await prisma.job.deleteMany({ where: { type: "YOUTUBE_UPLOAD", createdAt: { lt: new Date(Date.now() - 30 * 86400000) } } });
  const checked = await prisma.job.findMany({ where: { type: "YOUTUBE_AUTH_CHECK", status: "succeeded", updatedAt: { gt: new Date(Date.now() - 86400000) } }, select: { payload: true } });
  const ids = checked.flatMap(job => {
    const payload = job.payload as { connectionId?: string };
    return payload.connectionId ? [payload.connectionId] : [];
  });
  const connections = await prisma.socialConnection.findMany({ where: { provider: "youtube", status: "connected", id: { notIn: ids } }, take: 10, orderBy: { createdAt: "asc" } });
  const results = await Promise.all(connections.map(async connection => {
    const id = `youtube-auth-check:${connection.id}`;
    try {
      const token = await youtubeAccessToken(connection, true);
      const response = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error("YouTube channel check failed.");
      const channel = data.items?.find((item: { id: string }) => item.id === connection.externalId);
      if (!channel) {
        const current = await prisma.socialConnection.findUnique({ where: { id: connection.id } });
        if (current?.encryptedToken && current.externalId === connection.externalId && JSON.parse(decryptSecret(current.encryptedToken)).accessToken === token) await deleteYouTubeData(current);
        return { connectionId: connection.id, status: "removed" };
      }
      await prisma.socialConnection.updateMany({ where: { id: connection.id, externalId: connection.externalId }, data: { accountName: channel.snippet?.title || "YouTube" } });
      // Do not recreate a check record after a concurrent disconnect.
      const current = await prisma.socialConnection.findUnique({ where: { id: connection.id } });
      if (!current) return { connectionId: connection.id, status: "removed" };
      await prisma.job.upsert({ where: { id }, create: { id, organizationId: connection.organizationId, type: "YOUTUBE_AUTH_CHECK", status: "succeeded", payload: { connectionId: connection.id } }, update: { status: "succeeded", progress: 100 } });
      return { connectionId: connection.id, status: "checked" };
    } catch { return { connectionId: connection.id, status: "needs_attention" }; }
  }));
  console.log("YOUTUBE_ACCESS_CHECK", JSON.stringify({ checked: results.length }));
  return NextResponse.json({ ok: true, checked: results.length });
}
