"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
};

export default function AdminPendingInvitations({
  organizationId,
  invitations,
}: {
  organizationId: string;
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function cancelInvitation(invitation: Invitation) {
    const confirmed = window.confirm(
      `Cancel the invitation for ${invitation.email}?`,
    );

    if (!confirmed) return;

    setWorkingId(invitation.id);
    setMessage("");

    try {
      const res = await fetch(
        `/api/admin/organizations/${organizationId}/invitations/${invitation.id}`,
        {
          method: "DELETE",
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not cancel invitation.",
        );
        return;
      }

      setMessage(`Invitation for ${invitation.email} canceled.`);
      router.refresh();
    } catch {
      setMessage("Could not cancel invitation.");
    } finally {
      setWorkingId(null);
    }
  }

  if (invitations.length === 0) {
    return (
      <div style={{ marginTop: 22 }}>
        <h3>Pending Invitations</h3>
        <p>No pending invitations.</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 26 }}>
      <h3>Pending Invitations</h3>

      {invitations.map((invitation) => {
        const expires = new Date(invitation.expiresAt);
        const expired = expires.getTime() < Date.now();

        return (
          <div
            key={invitation.id}
            style={{
              padding: "16px 0",
              borderBottom: "1px solid rgba(0,0,0,.1)",
            }}
          >
            <strong>{invitation.email}</strong>

            <p style={{ margin: "5px 0" }}>Role: {invitation.role}</p>

            <p style={{ margin: "5px 0" }}>
              {expired ? "Expired" : "Expires"}: {expires.toLocaleString()}
            </p>

            <button
              type="button"
              onClick={() => cancelInvitation(invitation)}
              disabled={workingId === invitation.id}
            >
              {workingId === invitation.id
                ? "Canceling..."
                : "Cancel Invitation"}
            </button>
          </div>
        );
      })}

      {message && (
        <small style={{ display: "block", marginTop: 12 }}>{message}</small>
      )}
    </div>
  );
}
