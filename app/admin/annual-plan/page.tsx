import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";
import AdminTabs from "@/components/AdminTabs";
import { addDays, annualStart, manifestOf, planWeek } from "@/lib/weekly/plan";
import type { WeeklyManifest } from "@/lib/weekly/types";
import { providerImageJobId, weeklyRetryReason } from "@/lib/weekly/recovery";
import RetryStep from "./RetryStep";

export default async function AnnualPlanPage({ searchParams }: { searchParams: Promise<{ organizationId?: string; brandId?: string }> }) {
  try { await superAdminContext(); } catch (error) { redirect(error instanceof Error && error.message === "UNAUTHENTICATED" ? "/login" : "/dashboard"); }
  const query = await searchParams;
  const organizations = await prisma.organization.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, brands: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } } } });
  const organization = organizations.find(org => org.id === query.organizationId) || organizations[0];
  const brand = organization?.brands.find(row => row.id === query.brandId) || organization?.brands[0];
  const jobs = brand && organization ? await prisma.job.findMany({ where: { organizationId: organization.id, type: "WEEKLY_PACK", payload: { path: ["brandId"], equals: brand.id } }, orderBy: { createdAt: "asc" } }) : [];
  const saved = jobs.map(job => manifestOf(job.payload)).filter((row): row is WeeklyManifest => !!row);
  const failures = organization && saved.length ? await prisma.job.findMany({ where: { organizationId: organization.id, type: { in: ["CREATE_EVERYTHING", "GENERATE_IMAGE"] }, status: "failed", OR: saved.map(row => ({ payload: { path: ["campaignId"], equals: row.campaignId } })) }, orderBy: { updatedAt: "desc" }, take: 100 }) : [];
  const providerResults = organization && failures.length ? await prisma.job.findMany({ where: { organizationId: organization.id, type: "IMAGE_PROVIDER_TASK", id: { in: failures.map(job => providerImageJobId(organization.id, job.id)) } } }) : [];
  const start = annualStart(saved), history: WeeklyManifest[] = [];
  const preview = brand && organization ? Array.from({ length: 52 }, (_, index) => {
    const weekStart = addDays(start, index * 7), existing = saved.find(row => row.weekStart === weekStart);
    const plan = planWeek({ organizationId: organization.id, brandId: brand.id, brandName: brand.name, weekStart, startsOn: start, mix: { images: 7, motionReels: 0, aiVideos: 0 }, photos: [], history });
    const manifest = existing || { version: 1 as const, brandId: brand.id, campaignId: "", generationJobId: "", weekStart, weekEnd: addDays(weekStart, 6), weekNumber: plan.weekNumber, cycle: plan.cycle, requestId: "", mix: { images: 7, motionReels: 0, aiVideos: 0 }, slots: plan.slots, oneTime: false, preparationCredits: 0, completionCredits: 0, packCredits: 0 };
    history.push(manifest);
    return { ...manifest, prepared: !!existing };
  }) : [];
  return <><AdminTabs active="annual-plan"/><section className="hero v2"><div><div className="eyebrow">ADMIN · YEAR PLAN</div><h1>A fresh week, all year.</h1><p>52 weekly plans, each with seven daily editorial angles. Designs, product photos and recent content history guide each week when the customer prepares it.</p></div></section>
    <form method="get" className="card" style={{ marginTop: 24, display: "flex", gap: 16, flexWrap: "wrap", alignItems: "end" }}><label>Customer workspace<select name="organizationId" defaultValue={organization?.id}>{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label>Business<select name="brandId" defaultValue={brand?.id}>{organization?.brands.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button type="submit">View year</button></form>
    <section className="card" style={{ marginTop: 24 }}><h2>{brand?.name || "Choose a business"}</h2><p>{saved.length} weeks prepared. Planned rows are editorial ideas, not finished posts. Preparation uses the customer’s current package, shows its credit cost and creates only the selected week.</p><p><Link href="/admin/design-formats">Review design formats</Link> · <Link href="/admin/archive">Published history</Link></p>
      {!!failures.length && <section><h3>Preparation needs attention</h3><p>Resume only reuses saved copy, purchased images or original website photos. Unconfirmed provider submissions need review; they are never repurchased here.</p>{failures.map(job => { const campaignId = (job.payload as { campaignId?: string }).campaignId; const pack = jobs.find(row => manifestOf(row.payload)?.campaignId === campaignId); const reason = weeklyRetryReason(job, providerResults.find(row => row.id === providerImageJobId(organization!.id, job.id))); return <div key={job.id} style={{ padding: 16, border: "1px solid #e4d6b9", marginBottom: 12, borderRadius: 12 }}><strong>{job.type === "CREATE_EVERYTHING" ? "Weekly copy" : "Post image"}</strong><p>{job.error || "Preparation could not finish."}</p>{reason ? <p>{reason}</p> : pack && <RetryStep organizationId={organization!.id} packId={pack.id} jobId={job.id}/>}</div>; })}</section>}
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th style={{ textAlign: "left", padding: 12 }}>Week</th><th style={{ textAlign: "left", padding: 12 }}>Dates</th><th style={{ textAlign: "left", padding: 12 }}>Editorial direction</th><th style={{ textAlign: "left", padding: 12 }}>Status</th></tr></thead><tbody>{preview.map(week => <tr key={week.weekStart} style={{ borderTop: "1px solid #dce6e2" }}><td style={{ padding: 12 }}>{week.weekNumber}</td><td style={{ padding: 12, whiteSpace: "nowrap" }}>{week.weekStart} – {week.weekEnd}</td><td style={{ padding: 12 }}><details><summary>{week.slots[0]?.topic.split(";")[0]}</summary><ol>{week.slots.map(slot => <li key={slot.key}>{slot.topic.split("; ")[1] || slot.topic} · {slot.layout.replace(/^weekly-/, "").replaceAll("-", " ")}</li>)}</ol></details></td><td style={{ padding: 12 }}>{week.prepared ? <Link href={`/admin/enter/${encodeURIComponent(organization!.id)}?campaignId=${encodeURIComponent(week.campaignId)}`}>Prepared · {week.slots.length} posts</Link> : "Planned only"}</td></tr>)}</tbody></table></div>
    </section></>;
}
