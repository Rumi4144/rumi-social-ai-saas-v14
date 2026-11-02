"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PACKAGE_KEYS, PACKAGE_CATALOG, canonicalPlan } from "@/lib/billing/packages";

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

  const [plan, setPlan] = useState(canonicalPlan(initialPlan));
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
          onChange={(e) => setPlan(canonicalPlan(e.target.value))}
          style={{ display: "block", width: "100%", marginTop: 6 }}
        >
          {PACKAGE_KEYS.map(key => <option key={key} value={key}>{PACKAGE_CATALOG[key].label}</option>)}
        </select>
      </label>

      <label>
        <strong>Weekly creation access</strong>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          style={{ display: "block", width: "100%", marginTop: 6 }}
        >
          <option value="trialing">Trial — one seven-day pack</option>
          <option value="active">Ongoing — use available credits each week</option>
          <option value="past_due">Paused — payment needs attention</option>
          <option value="canceled">Stopped</option>
        </select>
      </label>

      <small>You decide access for this customer. Ongoing access permits new weeks within the selected plan’s post limit and available credits. Saving does not charge the customer.</small>

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
      <small>This changes workspace access and the credit balance. It does not change an existing Stripe subscription or charge the customer.</small>

      {message && <small>{message}</small>}
    </div>
  );
}
