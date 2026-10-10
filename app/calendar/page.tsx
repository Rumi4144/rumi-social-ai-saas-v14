import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
export const dynamic = "force-dynamic";
export default async function Calendar() {
  const { context: ctx, recovery } = await studioPageContext();
  if (!ctx) return <StudioRecovery recovery={recovery!} />;
  const jobs = await prisma.publishJob.findMany({ where: { organizationId: ctx.organizationId, status: { in: ["scheduled", "retry", "publishing"] } }, orderBy: { scheduledFor: "asc" }, take: 100 });
  const items = await prisma.contentItem.findMany({ where: { id: { in: jobs.map(job=>job.contentItemId) }, campaign: { brand: { organizationId: ctx.organizationId } } }, select: { id: true, headline: true, caption: true } });
  const labels = new Map(items.map(item=>[item.id,item.headline || item.caption?.slice(0,90) || "Scheduled post"]));
  return <><div className="eyebrow">CONTENT CALENDAR</div><h1>Scheduled posts.</h1><p>Confirmed publishing dates for this workspace. Times are shown in New York time.</p>{jobs.length ? <section className="queue">{jobs.map(job=><div className="qrow" key={job.id}><span>{labels.get(job.contentItemId) || "Scheduled post"}</span><span>{job.platform}</span><time dateTime={job.scheduledFor.toISOString()}>{job.scheduledFor.toLocaleString("en-US",{timeZone:"America/New_York"})}</time><span>{job.status}</span></div>)}</section> : <p>No posts are scheduled yet. Approve a campaign post and choose its publishing date.</p>}<Link href="/publishing" className="button">Open Publishing</Link></>;
}
