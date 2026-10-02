import "./globals.css";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import SignOutButton from "@/components/SignOutButton";
import ScrollToTop from "@/components/ScrollToTop";
export const metadata = {
  title: "Rumi Social AI",
  description: "AI campaign operating system",
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const userId = (session?.user as any)?.id;

  const currentUser = userId
    ? await prisma.user.findUnique({
        where: { id: String(userId) },
        select: { isSuperAdmin: true },
      })
    : null;

  const isSuperAdmin = currentUser?.isSuperAdmin === true;

  let workspaceName = "";

  if (session?.user) {
    try {
      const ctx = await tenantContext();
      workspaceName = ctx.organization.name;
    } catch {
      workspaceName = "";
    }
  }

  return (
    <html lang="en">
      <body className={session?.user ? "authenticated" : "public-page"}>
        {session?.user && (
        <aside>
          <div className="logo">
            RUMI <b>SOCIAL AI</b>
            <small>CREATIVE OS</small>
            {workspaceName && (
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid rgba(255,255,255,.15)",
                }}
              >
                <small
                  style={{
                    display: "block",
                    opacity: 0.55,
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    marginBottom: 4,
                  }}
                >
                  CURRENT WORKSPACE
                </small>
                <strong
                  style={{
                    display: "block",
                    fontSize: 14,
                    lineHeight: 1.3,
                  }}
                >
                  {workspaceName}
                </strong>
              </div>
            )}
          </div>
          <nav>
            <Link href="/dashboard">Overview</Link>
            <Link href="/create">✦ Create Everything</Link>
            <Link href="/campaigns">Campaigns</Link>
            <Link href="/studio">Creative Studio</Link>
            <Link href="/calendar">Campaign Calendar</Link>
            <Link href="/publishing">Publishing Center</Link>
            <Link href="/library">Creative Library</Link>
            <Link href="/analytics">Analytics</Link>
            <Link href="/brand">Brand Brain</Link>
            <Link href="/billing">Plans & Billing</Link>
            <Link href="/usage">Usage & Credits</Link>
            <Link href="/agency">Agency Mode</Link>
            <Link href="/workspaces">Workspaces</Link>
            <Link href="/team">Team & Access</Link>
            <Link href="/settings">Settings</Link>
            <Link href="/system">System</Link>

            {isSuperAdmin && (
              <>
                <Link href="/admin" scroll={true}>
                  ★ Master Admin
                </Link>
                <Link href="/admin" scroll={true}>
                  ← Return to Admin
                </Link>
              </>
            )}

            {session?.user && <SignOutButton />}
          </nav>
          <div className="sidefoot">Standalone SaaS V2 · Beta</div>
        </aside>
        )}
        <main>
          <ScrollToTop />
          {children}
          <footer style={{ padding: "24px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
            <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a>
          </footer>
        </main>
      </body>
    </html>
  );
}
