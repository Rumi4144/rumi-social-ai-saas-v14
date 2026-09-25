"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminCreateOrganization() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [plan, setPlan] = useState("starter");
  const [credits, setCredits] = useState(100);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  async function createOrganization() {
    setSaving(true);
    setMessage("");
    setInviteUrl("");

    try {
      const res = await fetch("/api/admin/organizations/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          ownerEmail,
          plan,
          credits,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not create organization.",
        );
        return;
      }

      if (data.ownerAttached) {
        setMessage(
          `Organization created. ${data.ownerEmail} was added as owner.`,
        );
      } else {
        setMessage(
          `Organization created. Owner invitation generated for ${data.ownerEmail}.`,
        );
        setInviteUrl(data.inviteUrl || "");
      }

      setName("");
      setOwnerEmail("");
      setPlan("starter");
      setCredits(100);

      router.refresh();
    } catch {
      setMessage("Could not create organization.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card" style={{ marginTop: 28 }}>
      <div className="eyebrow">MASTER ADMIN</div>

      <h2>Create Organization</h2>

      <label>
        <strong>Organization Name</strong>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Example Company"
          style={{
            display: "block",
            width: "100%",
            marginTop: 6,
          }}
        />
      </label>

      <label style={{ display: "block", marginTop: 16 }}>
        <strong>Owner Email</strong>
        <input
          type="email"
          value={ownerEmail}
          onChange={(e) => setOwnerEmail(e.target.value)}
          placeholder="owner@example.com"
          style={{
            display: "block",
            width: "100%",
            marginTop: 6,
          }}
        />
      </label>

      <label style={{ display: "block", marginTop: 16 }}>
        <strong>Plan</strong>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          style={{
            display: "block",
            width: "100%",
            marginTop: 6,
          }}
        >
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="business">Business</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </label>

      <label style={{ display: "block", marginTop: 16 }}>
        <strong>Starting AI Credits</strong>
        <input
          type="number"
          min={0}
          max={100000}
          value={credits}
          onChange={(e) => setCredits(Number(e.target.value))}
          style={{
            display: "block",
            width: "100%",
            marginTop: 6,
          }}
        />
      </label>

      <button
        type="button"
        className="button"
        onClick={createOrganization}
        disabled={saving || name.trim().length < 2 || !ownerEmail.includes("@")}
        style={{ marginTop: 20 }}
      >
        {saving ? "Creating..." : "Create Organization"}
      </button>

      {message && <p style={{ marginTop: 14 }}>{message}</p>}

      {inviteUrl && (
        <div
          style={{
            marginTop: 18,
            padding: 16,
            border: "1px solid rgba(0,0,0,.12)",
            borderRadius: 14,
          }}
        >
          <strong>Owner Invitation Link</strong>

          <input
            readOnly
            value={inviteUrl}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              display: "block",
              width: "100%",
              marginTop: 10,
            }}
          />

          <button
            type="button"
            style={{ marginTop: 10 }}
            onClick={async () => {
              await navigator.clipboard.writeText(inviteUrl);
              setMessage("Owner invitation link copied.");
            }}
          >
            Copy Link
          </button>

          <p style={{ marginTop: 10 }}>
            <small>
              Valid for 7 days. Send this link to the organization owner.
            </small>
          </p>
        </div>
      )}
    </section>
  );
}
