import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { INDUSTRIES } from "@/lib/industries";
import { rateLimit } from "@/lib/security/rate-limit";
import { resetSender } from "@/lib/auth/password-reset";

const TYPE = "VERIFY_SIGNUP";
// Job.organizationId is not a foreign key. Never attach pending signup data to a real tenant.
const PENDING_ORGANIZATION = "__public_signup__";
const lifetimeMs = 30 * 60 * 1000;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const jobId = (token: string) => `verify_signup_${hash(token)}`;

export const publicSignupSchema = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  name: z.string().trim().min(2).max(100),
  organization: z.string().trim().min(2).max(150),
  industry: z.enum(INDUSTRIES),
  password: z.string().min(8).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password is too long."),
  challenge: z.string().max(2048).optional(),
});
const pendingSchema = publicSignupSchema.omit({ password: true, challenge: true }).extend({
  passwordHash: z.string().regex(/^\$2[aby]\$\d{2}\$.{53}$/),
  expiresAt: z.string().datetime(),
});
export const verificationTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const signupRequestMessage = "If this email can be registered, a verification link will arrive shortly. Check your inbox and spam folder. Existing accounts can sign in.";

function signupBase() {
  const base = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://rumisocialai.com");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) && process.env.NODE_ENV !== "production";
  if ((base.protocol !== "https:" && !(local && base.protocol === "http:")) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw Error("SIGNUP_EMAIL_UNAVAILABLE");
  return base;
}

export function signupEmailConfigured() {
  try { signupBase(); return Boolean(process.env.RESEND_API_KEY?.trim() && resetSender()); }
  catch { return false; }
}

async function requestLimit(kind: "request" | "verify", identity: string, request?: Request) {
  const window = 15 * 60 * 1000;
  const address = process.env.VERCEL === "1" ? request?.headers.get("x-vercel-forwarded-for")?.trim().toLowerCase() : undefined;
  if (address && address.length <= 64 && /^[a-f0-9:.]+$/.test(address)) {
    const allowed = await rateLimit(`signup:${kind}:ip:${hash(address)}`, kind === "request" ? 20 : 60, window, { failClosed: true });
    if (!allowed.ok) throw Error("SIGNUP_RATE_LIMITED");
  }
  const allowed = await rateLimit(`signup:${kind}:${hash(identity)}`, kind === "request" ? 3 : 10, window, { failClosed: true });
  if (!allowed.ok) throw Error("SIGNUP_RATE_LIMITED");
}

export async function purgeExpiredSignups(now = new Date()) {
  const cutoff = new Date(now.getTime() - lifetimeMs);
  const expired = await prisma.job.findMany({
    where: { type: TYPE, organizationId: PENDING_ORGANIZATION, status: "awaiting_verification", createdAt: { lte: cutoff } },
    select: { id: true }, orderBy: { createdAt: "asc" }, take: 50,
  });
  if (expired.length) await prisma.job.deleteMany({
    where: { id: { in: expired.map(entry => entry.id) }, type: TYPE, organizationId: PENDING_ORGANIZATION, status: "awaiting_verification", createdAt: { lte: cutoff } },
  });
}

export async function requestSignup(input: z.infer<typeof publicSignupSchema>, request?: Request) {
  if (!signupEmailConfigured()) throw Error("SIGNUP_EMAIL_UNAVAILABLE");
  const parsed = publicSignupSchema.parse(input);
  await requestLimit("request", parsed.email, request);
  await purgeExpiredSignups();
  // Do not reveal whether this is an existing account or change its password or memberships.
  const existing = await prisma.user.findUnique({ where: { email: parsed.email }, select: { id: true } });
  if (existing) return;

  const token = randomBytes(32).toString("hex");
  const id = jobId(token);
  const expiresAt = new Date(Date.now() + lifetimeMs).toISOString();
  const passwordHash = await bcrypt.hash(parsed.password, 12);
  await prisma.job.create({ data: {
    id, organizationId: PENDING_ORGANIZATION, type: TYPE, status: "awaiting_verification",
    payload: { email: parsed.email, name: parsed.name, organization: parsed.organization, industry: parsed.industry, passwordHash, expiresAt },
  } });
  const url = new URL("/verify-email", signupBase()); url.searchParams.set("token", token);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: resetSender(), to: [parsed.email], subject: "Verify your Rumi Social AI email",
        text: `Confirm your email to create your Rumi Social AI workspace.\n\n${url}\n\nThe link expires in 30 minutes and can be used once. Open it, then select Verify email. If you did not request this account, ignore this message. No account has been created yet.` }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error("SIGNUP_EMAIL_UNAVAILABLE");
  } catch {
    await prisma.job.deleteMany({ where: { id, type: TYPE, organizationId: PENDING_ORGANIZATION, status: "awaiting_verification" } });
    throw Error("SIGNUP_EMAIL_UNAVAILABLE");
  }
}

export async function verifySignup(token: string, request?: Request) {
  if (!verificationTokenSchema.safeParse(token).success) return false;
  await requestLimit("verify", token, request);
  const now = new Date();
  await purgeExpiredSignups(now);
  try {
    return await prisma.$transaction(async tx => {
      const pending = await tx.job.findUnique({ where: { id: jobId(token) } });
      if (!pending || pending.type !== TYPE || pending.organizationId !== PENDING_ORGANIZATION || pending.status !== "awaiting_verification") return false;
      const data = pendingSchema.safeParse(pending.payload);
      if (!data.success || new Date(data.data.expiresAt) <= now || pending.createdAt <= new Date(now.getTime() - lifetimeMs)) {
        await tx.job.deleteMany({ where: { id: pending.id, type: TYPE, organizationId: PENDING_ORGANIZATION, status: "awaiting_verification" } });
        return false;
      }
      // The claim is in the same transaction as every account write: failures roll it all back.
      const claimed = await tx.job.updateMany({
        where: { id: pending.id, type: TYPE, organizationId: PENDING_ORGANIZATION, status: "awaiting_verification", createdAt: { gt: new Date(now.getTime() - lifetimeMs) } },
        data: { status: "claimed" },
      });
      if (claimed.count !== 1) return false;
      const value = data.data;
      const user = await tx.user.findUnique({ where: { email: value.email }, select: { id: true } });
      if (!user) {
        const createdUser = await tx.user.create({ data: { email: value.email, name: value.name, passwordHash: value.passwordHash } });
        const slug = value.organization.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "workspace";
        const organization = await tx.organization.create({ data: { name: value.organization, slug: `${slug}-${randomBytes(8).toString("hex")}` } });
        await tx.brand.create({ data: { organizationId: organization.id, name: value.organization, industry: value.industry } });
        await tx.membership.create({ data: { userId: createdUser.id, organizationId: organization.id, role: "owner" } });
        await tx.subscription.create({ data: { organizationId: organization.id, plan: "starter", status: "trialing", credits: 100 } });
      }
      // Remove password hashes and signup details after completion. Other requests for this email expire normally.
      await tx.job.update({ where: { id: pending.id }, data: { status: "completed", progress: 100, payload: {}, result: { verified: true } } });
      return true;
    });
  } catch (error) {
    // Another token for the same email may win its unique User insert concurrently.
    // Its losing transaction is rolled back, so no extra workspace or trial can remain.
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return false;
    throw error;
  }
}
