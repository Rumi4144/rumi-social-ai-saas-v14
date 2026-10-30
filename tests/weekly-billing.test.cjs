const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/weekly-load.cjs');
const catalog = load('lib/billing/packages.ts');
test('paid package balances cover five complete weekly packs; trial is one pack', () => {
  for (const key of catalog.PACKAGE_KEYS) {
    const spec = catalog.weeklyPackageSpec(key, 'active');
    assert.ok(spec.monthlyCredits >= spec.packCredits * 5, key);
    assert.equal(spec.posts, spec.weeklyPosts);
    assert.equal(spec.oneTime, false);
  }
  const trial = catalog.weeklyPackageSpec('starter', 'trialing');
  assert.equal(trial.key, 'trial'); assert.equal(trial.oneTime, true);
  assert.equal(catalog.checkWeeklyAllowance(trial, { postsThisWeek: 0, trialPacksUsed: 1 }).allowed, false);
});
test('aliases resolve consistently; alternate mix never exceeds paid slots or video quota', () => {
  assert.equal(catalog.canonicalPlan('pro'), 'creator');
  assert.equal(catalog.canonicalPlan('enterprise'), 'agency');
  const spec = catalog.weeklyPackageSpec('creator', 'active');
  assert.equal(catalog.validateWeeklyMix(spec, { images: 7, motionReels: 0, aiVideos: 0 }).packCredits, 15);
  for (const mix of [{ images: 6, motionReels: 2, aiVideos: 0 }, { images: 6, motionReels: 0, aiVideos: 1 }, { images: -1, motionReels: 0, aiVideos: 0 }]) assert.throws(() => catalog.validateWeeklyMix(spec, mix));
  assert.equal(catalog.checkWeeklyAllowance(catalog.weeklyPackageSpec('business', 'past_due'), { postsThisWeek: 0, trialPacksUsed: 0 }).allowed, false);
  assert.equal(catalog.planFromPrice('unconfigured-price', {}), null);
});
function billingFixture() {
  let state = { sub: { organizationId: 'org', credits: 8, stripeCustomerId: 'cus', stripeSubscriptionId: 'sub', status: 'active' }, grants: [], events: {}, ledgers: [] }, tail = Promise.resolve();
  const tx = {
    $queryRaw: async () => [],
    subscription: { findUniqueOrThrow: async q => { assert.equal(q.where.organizationId, 'org'); return state.sub; }, update: async q => { assert.equal(q.where.organizationId, 'org'); const { credits, ...data } = q.data; if (credits) state.sub.credits += credits.increment; Object.assign(state.sub, data); return state.sub; } },
    creditGrant: { findFirst: async q => state.grants.find(x => x.organizationId === q.where.organizationId && x.externalRef === q.where.externalRef), create: async q => { state.grants.push(q.data); return q.data; } },
    creditLedger: { create: async q => { state.ledgers.push(q.data); return q.data; }, findFirst: async q => state.ledgers.find(row => row.organizationId === q.where.organizationId && q.where.referenceId.in.includes(row.referenceId) && row.reason === q.where.reason && row.delta > 0) },
    billingEvent: {
      upsert: async q => state.events[q.where.stripeEventId] ||= { ...q.create, processed: false },
      findUniqueOrThrow: async q => state.events[q.where.stripeEventId],
      update: async q => Object.assign(state.events[q.where.stripeEventId], q.data),
    },
  };
  const transaction = fn => { const run = tail.then(async () => { const before = structuredClone(state); try { return await fn(tx); } catch (e) { state = before; throw e; } }); tail = run.catch(() => {}); return run; };
  const api = load('lib/billing/events.ts', { '@/lib/prisma': { prisma: {} } });
  return { api, transaction, state: () => state };
}
test('concurrent/replayed invoices and separate paid-checkout events grant only once per purchase', async () => {
  const f = billingFixture(), action = { organizationId: 'org', customerId: 'cus', subscriptionId: 'sub', plan: 'creator', status: 'active', grant: { source: 'subscription', reference: 'invoice:one', plan: 'creator' } };
  await Promise.all([1, 2, 3].map(i => f.transaction(tx => f.api.applyBillingEvent(tx, { id: 'event' + i, type: 'invoice.paid' }, action))));
  assert.equal(f.state().sub.credits, 508); assert.equal(f.state().grants.length, 1);
  await f.transaction(tx => f.api.applyBillingEvent(tx, { id: 'event1', type: 'invoice.paid' }, action));
  assert.equal(f.state().ledgers.length, 1);
  const topup = { organizationId: 'org', grant: { source: 'topup', pack: 'small', reference: 'checkout:one' } };
  await f.transaction(tx => f.api.applyBillingEvent(tx, { id: 'top1', type: 'checkout.session.completed' }, topup));
  await f.transaction(tx => f.api.applyBillingEvent(tx, { id: 'top2', type: 'checkout.session.async_payment_succeeded' }, topup));
  assert.equal(f.state().sub.credits, 758); assert.equal(f.state().ledgers.length, 2);
});
test('failed or cross-customer billing updates remain unprocessed and retryable', async () => {
  const f = billingFixture(), event = { id: 'event-fail', type: 'customer.subscription.updated' };
  await assert.rejects(f.transaction(tx => f.api.applyBillingEvent(tx, event, { organizationId: 'org', customerId: 'foreign', subscriptionId: 'sub' })), /MISMATCH/);
  assert.equal(f.state().events[event.id], undefined);
  await f.transaction(tx => f.api.applyBillingEvent(tx, event, { organizationId: 'org', customerId: 'cus', subscriptionId: 'sub', plan: 'business', status: 'active' }));
  assert.equal(f.state().events[event.id].processed, true); assert.equal(f.state().sub.plan, 'business');
});
test('ended plans can restart and delayed cancellation never overwrites their replacement', async () => {
  const f = billingFixture(); f.state().sub.status = 'incomplete_expired';
  await f.transaction(tx => f.api.applyBillingEvent(tx, { id: 'replacement', type: 'customer.subscription.created' }, { organizationId: 'org', customerId: 'cus', subscriptionId: 'new-sub', plan: 'business', status: 'active' }));
  assert.equal(f.state().sub.stripeSubscriptionId, 'new-sub'); assert.equal(f.state().sub.status, 'active');
  await f.transaction(tx => f.api.applyBillingEvent(tx, { id: 'late-cancel', type: 'customer.subscription.deleted' }, { organizationId: 'org', customerId: 'cus', subscriptionId: 'sub', plan: 'creator', status: 'canceled' }));
  assert.equal(f.state().sub.stripeSubscriptionId, 'new-sub'); assert.equal(f.state().sub.plan, 'business'); assert.equal(f.state().sub.status, 'active');
});
test('legacy top-up ledger entries prevent duplicate grants from later payment events', async () => {
  const f = billingFixture(); f.state().ledgers.push({ organizationId: 'org', referenceId: 'cs_old', reason: 'credit_topup', delta: 250 });
  await f.transaction(tx => f.api.applyBillingEvent(tx, { id: 'late-topup', type: 'checkout.session.async_payment_succeeded' }, { organizationId: 'org', grant: { source: 'topup', pack: 'small', reference: 'checkout:cs_old' } }));
  assert.equal(f.state().sub.credits, 8); assert.equal(f.state().ledgers.length, 1); assert.equal(f.state().grants[0].credits, 250);
});
test('concurrent generation cannot overdraw a balance and rejects invalid costs', async () => {
  let credits = 5, debits = [];
  const tx = { subscription: { updateMany: async q => { assert.ok(q.where.credits.gte >= 0); if (credits < q.where.credits.gte) return { count: 0 }; credits -= q.data.credits.decrement; return { count: 1 }; }, findUniqueOrThrow: async () => ({ credits }) }, creditLedger: { create: async q => debits.push(q.data) } };
  const api = load('lib/services/credits.ts', { '@/lib/prisma': { prisma: { $transaction: fn => fn(tx) } } });
  const results = await Promise.allSettled([api.spendCredits('org', 4, 'generate'), api.spendCredits('org', 4, 'generate')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(credits, 1); assert.equal(debits.length, 1);
  await assert.rejects(api.spendCredits('org', -3, 'generate'), /INVALID/);
});
test('checkout rejects arbitrary prices and non-billing roles before Stripe access', async () => {
  let role = 'viewer';
  const api = load('app/api/billing/checkout/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/prisma': { prisma: {} },
    '@/lib/auth/context': { tenantContext: async () => ({ organizationId: 'org', role, isSuperAdmin: false }) },
  });
  const req = body => new Request('https://rumi.test', { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await api.POST(req({ plan: 'starter' }))).status, 403);
  role = 'owner';
  assert.equal((await api.POST(req({ priceId: 'price_attack' }))).status, 400);
});
test('checkout allows an ended subscription to restart but refuses another active subscription', async () => {
  const previous = process.env.STRIPE_SECRET_KEY; process.env.STRIPE_SECRET_KEY = 'browser-test-only';
  try {
    const sub = { organizationId: 'org', status: 'canceled', stripeSubscriptionId: 'old-sub', stripeCustomerId: 'cus' };
    let remote = [], created = 0;
    class StripeMock {
      prices = { retrieve: async () => ({ active: true, currency: 'usd', unit_amount: 1900, recurring: { interval: 'month', interval_count: 1 } }) };
      subscriptions = { list: async () => ({ data: remote }) };
      checkout = { sessions: { list: async () => ({ data: [] }), create: async () => { created++; return { url: 'https://checkout.stripe.com/c/pay/test' }; } } };
    }
    const tx = { $queryRaw: async () => [], subscription: { findUniqueOrThrow: async () => sub } };
    const api = load('app/api/billing/checkout/route.ts', {
      stripe: StripeMock,
      'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
      '@/lib/auth/context': { tenantContext: async () => ({ organizationId: 'org', role: 'owner', organization: { name: 'Business' } }) },
      '@/lib/prisma': { prisma: { subscription: { findUnique: async () => sub }, $transaction: fn => fn(tx) } },
      '@/lib/billing/packages': { ...catalog, configuredPlanPrice: () => 'price-intro' },
      '@/lib/billing/access': { canManageBilling: () => true, billingBaseUrl: () => 'https://rumi.test' },
    });
    const req = () => new Request('https://rumi.test', { method: 'POST', body: JSON.stringify({ plan: 'starter' }) });
    assert.equal((await api.POST(req())).status, 200); assert.equal(created, 1);
    remote = [{ status: 'active' }]; assert.equal((await api.POST(req())).status, 409); assert.equal(created, 1);
    remote = []; sub.status = 'active'; assert.equal((await api.POST(req())).status, 409); assert.equal(created, 1);
  } finally { if (previous === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previous; }
});
