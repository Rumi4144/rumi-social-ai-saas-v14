const { test } = require('node:test'), assert = require('node:assert/strict');
const { load } = require('./helpers/weekly-load.cjs');
const originalDate = '2026-10-26T12:00:00.000Z';
function fixture(options = {}) {
  const changes = [], audits = [], reads = [];
  const item = { id: 'draft', campaignId: 'campaign', status: 'draft', scheduledFor: new Date(originalDate), headline: 'Actual guitar', caption: 'Saved caption', mediaUrl: '/api/media/original', ...options.item };
  const tx = {
    contentItem: {
      findFirst: async q => { reads.push(q); assert.equal(q.where.campaign.brand.organizationId, 'own'); return options.missing ? null : item; },
      updateMany: async q => { assert.equal(q.where.id, 'draft'); assert.equal(q.where.campaignId, 'campaign'); assert.equal(q.where.status, 'draft'); assert.equal(q.where.scheduledFor, item.scheduledFor); if (options.race) return { count: 0 }; changes.push(q.data); Object.assign(item, q.data); return { count: 1 }; },
    },
    publishJob: { findFirst: async q => { assert.equal(q.where.organizationId, 'own'); assert.equal(q.where.contentItemId, 'draft'); return options.delivery ? { id: 'delivery', status: options.delivery } : null; } },
    job: { findFirst: async q => { assert.equal(q.where.organizationId, 'own'); assert.equal(q.where.type, 'WEEKLY_PACK'); assert.equal(q.where.payload.equals, 'campaign'); return options.weeklyPack ? { id: 'pack' } : null; } },
    auditLog: { create: async q => { audits.push(q.data); } },
  };
  const api = load('app/api/content-items/[id]/planned-date/route.ts', {
    'next/server': { NextResponse: { json: (body, opts = {}) => ({ body, status: opts.status || 200 }) } },
    '@/lib/auth/context': { tenantContext: async () => ({ organizationId: 'own', userId: 'admin', isSuperAdmin: options.admin !== false }) },
    '@/lib/prisma': { prisma: { $transaction: async (fn, opts) => { assert.equal(opts.isolationLevel, 'Serializable'); return fn(tx); } } },
  });
  const send = (body = {}, origin = 'https://app.test') => api.PATCH(new Request('https://app.test/api/content-items/draft/planned-date', { method: 'PATCH', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ plannedDate: null, expectedScheduledFor: originalDate, ...body }) }), { params: Promise.resolve({ id: 'draft' }) });
  return { item, changes, audits, reads, send };
}
test('Admin can remove one old draft from the weekly calendar while preserving content and history', async () => {
  const f = fixture(), before = { ...f.item };
  const result = await f.send();
  assert.equal(result.status, 200); assert.equal(f.item.scheduledFor, null);
  assert.deepEqual(f.item, { ...before, scheduledFor: null });
  assert.deepEqual(Object.keys(f.changes[0]), ['scheduledFor']);
  assert.equal(f.audits.length, 1); assert.equal(f.audits[0].organizationId, 'own'); assert.equal(f.audits[0].resourceId, 'draft');
  assert.equal(f.audits[0].metadata.before, originalDate); assert.equal(f.audits[0].metadata.after, null);
});
test('an unassigned draft can receive a new date without approving or scheduling delivery', async () => {
  const f = fixture({ item: { scheduledFor: null } });
  assert.equal((await f.send({ plannedDate: '2026-11-01', expectedScheduledFor: null })).status, 200);
  assert.equal(f.item.scheduledFor.toISOString(), '2026-11-01T12:00:00.000Z'); assert.equal(f.item.status, 'draft');
  assert.deepEqual(Object.keys(f.changes[0]), ['scheduledFor']);
});
test('permissions, tenant boundaries, approval, any delivery history and weekly packs block date changes', async () => {
  for (const [options, status] of [[{ admin: false }, 403], [{ missing: true }, 404], [{ item: { status: 'approved' } }, 409], [{ item: { status: 'scheduled' } }, 409], [{ item: { status: 'published' } }, 409], [{ delivery: 'failed' }, 409], [{ delivery: 'published' }, 409], [{ weeklyPack: true }, 409], [{ race: true }, 409]]) {
    const f = fixture(options); assert.equal((await f.send()).status, status, JSON.stringify(options)); assert.equal(f.changes.length, 0); assert.equal(f.audits.length, 0);
    if (options.admin === false) assert.equal(f.reads.length, 0);
  }
});
test('cross-origin, invalid dates, stale dates and attempts to change status are rejected', async () => {
  for (const body of [{ plannedDate: '2026-02-30' }, { plannedDate: 'not-a-date' }, { plannedDate: '' }, { status: 'approved' }]) {
    const f = fixture(); assert.equal((await f.send(body)).status, 400); assert.equal(f.changes.length, 0);
  }
  const stale = fixture(); assert.equal((await stale.send({ expectedScheduledFor: null })).status, 409); assert.equal(stale.changes.length, 0);
  const foreign = fixture(); assert.equal((await foreign.send({}, 'https://other.test')).status, 403); assert.equal(foreign.reads.length, 0);
});
test('saving the existing date does not create another history entry', async () => {
  const f = fixture(); assert.equal((await f.send({ plannedDate: '2026-10-26' })).status, 200); assert.equal(f.changes.length, 0); assert.equal(f.audits.length, 0);
});
