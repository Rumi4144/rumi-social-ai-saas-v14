import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import DraftPlanDateEditor from "@/components/DraftPlanDateEditor";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";

// A single-post view also reaches legacy formats omitted by campaign pagination.
export default async function AdminDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await tenantContext();
  if (!ctx.isSuperAdmin) redirect("/dashboard");
  const { id } = await params;
  const item = await prisma.contentItem.findFirst({
    where: { id, campaign: { brand: { organizationId: ctx.organizationId } } },
    include: { campaign: { include: { brand: true } } },
  });
  if (!item) notFound();
  const pack = await prisma.job.findFirst({ where: { organizationId: ctx.organizationId, type: "WEEKLY_PACK", payload: { path: ["campaignId"], equals: item.campaignId } }, select: { id: true } });
  const delivery = await prisma.publishJob.findFirst({ where: { organizationId: ctx.organizationId, contentItemId: item.id }, select: { id: true } });
  return <>
    <div className="eyebrow">ADMIN · SAVED POST</div>
    <h1>{item.headline || "Saved post"}</h1>
    <p>{item.campaign.brand.name} · {item.campaign.title}</p>
    <article className="card" id={`post-${item.id}`}>
      <p><strong>Status:</strong> {item.status}</p>
      <p>{item.scheduledFor ? `Planned date: ${item.scheduledFor.toISOString().slice(0, 10)}` : "No planned date · saved in Admin"}</p>
      <p style={{ whiteSpace: "pre-wrap" }}>{item.caption}</p>
      {item.mediaUrl && <p><a href={item.mediaUrl} target="_blank" rel="noopener noreferrer">View saved artwork or video</a></p>}
      {item.status === "draft" && !pack && !delivery
        ? <DraftPlanDateEditor contentItemId={item.id} scheduledFor={item.scheduledFor?.toISOString() || null} />
        : <p>This post’s planned date is managed with its weekly pack or publishing history.</p>}
    </article>
    <p><Link href={`/campaigns/${item.campaignId}`}>Open original campaign</Link> · <Link href="/dashboard">View customer week</Link></p>
  </>;
}
