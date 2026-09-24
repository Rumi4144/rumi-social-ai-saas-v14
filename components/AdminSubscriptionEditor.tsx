"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  organizationId: string;
  initialPlan: string;
  initialStatus: string;
  initialCredits: number;
};

export default function AdminSubscriptionEditor({
  organizationId,
  initialPlan,
  initialStatus,
  initialCredits,
}: Props) {
  const router = useRouter();

  const [plan, setPlan] = useState(initialPlan);
  const [status, setStatus] = useState(initialStatus);
  const [credits, setCredits] = useState(initialCredits);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (!Number.isInteger(credits) || credits < 0) {
      setMessage("Credits must be a whole number of 0 or more.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const res = await fetch(
        `/api/admin/organizations/${organizationId}/subscription`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            plan,
            status,
            credits,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setMessage(
          typeof data?.error === "string"
            ? data.error
            : "Could not save changes.",
        );
        return;
      }

      setMessage("Saved successfully.");
      router.refresh();
    } catch {
      setMessage("Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
      <label>
        <strong>Plan</strong>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          style={{ display: "block", width: "100%", marginTop: 6 }}
        >
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="business">Business</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </label>

      <label>
        <strong>Account Status</strong>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ display: "block", width: "100%", marginTop: 6 }}
        >
          <option value="trialing">Trialing</option>
          <option value="active">Active</option>
          <option value="past_due">Past Due</option>
          <option value="canceled">Canceled</option>
        </select>
      </label>

      <label>
        <strong>AI Credits</strong>
        <input
          type="number"
          min="0"
          step="1"
          value={credits}
          onChange={(e) => setCredits(Number(e.target.value))}
          style={{ display: "block", width: "100%", marginTop: 6 }}
        />
      </label>

      <button type="button" className="button" onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Plan & Credits"}
      </button>

      {message && <small>{message}</small>}
    </div>
  );
}
