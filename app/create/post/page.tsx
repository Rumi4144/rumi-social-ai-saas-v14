import Link from "next/link";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import NewPost from "./NewPost";

export default async function NewPostPage() {
  const workspace = await tenantContext();
  const scope = { organizationId: workspace.organizationId };
  const [brands, accounts] = await Promise.all([
    prisma.brand.findMany({ where: scope, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.socialConnection.findMany({
      where: { ...scope, status: "connected", provider: { in: ["facebook", "instagram"] } },
      select: { id: true, provider: true, accountName: true },
      orderBy: [{ provider: "asc" }, { accountName: "asc" }],
    }),
  ]);

  return <main className="container">
    <h1>New Post</h1>
    {workspace.role === "viewer" ? <p>Your role cannot publish posts.</p> :
      !brands.length ? <p><Link href="/brand">Set up your brand</Link> to create a post.</p> :
      !accounts.length ? <p><Link href="/settings">Connect Facebook or Instagram</Link> to publish a post.</p> :
      <NewPost key={workspace.organizationId} brands={brands} accounts={accounts} />}
  </main>;
}
