import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PostLogin() {
  const session = await auth();
  const userId = (session?.user as any)?.id;

  const user = userId
    ? await prisma.user.findUnique({
        where: { id: String(userId) },
        select: {
          id: true,
          email: true,
          name: true,
          isSuperAdmin: true,
          memberships: {
            select: {
              organizationId: true,
              organization: {
                select: { name: true },
              },
            },
          },
        },
      })
    : null;

  return (
    <main style={{ padding: 40 }}>
      <h1>Post Login Diagnostic</h1>

      <p><strong>Session User ID:</strong> {userId || "NONE"}</p>
      <p><strong>Email:</strong> {user?.email || "NONE"}</p>
      <p><strong>Name:</strong> {user?.name || "NONE"}</p>
      <p>
        <strong>Super Admin:</strong>{" "}
        {user ? String(user.isSuperAdmin) : "NO USER"}
      </p>
      <p>
        <strong>Memberships:</strong>{" "}
        {user?.memberships.length ?? 0}
      </p>

      <pre>
        {JSON.stringify(user?.memberships ?? [], null, 2)}
      </pre>
    </main>
  );
}
