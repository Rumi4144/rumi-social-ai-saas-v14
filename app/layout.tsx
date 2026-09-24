import "./globals.css";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
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

  return (
    <html lang="en">
      <body>
        <aside>
          <div className="logo">
            RUMI <b>SOCIAL AI</b>
            <small>CREATIVE OS</small>
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
        <main>
          <ScrollToTop />
          {children}
        </main>
      </body>
    </html>
  );
}
