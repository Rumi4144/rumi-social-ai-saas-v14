const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers/weekly-load.cjs');
const access = load('lib/billing/admin-access.ts');
test('week and calendar-month grants expire exactly and clamp month-end dates', () => {
  assert.equal(access.accessGrant('week', new Date('2026-11-02T14:30:00Z')).expiresAt, '2026-11-09T14:30:00.000Z');
  assert.equal(access.accessGrant('month', new Date('2027-01-31T14:30:00Z')).expiresAt, '2027-02-28T14:30:00.000Z');
  const grant = access.accessGrant('month', new Date('2026-11-02T14:30:00Z'));
  const sub = { plan: 'starter', status: 'active', credits: 3000 };
  assert.equal(access.creationPackageSpec(sub, grant, new Date('2026-12-02T14:29:59Z')).canGenerate, true);
  assert.equal(access.creationPackageSpec(sub, grant, new Date(grant.expiresAt)).canGenerate, false);
  assert.equal(sub.credits, 3000);
  assert.equal(access.creationPackageSpec({ ...sub, status: 'canceled' }, grant, new Date(grant.startsAt)).canGenerate, false);
  assert.equal(access.creationPackageSpec(sub, null).canGenerate, true);
});
test('only Admin can grant access; unrelated balance saves preserve the expiration', async () => {
  const writes = []; let authorized = false;
  const tx = {
    $queryRaw: async () => [],
    job: { upsert: async args => { writes.push(args); return args.create; } },
    subscription: { findUnique: async () => ({ id: 'sub', plan: 'starter', status: 'active', credits: 3000 }), upsert: async args => ({ id: 'sub', ...args.update }) },
    auditLog: { create: async () => ({}) },
    creditLedger: { create: async () => { throw new Error('Access must not change credits'); } },
  };
  const api = load('app/api/admin/organizations/[id]/subscription/route.ts', {
    '@/lib/prisma': { prisma: { organization: { findUnique: async () => ({ id: 'org' }) }, $transaction: async fn => fn(tx) } },
    '@/lib/admin/context': { superAdminContext: async () => { if (!authorized) throw new Error('FORBIDDEN'); return { id: 'admin' }; } },
  });
  const save = duration => api.PATCH(new Request('https://app.test', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'starter', status: 'trialing', credits: 3000, accessDuration: duration }) }), { params: Promise.resolve({ id: 'org' }) });
  assert.equal((await save('week')).status, 403); assert.equal(writes.length, 0);
  authorized = true;
  const response = await save('week'); assert.equal(response.status, 200);
  assert.equal((await response.json()).subscription.status, 'active');
  assert.equal(writes.length, 1); assert.equal(writes[0].create.organizationId, 'org');
  assert.equal(access.readAccess(writes[0].create.payload).duration, 'week');
  assert.equal((await save('keep')).status, 200); assert.equal(writes.length, 1);
  assert.equal((await save('ongoing')).status, 200); assert.equal(access.readAccess(writes.at(-1).create.payload), null);
});
