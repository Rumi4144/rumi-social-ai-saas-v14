"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{
        background: "transparent",
        border: 0,
        color: "inherit",
        font: "inherit",
        cursor: "pointer",
        padding: 0,
        textAlign: "left",
      }}
    >
      Sign Out
    </button>
  );
}
