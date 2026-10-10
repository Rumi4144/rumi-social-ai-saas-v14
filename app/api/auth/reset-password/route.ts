import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "@/lib/auth/password-reset";
export async function POST(req: Request) {
  const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(8).max(128) }).safeParse(await req.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({ error: "Use a valid reset link and a password of 8–128 characters." }, { status: 400 });
  try { if (!await resetPassword(parsed.data.token, parsed.data.password)) return NextResponse.json({ error: "This reset link has expired or was already used. Request a new one." }, { status: 400 }); return NextResponse.json({ message: "Password updated. Sign in using this account’s email and your new password." }); }
  catch { return NextResponse.json({ error: "Password recovery is unavailable right now. Contact the site administrator." }, { status: 503 }); }
}
