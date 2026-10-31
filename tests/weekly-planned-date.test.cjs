const { test } = require('node:test'), assert = require('node:assert/strict');
const { load } = require('./helpers/weekly-load.cjs');
function fixture(options = {}) {
  const changes = [], audits = [], reads = [];
  const item = { id: 'post', campaignId: 'campaign', status: 'draft', scheduledFor: new Date('2026-11-02T12:00:00Z'), headline: 'Real guitar', caption: 'Saved caption', mediaUrl: '/api/media/art', ...options.item };
  const pack = { id: 'pack', payload: { version: 1, brandId: 'brand', campaignId: 'campaign', weekStart: '2026-11-02', slots: [{ key: 'slot', date: '2026-11-02' }] }, result: { items: [{ slotKey: options.wrongSlot ? 'wrong' : 'slot', contentItemId: 'post' }] } };
  let saved = options.savedDate ? { id: 'weekly-date-post', payload: { plannedDate: options.savedDate } } : null;
  const tx = {
    contentItem: {
      findFirst: async q => { reads.push(q); assert.equal(q.where.campaign.brand.organizationId, 'own'); return options.missing ? null : item; },
      updateMany: async q => { assert.equal(q.where.id, 'post'); assert.equal(q.where.campaignId, 'campaign'); assert.equal(q.where.status, item.status); assert.equal(q.where.scheduledFor, item.scheduledFor); if (options.race) return { count: 0 }; changes.push(q.data); Object.assign(item, q.data); return { count: 1 }; },
    },
    publishJob: { findFirst: async q => { assert.equal(q.where.organizationId, 'own'); assert.equal(q.where.contentItemId, 'post'); return q.where.status.in.includes(options.delivery) ? { id: 'delivery' } : null; } },
    job: {
      findFirst: async q => { assert.equal(q.where.organizationId, 'own'); return q.where.type === 'WEEKLY_PACK' ? options.noPack ? null : pack : saved; },
      create: async q => { assert.equal(q.data.organizationId, 'own'); saved = q.data; changes.push(['date', q.data]); },
      update: async q => { assert.equal(q.where.id, saved.id); saved = { ...saved, ...q.data }; changes.push(['date', q.data]); },
    },
    auditLog: { create: async q => audits.push(q.data) },
  };
  const api = load('app/api/weekly/items/[id]/date/route.ts', {
    'next/server': { NextResponse: { json: (body, opts = {}) => ({ body, status: opts.status || 200 }) } },
    '@/lib/auth/context': { tenantContext: async () => ({ organizationId: 'own', userId: 'member', role: options.viewer ? 'viewer' : 'member' }) },
    '@/lib/prisma': { prisma: { $transaction: async (fn, opts) => { assert.equal(opts.isolationLevel, 'Serializable'); return fn(tx); } } },
  });
  const send = (body = {}, origin = 'https://app.test') => api.PATCH(new Request('https://app.test/api/weekly/items/post/date', { method: 'PATCH', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ plannedDate: '2026-11-10', expectedDate: '2026-11-02', ...body }) }), { params: Promise.resolve({ id: 'post' }) });
  return { send, changes, audits, reads, item, pack, saved: () => saved };
}
test('a customer changes a draft or approved date without moving its original pack, changing approval, publishing or charging', async () => {
  for (const status of ['draft', 'approved']) {
    const f = fixture({ item: { status } }), packBefore = JSON.stringify(f.pack), contentBefore = { ...f.item };
    assert.equal((await f.send()).status, 200);
    assert.equal(f.item.scheduledFor.toISOString(), '2026-11-10T12:00:00.000Z');
    assert.deepEqual(f.item, { ...contentBefore, scheduledFor: f.item.scheduledFor });
    assert.equal(JSON.stringify(f.pack), packBefore, 'Changing the date must not rewrite the original pack or its item mapping');
    assert.equal(f.saved().payload.plannedDate, '2026-11-10');
    assert.equal(f.audits[0].metadata.before, '2026-11-02'); assert.equal(f.audits[0].metadata.after, '2026-11-10');
    assert.equal(f.audits[0].organizationId, 'own');
  }
});
test('viewers, foreign items, invalid pack membership, delivery activity and concurrency prevent edits', async () => {
  for (const [options, status] of [[{ viewer: true }, 403], [{ missing: true }, 404], [{ noPack: true }, 409], [{ wrongSlot: true }, 409], [{ item: { status: 'published' } }, 409], [{ item: { status: 'scheduled' } }, 409], [{ race: true }, 409], ...['scheduled', 'retry', 'publishing', 'processing', 'verification_pending', 'published'].map(delivery => [{ delivery }, 409])]) {
    const f = fixture(options); assert.equal((await f.send()).status, status, JSON.stringify(options)); assert.equal(f.changes.length, 0); assert.equal(f.audits.length, 0);
  }
});
test('date edits reject invalid calendar dates, cross-origin writes, stale values and extra status fields', async () => {
  for (const body of [{ plannedDate: '2026-02-30' }, { plannedDate: '' }, { plannedDate: null }, { expectedDate: 'bad' }, { status: 'approved' }]) {
    const f = fixture(); assert.equal((await f.send(body)).status, 400); assert.equal(f.changes.length, 0);
  }
  const foreign = fixture(); assert.equal((await foreign.send({}, 'https://foreign.test')).status, 403); assert.equal(foreign.reads.length, 0);
  const stale = fixture({ savedDate: '2026-11-05' }); assert.equal((await stale.send()).status, 409); assert.equal(stale.changes.length, 0);
});
test('an existing planned date is updated once and an identical retry has no further writes', async () => {
  const f = fixture({ savedDate: '2026-11-05' });
  assert.equal((await f.send({ expectedDate: '2026-11-05' })).status, 200);
  const count = f.changes.length;
  assert.equal((await f.send({ expectedDate: '2026-11-10' })).status, 200);
  assert.equal(f.changes.length, count); assert.equal(f.audits.length, 1);
});
