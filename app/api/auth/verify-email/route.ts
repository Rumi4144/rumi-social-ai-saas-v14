import { NextResponse } from "next/server";
import { z } from "zod";
import { verificationTokenSchema, verifySignup } from "@/lib/auth/signup-verification";

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// Email scanners may follow a link. GET must never claim a token or create an account.
export async function GET() { return NextResponse.json({ error: "Select Verify email on the confirmation page." }, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } }); }

export async function POST(req: Request) {
  if (req.headers.get("origin") !== new URL(req.url).origin) return reply({ error: "Open the verification page and try again." }, 403);
  const parsed = z.object({ token: verificationTokenSchema }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ error: "This verification link is invalid, expired, or already used. Request a new link from Sign up." }, 410);
  try {
    if (!await verifySignup(parsed.data.token, req)) return reply({ error: "This verification link is invalid, expired, or already used. Request a new link from Sign up." }, 410);
    return reply({ ok: true, loginUrl: "/login" });
  } catch (error) {
    if (error instanceof Error && error.message === "SIGNUP_RATE_LIMITED") return reply({ error: "Too many verification attempts. Wait 15 minutes before trying again." }, 429);
    return reply({ error: "Email verification is temporarily unavailable. Try again shortly." }, 503);
  }
}
