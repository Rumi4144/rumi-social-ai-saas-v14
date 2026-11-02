"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export default function AdminRequestAlert() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = async () => {
      if (document.hidden) return;
      try { const response = await fetch("/api/admin/requests/summary", { cache: "no-store", signal: controller.signal }); if (response.ok && !controller.signal.aborted) { const data = await response.json(); setCount(data.count); } } catch {}
    };
    void refresh(); const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  return <Link href="/admin/requests">Customer Requests {count !== null && <strong aria-live="polite" style={{ background: count ? "#fff0d6" : "#edf4ee", color: "#63451b", borderRadius: 12, padding: "2px 7px", marginLeft: 4 }}>{count}</strong>}</Link>;
}
