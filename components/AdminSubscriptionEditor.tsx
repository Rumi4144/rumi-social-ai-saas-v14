"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PACKAGE_KEYS, PACKAGE_CATALOG, canonicalPlan } from "@/lib/billing/packages";

import type { AdminAccess } from "@/lib/billing/admin-access";

type Props = {
  initialAccess?: AdminAccess | null;
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
  initialAccess,
}: Props) {
  const router = useRouter();

  const [plan, setPlan] = useState(canonicalPlan(initialPlan));
  const [status, setStatus] = useState(initialStatus);
  const [credits, setCredits] = useState(initialCredits);
  const [accessDuration, setAccessDuration] = useState("keep");
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
            accessDuration,
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
      setAccessDuration("keep");
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
          value={accessDuration === "keep" ? "keep" : accessDuration}
          onChange={(e) => { const value = e.target.value; setAccessDuration(value); if (value === "keep") setStatus(initialStatus); else if (value === "trial") setStatus("trialing"); else if (["week", "month", "ongoing"].includes(value)) setStatus("active"); else if (value !== "keep") setStatus(value); }}
          style={{ display: "block", width: "100%", marginTop: 6 }}
        >
          <option value="keep">Keep current access ({initialAccess ? `ends ${new Date(initialAccess.expiresAt).toLocaleDateString()}` : initialStatus === "trialing" ? "one trial pack" : initialStatus})</option>
          <option value="week">Grant 1 week — starts when saved</option>
          <option value="month">Grant 1 month — starts when saved</option>
          <option value="ongoing">Ongoing — use available credits each week</option>
          <option value="trial">Trial — one seven-day pack</option>
          <option value="past_due">Paused — payment needs attention</option>
          <option value="canceled">Stopped</option>
        </select>
      </label>

      <small>You decide access for this customer. A week lasts 7 days; a month ends on the same date next month. New creation stops when access ends. Credits and saved posts stay available. Saving does not charge the customer.</small>

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
