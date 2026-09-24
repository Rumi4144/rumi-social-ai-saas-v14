"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminInviteUser({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  async function invite() {
    setSaving(true);
    setMessage("");
    setInviteUrl("");

    try {
      const res = await fetch(
        `/api/admin/organizations/${organizationId}/invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, role }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not create invitation.",
        );
        return;
      }

      setInviteUrl(data.inviteUrl);
      setMessage(`Invitation created for ${data.email}.`);
      router.refresh();
    } catch {
      setMessage("Could not create invitation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
      <label>
        <strong>Email</strong>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@example.com"
          style={{ display: "block", width: "100%", marginTop: 6 }}
        />
      </label>

      <label>
        <strong>Role</strong>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          style={{ display: "block", width: "100%", marginTop: 6 }}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
      </label>

      <button
        type="button"
        className="button"
        onClick={invite}
        disabled={saving || !email.trim()}
      >
        {saving ? "Creating Invitation..." : "Create Invitation"}
      </button>

      {message && <small>{message}</small>}

      {inviteUrl && (
        <div>
          <strong>Invitation Link</strong>
          <input
            readOnly
            value={inviteUrl}
            onFocus={(e) => e.currentTarget.select()}
            style={{ display: "block", width: "100%", marginTop: 6 }}
          />
          <small>
            Valid for 7 days. Copy this link and send it to the user.
          </small>
        </div>
      )}
    </div>
  );
}
