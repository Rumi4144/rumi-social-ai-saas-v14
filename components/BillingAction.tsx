"use client";
import { useState } from "react";
export default function BillingAction({ plan, portal = false, disabled = false, children }: { plan?: string; portal?: boolean; disabled?: boolean; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function open() {
    setBusy(true); setError("");
    try {
      const response = await fetch(portal ? "/api/billing/portal" : "/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: portal ? undefined : JSON.stringify({ plan }) });
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || "Checkout is unavailable.");
      const destination = new URL(data.url);
      if (destination.protocol !== "https:" || !["checkout.stripe.com", "billing.stripe.com"].includes(destination.hostname)) throw new Error("Invalid billing link.");
      window.location.assign(destination.href);
    } catch (error) { setError(error instanceof Error ? error.message : "Checkout is unavailable."); setBusy(false); }
  }
  return <><button type="button" className="button" disabled={disabled || busy} onClick={open}>{busy ? "Opening…" : children}</button>{error && <p role="alert">{error}</p>}</>;
}
