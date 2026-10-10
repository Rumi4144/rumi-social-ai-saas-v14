import { prisma } from "@/lib/prisma";
import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
export const dynamic = "force-dynamic";
export default async function Analytics() {
  const { context: ctx, recovery } = await studioPageContext();
  if (!ctx) return <StudioRecovery recovery={recovery!} />;
  const counts = await Promise.all(["published", "scheduled", "failed"].map(status => prisma.publishJob.count({ where: { organizationId: ctx.organizationId, status } })));
  return <><div className="eyebrow">WORKSPACE ACTIVITY</div><h1>Your publishing activity.</h1><div className="grid">{["Published", "Scheduled", "Failed"].map((name,i)=><div className="card" key={name}><span className="eyebrow">{name}</span><div className="metric">{counts[i]}</div></div>)}</div><p>These counts come from your workspace’s publishing records. Social reach, engagement and click reporting are not connected yet.</p></>;
}
