import { prisma } from "@/lib/prisma";

export async function rateLimit(key: string, limit = 60, windowMs = 60000, options: { failClosed?: boolean } = {}) {
  const now = new Date();
  const floor = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const id = `${key}:${floor.toISOString()}`;
  try {
    const bucket = await prisma.apiRateBucket.upsert({
      where: { key: id }, update: { count: { increment: 1 } },
      create: { key: id, windowStart: floor, count: 1 },
    });
    return { ok: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count) };
  } catch {
    return { ok: !options.failClosed, remaining: options.failClosed ? 0 : limit };
  }
}
