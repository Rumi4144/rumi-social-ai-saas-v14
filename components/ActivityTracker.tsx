"use client";

import { useEffect } from "react";
import { CHECK_IN_MS } from "@/lib/activity/session";

export default function ActivityTracker({ userId }: { userId: string }) {
  useEffect(() => {
    const tabId = crypto.randomUUID();
    let lastInput = Date.now(), stopped = false, ready = false, pending = false;
    let lastSent = 0, sessionId = "";
    const interacted = (event: Event) => { if (event.isTrusted) lastInput = Date.now(); };
    const visible = () => document.visibilityState === "visible" && document.hasFocus();
    const payload = () => JSON.stringify({ tabId, sessionId, visible: visible(), idleSeconds:
      Math.min(86400, Math.max(0, Math.floor((Date.now() - lastInput) / 1000))) });
    async function send(force = false) {
      if (!ready || stopped || pending || (!force && Date.now() - lastSent < CHECK_IN_MS)) return;
      pending = true;
      lastSent = Date.now();
      try {
        const response = await fetch("/api/activity/check-in", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: payload(),
          credentials: "same-origin", cache: "no-store", keepalive: true,
        });
        if (response.status === 401) stopped = true;
      } catch { /* Activity reporting must never interrupt the user's work. */ }
      finally { pending = false; }
    }
    async function initialize() {
      try {
        // Persist a stable activity ID for cookies issued before tracking existed.
        const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
        if (!response.ok) return;
        const session = await response.json();
        if (session.user?.id !== userId) { stopped = true; return; }
        if (!session.activity?.id) return;
        sessionId = session.activity.id;
        ready = true;
        await send(true);
      } catch { /* Retry on the next interval if the connection is unavailable. */ }
    }
    const visibilityChanged = () => { void send(true); };
    const pageHidden = () => {
      if (!ready || stopped) return;
      const body = { tabId, sessionId, visible: false, idleSeconds: Math.min(86400, Math.max(0, Math.floor((Date.now() - lastInput) / 1000))) };
      navigator.sendBeacon("/api/activity/check-in", new Blob([JSON.stringify(body)], { type: "application/json" }));
    };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"];
    events.forEach(name => window.addEventListener(name, interacted, { passive: true }));
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("focus", visibilityChanged);
    window.addEventListener("blur", visibilityChanged);
    window.addEventListener("pagehide", pageHidden);
    const timer = window.setInterval(() => {
      if (!ready && !stopped) void initialize();
      else if (document.visibilityState === "visible") void send();
    }, CHECK_IN_MS);
    void initialize();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      events.forEach(name => window.removeEventListener(name, interacted));
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("focus", visibilityChanged);
      window.removeEventListener("blur", visibilityChanged);
      window.removeEventListener("pagehide", pageHidden);
    };
  }, [userId]);
  return null;
}
