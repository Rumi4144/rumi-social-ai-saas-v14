"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminOrganizationStatus({
  organizationId,
  organizationName,
  initialStatus,
}: {
  organizationId: string;
  organizationName: string;
  initialStatus: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const suspended = initialStatus === "suspended";

  async function changeStatus() {
    const newStatus = suspended ? "active" : "suspended";

    if (
      !suspended &&
      !window.confirm(
        `Suspend ${organizationName}? Its data will remain intact.`,
      )
    ) {
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch(
        `/api/admin/organizations/${organizationId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not change organization status.",
        );
        return;
      }

      setMessage(
        newStatus === "active"
          ? "Organization reactivated."
          : "Organization suspended.",
      );

      router.refresh();
    } catch {
      setMessage("Could not change organization status.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <p>
        <strong>Organization Status:</strong>{" "}
        {suspended ? "Suspended" : "Active"}
      </p>

      <button
        type="button"
        className="button"
        onClick={changeStatus}
        disabled={saving}
      >
        {saving
          ? "Saving..."
          : suspended
            ? "Reactivate Organization"
            : "Suspend Organization"}
      </button>

      {message && (
        <small style={{ display: "block", marginTop: 10 }}>{message}</small>
      )}
    </div>
  );
}
