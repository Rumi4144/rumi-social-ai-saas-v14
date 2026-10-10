import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
export const resetSender = () => (process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || process.env.MAIL_FROM || "").trim();
export const resetHash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function resetPassword(token: string, password: string) {
  const hash = resetHash(token);
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.$transaction(async tx => {
    const entry = await tx.passwordResetToken.findUnique({ where: { tokenHash: hash } });
    if (!entry || entry.expiresAt <= new Date()) return false;
    const consumed = await tx.passwordResetToken.deleteMany({ where: { id: entry.id, expiresAt: { gt: new Date() } } });
    if (consumed.count !== 1) return false;
    await tx.user.update({ where: { email: entry.email }, data: { passwordHash } });
    await tx.passwordResetToken.deleteMany({ where: { email: entry.email } });
    return true;
  });
}
export async function sendPasswordReset(email: string) {
  const existing = await prisma.passwordResetToken.findFirst({ where: { email, createdAt: { gt: new Date(Date.now() - 60000) } } });
  if (existing) return;
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;
  const token = randomBytes(32).toString("hex"), tokenHash = resetHash(token);
  await prisma.passwordResetToken.create({ data: { email, tokenHash, expiresAt: new Date(Date.now() + 30 * 60000) } });
  const base = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://rumisocialai.com");
  const url = new URL("/reset-password", base); url.searchParams.set("token", token);
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: resetSender(), to: [email], subject: "Reset your Rumi Social AI password", text: `Use this link to reset your password:\n\n${url}\n\nThe link expires in 30 minutes and can be used once. If you did not request this, ignore this email.` }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("EMAIL_DELIVERY_FAILED");
  } catch {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    throw new Error("EMAIL_DELIVERY_FAILED");
  }
}
