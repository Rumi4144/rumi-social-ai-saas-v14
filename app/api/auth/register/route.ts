import { NextResponse } from "next/server";
import { signupProtection, verifySignupChallenge } from "@/lib/turnstile";
import { publicSignupSchema, requestSignup, signupEmailConfigured, signupRequestMessage } from "@/lib/auth/signup-verification";

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const protection = signupProtection();
  const mode = signupEmailConfigured() ? protection.mode : "unavailable";
  return reply({ mode, ...(mode === "protected" && protection.mode === "protected" ? { siteKey: protection.siteKey } : {}) });
}

export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return reply({ error: "Reload this page and try again." }, 403);
  const parsed = publicSignupSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ error: "Check your name, email, business, industry, and password (8–72 characters)." }, 400);
  const protection = signupProtection();
  if (protection.mode === "unavailable") return reply({ error: "Signup protection is temporarily unavailable." }, 503);
  if (!signupEmailConfigured()) return reply({ error: "Verification email is temporarily unavailable. Please try again later or contact support." }, 503);
  if (protection.mode === "protected") {
    const accepted = await verifySignupChallenge(protection.secret, parsed.data.challenge).catch(() => null);
    if (accepted === null) return reply({ error: "Signup protection is temporarily unavailable." }, 503);
    if (!accepted) return reply({ error: "Complete the security check and try again." }, 400);
  }
  try {
    await requestSignup(parsed.data, req);
    return reply({ message: signupRequestMessage }, 202);
  } catch (error) {
    if (error instanceof Error && error.message === "SIGNUP_RATE_LIMITED") return reply({ error: "Too many verification requests. Wait 15 minutes before trying again." }, 429);
    return reply({ error: "Verification email is temporarily unavailable. Please try again later or contact support." }, 503);
  }
}
