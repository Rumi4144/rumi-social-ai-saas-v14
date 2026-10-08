"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function MobileNavigation({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return <aside className="application-sidebar">
    <button className="mobile-menu-toggle" type="button" aria-expanded={open} aria-controls="application-navigation" onClick={() => setOpen(!open)}>Rumi Social AI <span>{open ? "Close menu" : "Menu"}</span></button>
    <div id="application-navigation" className={`navigation-content${open ? " is-open" : ""}`}>{children}</div>
  </aside>;
}
