"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminDeleteOrganization({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");

  const confirmed = confirmation === organizationName;

  async function deleteOrganization() {
    if (!confirmed) return;

    const finalCheck = window.confirm(
      `Permanently delete ${organizationName}? This cannot be undone.`,
    );

    if (!finalCheck) return;

    setDeleting(true);
    setMessage("");

    try {
      const res = await fetch(
        `/api/admin/organizations/${organizationId}/delete`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            confirmationName: confirmation,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error || "Could not delete organization.");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setMessage("Could not delete organization.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section
      className="card"
      style={{
        marginTop: 32,
        border: "1px solid rgba(0,0,0,.25)",
      }}
    >
      <div className="eyebrow">DANGER ZONE</div>

      <h2>Delete Organization</h2>

      <p>
        Permanently deletes this organization and its organization-owned data.
        User accounts are not deleted.
      </p>

      <p>
        Type <strong>{organizationName}</strong> exactly to confirm.
      </p>

      <input
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        placeholder={organizationName}
        autoComplete="off"
        style={{
          display: "block",
          width: "100%",
          marginTop: 12,
        }}
      />

      <button
        type="button"
        onClick={deleteOrganization}
        disabled={!confirmed || deleting}
        style={{ marginTop: 14 }}
      >
        {deleting ? "Deleting..." : "Permanently Delete Organization"}
      </button>

      {message && <p style={{ marginTop: 12 }}>{message}</p>}
    </section>
  );
}
