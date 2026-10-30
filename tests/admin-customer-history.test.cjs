const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, allowStub = false) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Error, URL, Buffer, Request, Response, console, process: { env: {} }, require: name => name in mocks ? mocks[name] : allowStub && name.startsWith('@/') ? {} : require(name) });
  return module.exports;
}
const replies = { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }), redirect: (url, status) => ({ url: String(url), status }) } };

test('all advanced creative mutations reject a customer before reading input or starting generation', async () => {
  const routes = [
    'creative/render', 'creative/generate-image', 'creative/select-photo', 'brand-brain', 'brand-brain/learn',
    'products/select-photo', 'video/select', 'video/reuse', 'reels/week', 'reels/scene-photo', 'video/queue', 'video/presenter', 'video/presenter/script', 'content-items/[id]', 'content-items/[id]/regenerate-caption',
  ];
  for (const route of routes) {
    const module = load(`app/api/${route}/route.ts`, { 'next/server': replies, '@/lib/auth/context': { tenantContext: async () => ({ organizationId: 'org-a', role: 'owner', isSuperAdmin: false }) } }, true);
    const request = { url: 'https://rumi.test/api/creative', headers: new Headers({ origin: 'https://rumi.test' }), json() { throw new Error('Should not read creative instructions'); } };
    const result = await (module.POST || module.PATCH)(request, { params: Promise.resolve({ id: 'item-a' }) });
    assert.equal(result.status, 403, route);
  }
});

test('customer cannot browse the archived creative libraries through their APIs', async () => {
  for (const route of ['reels/library', 'video/reuse']) {
    const module = load(`app/api/${route}/route.ts`, { 'next/server': replies, '@/lib/auth/context': { tenantContext: async () => ({ organizationId: 'org-a', role: 'owner', isSuperAdmin: false }) } }, true);
    assert.equal((await module.GET(new Request('https://rumi.test/api/library'))).status, 403);
  }
});

test('advanced page boundary redirects customers and keeps master-admin access', async () => {
  for (const [error, redirect] of [['FORBIDDEN', '/dashboard'], ['UNAUTHENTICATED', '/login']]) {
    const boundary = load('components/AdminCreativeBoundary.tsx', { '@/lib/admin/context': { superAdminContext: async () => { throw new Error(error); } }, 'next/navigation': { redirect: url => { throw new Error(`redirect:${url}`); } } });
    await assert.rejects(boundary.default({ children: 'private designs' }), { message: `redirect:${redirect}` });
  }
  const boundary = load('components/AdminCreativeBoundary.tsx', { '@/lib/admin/context': { superAdminContext: async () => ({ id: 'admin' }) }, 'next/navigation': { redirect() { throw new Error('Unexpected redirect'); } } });
  assert.equal(await boundary.default({ children: 'private designs' }), 'private designs');
});

function historyFixture() {
  const source = [
    { id: 'a-post', org: 'org-a', status: 'draft', headline: 'A product', createdAt: new Date('2026-10-10'), campaign: { id: 'a-campaign', title: 'A week', brand: { name: 'A' } } },
    { id: 'a-legacy', org: 'org-a', status: 'published', headline: 'A legacy post', createdAt: new Date('2026-09-10'), campaign: { id: 'a-campaign', title: 'A week', brand: { name: 'A' } } },
    { id: 'b-post', org: 'org-b', status: 'published', headline: 'B private', createdAt: new Date('2026-10-11'), campaign: { id: 'b-campaign', title: 'B week', brand: { name: 'B' } } },
  ];
  const deliveries = [
    { id: 'a-success', organizationId: 'org-a', contentItemId: 'a-post', status: 'published', platform: 'x', externalPostId: '123', socialConnectionId: 'a-account' },
    { id: 'a-failed', organizationId: 'org-a', contentItemId: 'a-post', status: 'failed', platform: 'youtube', externalPostId: null, socialConnectionId: 'a-account', lastError: 'Try again' },
    { id: 'b-success', organizationId: 'org-b', contentItemId: 'b-post', status: 'published', socialConnectionId: 'b-account' },
  ];
  const calls = [];
  const prisma = {
    $queryRaw: async query => { calls.push(query); assert.equal(query.values[0], query.values[1]); assert.equal(query.values.at(-1), 26); assert.match(query.sql, /EXISTS/); return source.filter(row => row.org === query.values[0] && (row.status === 'published' || deliveries.some(d => d.contentItemId === row.id && d.status === 'published'))).map(({ id }) => ({ id })); },
    contentItem: { findFirst: async ({ where }) => source.find(row => row.id === where.id && row.org === where.campaign.brand.organizationId) || null,
      findMany: async args => { assert.equal(args.take, 25); return source.filter(row => args.where.id.in.includes(row.id) && row.org === args.where.campaign.brand.organizationId); } },
    publishJob: { findMany: async args => { assert.equal(args.take, 501); return deliveries.filter(row => row.organizationId === args.where.organizationId && args.where.contentItemId.in.includes(row.contentItemId)); } },
    socialConnection: { findMany: async ({ where }) => [{ id: `${where.organizationId === 'org-a' ? 'a' : 'b'}-account`, accountName: where.organizationId }] },
  };
  return { source, deliveries, calls, prisma };
}
function historyModule(prisma, superAdminContext = async () => ({ id: 'admin' })) {
  return load('lib/admin/customer-history.ts', { '@/lib/prisma': { prisma }, '@/lib/admin/context': { superAdminContext }, '@/lib/publishing/eligibility': load('lib/publishing/eligibility.ts') });
}
test('archive includes legacy and delivery-confirmed posts, preserves partial outcomes, and never mixes customers or changes records', async () => {
  const fixture = historyFixture(), original = JSON.stringify([fixture.source, fixture.deliveries]);
  const service = historyModule(fixture.prisma);
  const a = await service.publishedCustomerHistory('org-a');
  assert.deepEqual(Array.from(a.items, row => row.id), ['a-post', 'a-legacy']);
  assert.equal(a.items[0].deliveries.length, 2);
  assert.equal(a.items[0].deliveries[0].link, 'https://x.com/i/status/123');
  assert.equal(a.items[0].deliveries[1].status, 'failed');
  const b = await service.publishedCustomerHistory('org-b');
  assert.deepEqual(Array.from(b.items, row => row.id), ['b-post']);
  assert.equal(JSON.stringify([fixture.source, fixture.deliveries]), original);
  const queries = fixture.calls.length;
  assert.equal((await service.publishedCustomerHistory('org-a', 'b-post')).items.length, 0);
  assert.equal(fixture.calls.length, queries, 'Foreign customer cursor must not run archive query');
});
test('archive and request service deny non-admin before any data reads', async () => {
  const service = historyModule({}, async () => { throw new Error('FORBIDDEN'); });
  await assert.rejects(service.adminCustomerSelection('org-a'), { message: 'FORBIDDEN' });
  await assert.rejects(service.publishedCustomerHistory('org-a'), { message: 'FORBIDDEN' });
  await assert.rejects(service.customerChangeRequests('org-a'), { message: 'FORBIDDEN' });
  await assert.rejects(service.customerDeliveryHistory('org-a', 'post-a'), { message: 'FORBIDDEN' });
});

test('archive uses bounded source and delivery pages, with an independently scoped detail cursor', async () => {
  const fixture = historyFixture();
  for (let i = 0; i < 30; i++) fixture.source.push({ ...fixture.source[1], id: `extra-${i}` });
  const service = historyModule(fixture.prisma), page = await service.publishedCustomerHistory('org-a');
  assert.equal(page.items.length, 25);
  assert.ok(page.nextCursor);
  const calls = [];
  fixture.prisma.publishJob = {
    findFirst: async ({ where }) => { calls.push(where); return null; },
    findMany: async args => { calls.push(args); assert.equal(args.where.organizationId, 'org-a'); assert.equal(args.where.contentItemId, 'a-post'); assert.equal(args.take, 26); return fixture.deliveries.filter(row => row.organizationId === 'org-a'); },
  };
  const detail = await service.customerDeliveryHistory('org-a', 'a-post');
  assert.equal(detail.deliveries.length, 2);
  assert.equal(await service.customerDeliveryHistory('org-a', 'b-post'), null);
  const foreignCursor = await service.customerDeliveryHistory('org-a', 'a-post', 'b-success');
  assert.equal(foreignCursor.deliveries.length, 0);
  assert.equal(calls.at(-1).organizationId, 'org-a');
  assert.equal(calls.at(-1).contentItemId, 'a-post');
});

test('completing requests verifies customer and source ownership, audits once, and leaves original post unchanged', async () => {
  const source = { id: 'post-a', status: 'draft' }, jobs = [{ id: 'request-a', organizationId: 'org-a', status: 'pending', payload: { contentItemId: source.id } }], audits = [];
  const tx = {
    job: { findFirst: async ({ where }) => jobs.find(job => job.id === where.id && job.organizationId === where.organizationId), updateMany: async ({ where, data }) => { const job = jobs.find(job => job.id === where.id && job.organizationId === where.organizationId && job.status === where.status); if (!job) return { count: 0 }; Object.assign(job, data); return { count: 1 }; } },
    contentItem: { findFirst: async ({ where }) => where.id === source.id && where.campaign.brand.organizationId === 'org-a' ? source : null },
    auditLog: { create: async ({ data }) => audits.push(data) },
  };
  const route = load('app/api/admin/requests/[id]/complete/route.ts', { 'next/server': replies, '@/lib/admin/context': { superAdminContext: async () => ({ id: 'admin' }) }, '@/lib/prisma': { prisma: { $transaction: fn => fn(tx) } }, '@/lib/http/errors': { apiError: error => { throw error; } } });
  const request = org => new Request('https://rumi.test/api/admin/requests/request-a/complete', { method: 'POST', headers: { origin: 'https://rumi.test' }, body: new URLSearchParams({ organizationId: org, changesReviewed: 'yes' }) });
  assert.equal((await route.POST(request('org-b'), { params: Promise.resolve({ id: 'request-a' }) })).status, 404);
  assert.equal(jobs[0].status, 'pending');
  source.status = 'approved';
  assert.equal((await route.POST(request('org-a'), { params: Promise.resolve({ id: 'request-a' }) })).status, 409);
  assert.equal(jobs[0].status, 'pending');
  source.status = 'draft';
  assert.equal((await route.POST(request('org-a'), { params: Promise.resolve({ id: 'request-a' }) })).status, 303);
  assert.equal(jobs[0].status, 'succeeded');
  assert.equal(source.status, 'draft');
  assert.equal(audits[0].organizationId, 'org-a');
  await route.POST(request('org-a'), { params: Promise.resolve({ id: 'request-a' }) });
  assert.equal(audits.length, 1);
});

test('request completion rejects ordinary users before transactions and rejects cross-site submissions', async () => {
  const apiError = load('lib/http/errors.ts', { 'next/server': replies }).apiError;
  for (const error of ['FORBIDDEN', 'UNAUTHENTICATED']) {
    const route = load('app/api/admin/requests/[id]/complete/route.ts', { 'next/server': replies, '@/lib/admin/context': { superAdminContext: async () => { throw new Error(error); } }, '@/lib/prisma': { prisma: {} }, '@/lib/http/errors': { apiError } });
    assert.equal((await route.POST({}, { params: Promise.resolve({ id: 'request' }) })).status, error === 'FORBIDDEN' ? 403 : 401);
  }
  const route = load('app/api/admin/requests/[id]/complete/route.ts', { 'next/server': replies, '@/lib/admin/context': { superAdminContext: async () => ({ id: 'admin' }) }, '@/lib/prisma': { prisma: {} }, '@/lib/http/errors': { apiError } });
  assert.equal((await route.POST(new Request('https://rumi.test/complete', { method: 'POST', headers: { origin: 'https://another.test' } }), { params: Promise.resolve({ id: 'request' }) })).status, 403);
});
