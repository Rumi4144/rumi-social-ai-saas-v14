import Link from "next/link";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { PACKAGE_KEYS, PACKAGE_CATALOG, TRIAL_PACKAGE, configuredPlanPrice, weeklyPackageSpec, costForWeeklyMix } from "@/lib/billing/packages";
import { canManageBilling } from "@/lib/billing/access";
import BillingAction from "@/components/BillingAction";
export default async function Billing() {
  const ctx = await tenantContext();
  const subscription = await prisma.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
  const current = weeklyPackageSpec(subscription?.plan, subscription?.status);
  const allowed = canManageBilling(ctx.role, ctx.isSuperAdmin), hasSubscription = Boolean(subscription?.stripeSubscriptionId && !["canceled", "incomplete_expired"].includes(subscription.status));
  return <div>
    <div className="eyebrow">YOUR WEEK, READY TO REVIEW</div><h1>Plans & Rumi credits</h1>
    <p>Choose your weekly mix. Review each post, download it individually, or approve it for scheduling to your connected accounts.</p>
    <section className="card" style={{ marginBottom: 24 }}><h2>{current.label} · {subscription?.credits ?? 0} credits available</h2>
      <p>{current.oneTime ? "Your trial includes one seven-day pack." : `Up to ${current.weeklyPosts} posts each week across this workspace’s brands.`} Images, reels and AI videos each count as one post.</p>
      <p><Link href="/dashboard">Open This Week →</Link> · <Link href="/usage">Credit activity</Link></p>
      {subscription?.stripeCustomerId && <BillingAction portal disabled={!allowed}>Manage subscription</BillingAction>}
      {!allowed && <p>Your workspace owner or administrator manages the plan.</p>}
    </section>
    <div className="plans">
      <section className="card"><h2>Trial</h2><div className="price">Free</div><p>{TRIAL_PACKAGE.monthlyCredits} one-time credits</p><p>One seven-day pack: 6 image posts + 1 photo-motion reel, or 7 images.</p><p>Review, download and post individually. No automatic subscription.</p><p>{costForWeeklyMix(TRIAL_PACKAGE.mix)} credits for the complete suggested pack.</p></section>
      {PACKAGE_KEYS.map(key => { const pack = PACKAGE_CATALOG[key], configured = Boolean(process.env.STRIPE_SECRET_KEY && configuredPlanPrice(key)); return <section className="card" key={key}>
        <h2>{pack.label}</h2><div className="price">${pack.priceUsd}<small>/month</small></div>
        <p><strong>{pack.weeklyPosts} posts / week</strong><br/>{pack.monthlyCredits.toLocaleString()} Rumi credits / month</p>
        <p>{pack.mix.images} image posts + {pack.mix.motionReels} photo-motion {pack.mix.motionReels === 1 ? "reel" : "reels"}{pack.mix.aiVideos ? ` + ${pack.mix.aiVideos} AI video` : ""}</p>
        <p>{pack.brands} {pack.brands === 1 ? "brand" : "brands"} · {pack.socialAccounts} connected accounts</p>
        <p>{costForWeeklyMix(pack.mix)} credits for the suggested complete weekly pack.</p>
        <BillingAction plan={key} portal={hasSubscription} disabled={!allowed || (!hasSubscription && !configured)}>{hasSubscription ? "Manage subscription" : configured ? `Choose ${pack.label}` : "Checkout coming soon"}</BillingAction>
      </section>; })}
    </div>
    <section className="card" style={{ marginTop: 24 }}><h2>What your credits cover</h2>
      <p>A seven-post pack costs 15 credits to prepare. Completing each photo-motion reel adds 4 credits; generating three moving AI scenes adds 120 credits. You see the estimate before work begins. Extra generation or revisions use additional credits; downloading and posting saved content do not.</p>
      <p>Photo-motion reels use multiple original product photos with movement, music and short captions. AI videos generate new moving scenes. When suitable product photos or a video provider are unavailable, your weekly pack uses image posts instead and shows the lower estimate.</p>
      <p>Weekly allowances cover the whole workspace. Unused weekly post slots do not accumulate. Monthly credits cover new work within those allowances; extra credits do not increase the weekly post limit. Your approved content and each customer’s separate history are preserved.</p>
      <p>The content planner supports 52 weeks, prepared one week at a time. Your plan must remain active for new packs; existing files stay available. Prices are in USD before any applicable tax.</p>
    </section>
  </div>;
}
