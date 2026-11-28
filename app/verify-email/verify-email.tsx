"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function VerifyEmail({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState("");
  const valid = /^[a-f0-9]{64}$/.test(token);
  useEffect(() => { if (token) window.history.replaceState(null, "", "/verify-email"); }, [token]);

  async function confirm() {
    if (busy || verified || !valid) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json();
      if (!response.ok) throw Error(typeof result.error === "string" ? result.error : "Could not verify your email.");
      setVerified(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not verify your email."); }
    finally { setBusy(false); }
  }

  return <main className="loginwrap"><section className="loginbox">
    <div className="eyebrow">RUMI SOCIAL AI</div>
    <h1>{verified ? "Your email is verified." : "Confirm your email."}</h1>
    {verified ? <><p>Your workspace is ready. Sign in with the email and password you used to sign up.</p><Link className="button" href="/login">Sign in</Link></> : <>
      <p>Choose Verify email to finish creating your workspace. The link expires 30 minutes after it was sent.</p>
      <button className="button" type="button" disabled={busy || !valid} onClick={confirm}>{busy ? "Verifying…" : "Verify email"}</button>
      {!valid && <p role="alert">Open the complete link from your verification email, or request a new one.</p>}
      {message && <p role="alert">{message}</p>}
      <p><Link href="/signup">Request a new verification email</Link></p>
    </>}
  </section></main>;
}
