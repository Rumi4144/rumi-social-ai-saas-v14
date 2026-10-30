import { prisma } from "@/lib/prisma";
import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import { weeklyPackageSpec, weeklyMixQuote, WEEKLY_CREDIT_COST } from "@/lib/billing/packages";

export const dynamic = "force-dynamic";
export default async function Usage() {
  const { context: ctx, recovery } = await studioPageContext();
  if (!ctx) return <StudioRecovery recovery={recovery!} />;
  const [subscription, ledger] = await Promise.all([
    prisma.subscription.findUnique({ where: { organizationId: ctx.organizationId } }),
    prisma.creditLedger.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const plan = weeklyPackageSpec(subscription?.plan, subscription?.status);
  return <>
    <div className="eyebrow">USAGE & CREDITS</div>
    <div className="pagehead"><div><h1>Your Rumi credits</h1><p>Your workspace’s current balance and recent credit activity.</p></div></div>
    <div className="usagehero"><div><span>AVAILABLE CREDITS</span><strong>{(subscription?.credits ?? 0).toLocaleString("en-US")}</strong><p>{subscription ? `${plan.label} plan · ${subscription.status}` : "No credit plan configured"}</p></div></div>
    {!process.env.STRIPE_SECRET_KEY && <p>Online credit purchases are not available yet. Contact your workspace administrator if you need more credits.</p>}
    <div className="costgrid">{[["Prepare 7 posts",weeklyMixQuote({images:7,motionReels:0,aiVideos:0}).preparationCredits],["Finish a photo-motion reel",WEEKLY_CREDIT_COST.motionReelCompletion],["Create 3 moving AI scenes",WEEKLY_CREDIT_COST.aiVideoCompletion]].map(([name,cost])=><div className="card" key={name}><span className="eyebrow">{name}</span><div className="metric">{cost}</div><p>credits</p></div>)}</div>
    <p>Preparing a pack and completing its videos are charged separately. You see the complete estimate before starting. Downloads and posting saved content use no extra Rumi credits. <a href="/billing">Compare plans and combinations →</a></p>
    <h2>Recent usage</h2>
    {ledger.length ? <section className="queue">{ledger.map(entry=><div className="qrow" key={entry.id}><span>{entry.reason.replace(/_/g," ")}</span><time dateTime={entry.createdAt.toISOString()}>{entry.createdAt.toLocaleDateString("en-US",{timeZone:"America/New_York"})}</time><span>Balance: {entry.balanceAfter}</span><b>{entry.delta > 0 ? "+" : ""}{entry.delta}</b></div>)}</section> : <p>No credit activity has been recorded for this workspace yet.</p>}
  </>;
}
