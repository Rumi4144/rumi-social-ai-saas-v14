"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  organizationId: string;
  membershipId: string;
  userName: string;
  email: string;
  initialRole: string;
  isSuperAdmin?: boolean;
};

export default function AdminMemberManager({
  organizationId,
  membershipId,
  userName,
  email,
  initialRole,
  isSuperAdmin = false,
}: Props) {
  const router = useRouter();

  const [role, setRole] = useState(initialRole);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function updateRole() {
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch(
        `/api/admin/organizations/${organizationId}/members/${membershipId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not change role.",
        );
        return;
      }

      setMessage("Role updated.");
      router.refresh();
    } catch {
      setMessage("Could not change role.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAccess() {
    const confirmed = window.confirm(`Remove ${email} from this organization?`);

    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch(
        `/api/admin/organizations/${organizationId}/members/${membershipId}`,
        {
          method: "DELETE",
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not remove access.",
        );
        return;
      }

      router.refresh();
    } catch {
      setMessage("Could not remove access.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        padding: "16px 0",
        borderBottom: "1px solid rgba(0,0,0,.1)",
      }}
    >
      <strong>{userName || email}</strong>

      <p style={{ margin: "5px 0" }}>{email}</p>

      {isSuperAdmin && <small>SUPER ADMIN</small>}

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginTop: 12,
        }}
      >
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          disabled={saving}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>

        <button
          type="button"
          className="button"
          onClick={updateRole}
          disabled={saving || role === initialRole}
        >
          {saving ? "Saving..." : "Change Role"}
        </button>

        {!isSuperAdmin && (
          <button type="button" onClick={removeAccess} disabled={saving}>
            Remove Access
          </button>
        )}
      </div>

      {message && (
        <small style={{ display: "block", marginTop: 10 }}>{message}</small>
      )}
    </div>
  );
}
