import { prisma } from "@/lib/prisma";
import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import { planFor } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";
export default async function Usage() {
  const { context: ctx, recovery } = await studioPageContext();
  if (!ctx) return <StudioRecovery recovery={recovery!} />;
  const [subscription, ledger] = await Promise.all([
    prisma.subscription.findUnique({ where: { organizationId: ctx.organizationId } }),
    prisma.creditLedger.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const plan = planFor(subscription?.plan);
  return <>
    <div className="eyebrow">USAGE & CREDITS</div>
    <div className="pagehead"><div><h1>Use AI where it creates value.</h1><p>Your workspace’s current balance and recent credit activity.</p></div></div>
    <div className="usagehero"><div><span>AVAILABLE CREDITS</span><strong>{(subscription?.credits ?? 0).toLocaleString("en-US")}</strong><p>{subscription ? `${plan.name} plan · ${subscription.status}` : "No credit plan configured"}</p></div></div>
    {!process.env.STRIPE_SECRET_KEY && <p>Online credit purchases are not available yet. Contact your workspace administrator if you need more credits.</p>}
    <div className="costgrid">{[["AI Campaign","3"],["Static Creative","5"],["Voiceover","4"],["5s AI Video","40"],["10s AI Video","80"],["Video Assembly","2"]].map(([name,cost])=><div className="card" key={name}><span className="eyebrow">{name}</span><div className="metric">{cost}</div><p>credits</p></div>)}</div>
    <h2>Recent usage</h2>
    {ledger.length ? <section className="queue">{ledger.map(entry=><div className="qrow" key={entry.id}><span>{entry.reason.replace(/_/g," ")}</span><time dateTime={entry.createdAt.toISOString()}>{entry.createdAt.toLocaleDateString("en-US",{timeZone:"America/New_York"})}</time><span>Balance: {entry.balanceAfter}</span><b>{entry.delta > 0 ? "+" : ""}{entry.delta}</b></div>)}</section> : <p>No credit activity has been recorded for this workspace yet.</p>}
  </>;
}
