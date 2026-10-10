import { prisma } from "@/lib/prisma";
import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
export const dynamic = "force-dynamic";
export default async function Team() {
  const { context: ctx, recovery } = await studioPageContext();
  if (!ctx) return <StudioRecovery recovery={recovery!} />;
  const members = await prisma.membership.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, role: true, user: { select: { name: true } } } });
  return <><div className="eyebrow">TEAM & ACCESS</div><h1>Workspace members.</h1><p>Members and roles assigned to {ctx.organization.name}. Contact your workspace administrator to change access.</p><section className="queue">{members.map(member=><div className="qrow" key={member.id}><span>{member.user.name || "Workspace member"}</span><span>{member.role}</span></div>)}</section>{!members.length && <p>No members are assigned to this workspace yet.</p>}</>;
}
