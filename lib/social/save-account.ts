import { prisma } from "@/lib/prisma";

/** Reauthorization updates only the same external account, never another channel. */
export async function saveProviderAccount(organizationId: string, provider: "youtube" | "tiktok", externalId: string, accountName: string, encryptedToken: string) {
  if (!externalId || !encryptedToken) throw new Error("ACCOUNT_IDENTITY_REQUIRED");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
    const existing = await tx.socialConnection.findFirst({ where: { organizationId, provider, externalId } });
    const data = { accountName, status: "connected", encryptedToken };
    if (existing) return tx.socialConnection.update({ where: { id: existing.id }, data });
    return tx.socialConnection.create({ data: { organizationId, provider, externalId, ...data } });
  });
}
