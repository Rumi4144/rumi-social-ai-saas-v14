"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/invitations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          name,
          password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not accept invitation.",
        );
        return;
      }

      setMessage("Invitation accepted. Taking you to sign in...");

      setTimeout(() => {
        router.push("/login");
      }, 800);
    } catch {
      setMessage("Could not accept invitation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 620,
        margin: "80px auto",
        padding: 24,
      }}
    >
      <section
        style={{
          background: "white",
          border: "1px solid rgba(0,0,0,.12)",
          borderRadius: 24,
          padding: 32,
        }}
      >
        <div className="eyebrow">RUMI SOCIAL AI · INVITATION</div>

        <h1>Join your workspace</h1>

        <p>
          Create your account password to accept this invitation and access your
          organization.
        </p>

        <form
          onSubmit={accept}
          style={{
            display: "grid",
            gap: 18,
            marginTop: 26,
          }}
        >
          <label>
            <strong>Your Name</strong>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
              }}
            />
          </label>

          <label>
            <strong>Create Password</strong>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={{
                display: "block",
                width: "100%",
                marginTop: 6,
              }}
            />
          </label>

          <button type="submit" className="button" disabled={saving}>
            {saving ? "Accepting..." : "Accept Invitation"}
          </button>

          {message && <p>{message}</p>}
        </form>
      </section>
    </main>
  );
}
