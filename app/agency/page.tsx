import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import OpenWorkspace from "@/components/OpenWorkspace";
import ClientControls from "./ClientControls";
export default async function Agency() {
  const { context: ctx, recovery } = await studioPageContext();
  if (recovery) return <StudioRecovery recovery={recovery} />;
  const canManage = ctx.isSuperAdmin || ["owner", "admin"].includes(ctx.role);
  const accessible = await prisma.organization.findMany({ where: { id: { not: ctx.organizationId }, status: { not: "suspended" }, ...(!ctx.isSuperAdmin ? { memberships: { some: { userId: ctx.userId } } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 });
  const links = await prisma.clientWorkspace.findMany({ where: { agencyOrganizationId: ctx.organizationId, clientOrganizationId: { in: accessible.map(o => o.id) }, status: "active" }, orderBy: { createdAt: "desc" } });
  const clients = await Promise.all(links.map(async link => {
    const org = accessible.find(o => o.id === link.clientOrganizationId)!;
    const where = { brand: { organizationId: org.id } };
    const [campaigns, drafts, scheduled] = await Promise.all([prisma.campaign.count({ where }), prisma.contentItem.count({ where: { campaign: where, status: "draft" } }), prisma.publishJob.count({ where: { organizationId: org.id, status: "scheduled" } })]);
    return { link, org, campaigns, drafts, scheduled };
  }));
  const choices = accessible.filter(o => !links.some(l => l.clientOrganizationId === o.id));
  return <><div className="eyebrow">AGENCY MODE</div><h1>Your client workspaces.</h1><p>Agency workspace: {ctx.organization.name}. Each client keeps its own campaigns, media and credits.</p>
    <div className="grid"><div className="card"><h2>{clients.length}</h2><p>Linked clients you can access</p></div><div className="card"><h2>{clients.reduce((n, c) => n + c.drafts, 0)}</h2><p>Draft posts across these clients</p></div><div className="card"><h2>{clients.reduce((n, c) => n + c.scheduled, 0)}</h2><p>Scheduled publishing jobs</p></div></div>
    {canManage && <section className="card"><h2>Add a client workspace</h2>{choices.length ? <ClientControls organizationId={ctx.organizationId} choices={choices} /> : <p>No other accessible workspaces are available to link. Ask the client to invite your account through Team &amp; Access in their workspace.</p>}<p>Linking a client organizes workspaces you already have permission to manage.</p><Link href="/workspaces">View your workspaces</Link></section>}
    {!clients.length && <div className="card"><h2>No linked clients yet</h2><p>{canManage ? "Link an accessible client workspace above to get started." : "Ask your workspace owner or administrator to link a client workspace."}</p></div>}
    <div className="clientgrid">{clients.map(({ link, org, campaigns, drafts, scheduled }) => <article className="card" key={link.id}><h2>{link.displayName}</h2><p>{org.name}</p><p>{campaigns} campaigns · {drafts} draft posts · {scheduled} scheduled jobs</p><OpenWorkspace organizationId={org.id} label="Open client workspace" />{canManage && <details><summary>Manage client link</summary><ClientControls organizationId={ctx.organizationId} choices={[]} existing={link} /><p>Unlinking removes this shortcut; it does not delete the client workspace.</p></details>}</article>)}</div></>;
}
