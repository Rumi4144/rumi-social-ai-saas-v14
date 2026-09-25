"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminOrganizationDetails({
  organizationId,
  initialName,
}: {
  organizationId: string;
  initialName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch(
        `/api/admin/organizations/${organizationId}/details`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not update organization.",
        );
        return;
      }

      setMessage("Organization name updated.");
      router.refresh();
    } catch {
      setMessage("Could not update organization.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 20 }}>
      <label>
        <strong>Organization Name</strong>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          minLength={2}
          maxLength={100}
          style={{
            display: "block",
            width: "100%",
            marginTop: 8,
          }}
        />
      </label>

      <button
        type="button"
        className="button"
        onClick={save}
        disabled={
          saving || name.trim().length < 2 || name.trim() === initialName
        }
        style={{ marginTop: 12 }}
      >
        {saving ? "Saving..." : "Save Organization Name"}
      </button>

      {message && (
        <small style={{ display: "block", marginTop: 10 }}>{message}</small>
      )}
    </div>
  );
}
