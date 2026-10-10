import { NextResponse } from "next/server";
import { z } from "zod";
import { sendPasswordReset } from "@/lib/auth/password-reset";
export async function POST(req: Request) {
  const parsed = z.object({ email: z.string().trim().email().max(254) }).safeParse(await req.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) return NextResponse.json({ error: "Password reset email is not configured yet. Contact the site administrator." }, { status: 503 });
  try { await sendPasswordReset(parsed.data.email.toLowerCase()); return NextResponse.json({ message: "If an account uses that email, a reset link will arrive shortly. Check your spam folder too." }); }
  catch { return NextResponse.json({ error: "Unable to send a reset email right now. Please contact the site administrator." }, { status: 503 }); }
}
