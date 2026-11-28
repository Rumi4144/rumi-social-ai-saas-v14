// Runs only against the explicitly supplied disposable TEST_DATABASE_URL.
// The production DATABASE_URL is deliberately not a fallback.
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { load } = require('./helpers/weekly-load.cjs');

test('Postgres serializes concurrent invoice grants and prevents credit overdrafts', {
  skip: !process.env.TEST_DATABASE_URL,
  timeout: 30000,
}, async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
  const suffix = randomUUID();
  const organizationId = `credit-integration-${suffix}`;
  try {
    await prisma.organization.create({ data: { id: organizationId, name: 'Disposable credit integration', slug: organizationId, subscription: { create: { credits: 10, plan: 'starter', status: 'active' } } } });
    const mocks = { '@/lib/prisma': { prisma } };
    const { applyBillingEvent } = load('lib/billing/events.ts', mocks);
    const { spendCredits } = load('lib/services/credits.ts', mocks);
    const action = { organizationId, grant: { source: 'topup', pack: 'small', reference: `checkout:${suffix}` } };
    const event = id => ({ id: `${suffix}-${id}`, type: 'checkout.session.completed' });
    // Different Stripe event IDs for one purchase still grant only once.
    await Promise.all([1, 2, 3].map(id => prisma.$transaction(tx => applyBillingEvent(tx, event(id), action))));
    let sub = await prisma.subscription.findUniqueOrThrow({ where: { organizationId } });
    assert.equal(sub.credits, 260);
    assert.equal(await prisma.creditGrant.count({ where: { organizationId } }), 1);
    assert.equal(await prisma.creditLedger.count({ where: { organizationId } }), 1);
    // Replaying the exact event also leaves the ledger untouched.
    const replay = await prisma.$transaction(tx => applyBillingEvent(tx, event(1), action));
    assert.equal(replay.duplicate, true);
    const spends = await Promise.allSettled([spendCredits(organizationId, 200, 'integration'), spendCredits(organizationId, 200, 'integration')]);
    assert.equal(spends.filter(result => result.status === 'fulfilled').length, 1);
    const rejection = spends.find(result => result.status === 'rejected');
    assert.match(rejection.reason.message, /INSUFFICIENT_CREDITS/);
    sub = await prisma.subscription.findUniqueOrThrow({ where: { organizationId } });
    assert.equal(sub.credits, 60);
    const ledger = await prisma.creditLedger.findMany({ where: { organizationId }, orderBy: { createdAt: 'asc' } });
    assert.equal(ledger.length, 2);
    assert.equal(ledger.reduce((total, row) => total + row.delta, 10), sub.credits);
  } finally {
    // Every record is scoped to the generated fixture workspace.
    await prisma.$transaction([
      prisma.billingEvent.deleteMany({ where: { organizationId } }),
      prisma.creditGrant.deleteMany({ where: { organizationId } }),
      prisma.creditLedger.deleteMany({ where: { organizationId } }),
      prisma.subscription.deleteMany({ where: { organizationId } }),
      prisma.organization.deleteMany({ where: { id: organizationId } }),
    ]).finally(() => prisma.$disconnect());
  }
});
