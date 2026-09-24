"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  async function go(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (signingIn) return;

    setSigningIn(true);
    setMsg("Signing in...");

    try {
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (!result || result.error) {
        setMsg("Email or password is incorrect.");
        setSigningIn(false);
        return;
      }

      // Give the browser a moment to persist the session cookie,
      // then perform a full navigation to the protected dashboard.
      await new Promise((resolve) => setTimeout(resolve, 150));

      window.location.assign("/dashboard");
    } catch {
      setMsg("Unable to sign in. Please try again.");
      setSigningIn(false);
    }
  }

  return (
    <main className="loginwrap">
      <form className="loginbox" onSubmit={go}>
        <div className="eyebrow">RUMI SOCIAL AI</div>

        <h1>Welcome back.</h1>
        <p>Sign in to your Creative OS.</p>

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          minLength={8}
        />

        <div
          style={{
            textAlign: "right",
            marginTop: "10px",
            marginBottom: "18px",
          }}
        >
          <a href="/forgot-password">Forgot password?</a>
        </div>

        <button
          type="submit"
          className="button"
          disabled={signingIn}
        >
          {signingIn ? "Signing in..." : "Sign in"}
        </button>

        {msg && <p className="status">{msg}</p>}

        <small>Protected workspace · encrypted provider credentials</small>
      </form>
    </main>
  );
}
