import { prisma } from "@/lib/prisma";

// Delete only data for this authorization; a simultaneous reconnection must survive.
export async function deleteYouTubeData(connection: { id: string; organizationId: string; encryptedToken: string | null }) {
  return prisma.$transaction(async tx => {
    const removed = await tx.socialConnection.deleteMany({ where: { id: connection.id, organizationId: connection.organizationId, encryptedToken: connection.encryptedToken } });
    if (!removed.count) return false;
    await tx.job.deleteMany({ where: { organizationId: connection.organizationId, type: { in: ["YOUTUBE_UPLOAD", "YOUTUBE_AUTH_CHECK"] }, payload: { path: ["connectionId"], equals: connection.id } } });
    return true;
  });
}
