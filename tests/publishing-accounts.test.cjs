const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..');

function fixture() {
  const ctx = { organizationId: 'org', role: 'owner' }, calls = [], jobs = [], settings = [];
  const item = { id: 'post', type: 'reel', status: 'approved', mediaUrl: '/api/video/media/reel', headline: 'Rumi reel', caption: 'Selected caption', campaign: { title: 'Rumi', brand: { organizationId: 'org' } } };
  const connections = [{ id: 'x', provider: 'x', externalId: 'x-account' }, { id: 'youtube', provider: 'youtube', externalId: 'yt-channel' }].map(c => ({ ...c, organizationId: 'org', status: 'connected', accountName: 'Rumi Guitars' }));
  const matches = (row, where = {}) => row && Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object') return 'in' in value ? value.in.includes(row[key]) : matches(row[key], value);
    return row[key] === value;
  });
  const prisma = {
    contentItem: {
      findFirst: async ({ where }) => matches(item, where) ? item : null,
      findMany: async ({ where }) => matches(item, where) ? [item] : [],
      update: async ({ data }) => Object.assign(item, data),
    },
    socialConnection: {
      findFirst: async ({ where }) => connections.find(c => matches(c, where)) || null,
      findMany: async ({ where }) => connections.filter(c => matches(c, where)),
    },
    publishJob: {
      findFirst: async ({ where }) => jobs.find(j => matches(j, where)) || null,
      findMany: async ({ where }) => jobs.filter(j => matches(j, where)),
      create: async ({ data }) => { const job = { id: `job-${jobs.length}`, status: 'scheduled', externalPostId: null, ...data }; jobs.push(job); return job; },
      update: async ({ where, data }) => Object.assign(jobs.find(j => matches(j, where)), data),
      upsert: async ({ where, create }) => jobs.find(j => matches(j, where)) || prisma.publishJob.create({ data: create }),
    },
    publishAttempt: { create: async () => ({}) },
    job: {
      create: async ({ data }) => { settings.push(data); return data; },
      upsert: async ({ create }) => { settings.push(create); return create; },
      findMany: async () => [],
    },
  };
  prisma.$transaction = async fn => fn(prisma);
  const react = require('react');
  const mocks = {
    '@/lib/prisma': { prisma }, '@/lib/auth/context': { tenantContext: async () => ctx },
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/x/publishing': { prepareXPost: async () => ({ fingerprint: 'snapshot' }), XPublishError: Error },
    '@/lib/tiktok/prepare': { prepareTikTokSettings: async () => { throw Error('Unexpected TikTok'); } },
    '@/lib/publishing/google-business': { googleBusinessPost: () => {} },
    '@/lib/publishing/providers': { publishToProvider: async input => { calls.push(input); return { ok: true, externalId: input.platform === 'x' ? '123456' : 'yt-video' }; } },
    './PublishingActions': { __esModule: true, default: props => react.createElement('div', { 'data-destination': props.connectionId, 'data-delivery': props.existingDelivery?.status || 'available' }) },
    './YouTubeUpload': { __esModule: true, default: () => null },
  };
  function load(file) {
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, console, Date, URL, process, require: name => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      if (name.startsWith('.')) return load(path.join(path.dirname(file), name) + '.ts');
      return require(name);
    } });
    return module.exports;
  }
  const youtube = { certified: true, privacy: 'public', madeForKids: false, containsSyntheticMedia: true };
  async function run(route, connectionId = 'youtube', extra = {}) {
    const payload = { contentItemId: 'post', socialConnectionId: connectionId, socialConnectionIds: [connectionId], scheduledFor: new Date(Date.now() + 3600000).toISOString(), ...(connectionId === 'youtube' ? { youtube } : {}), ...extra };
    return load(`app/api/publishing/${route}/route.ts`).POST(new Request('https://app.test/api/publishing/' + route, { method: 'POST', body: JSON.stringify(payload) }));
  }
  return { ctx, item, connections, calls, jobs, settings, run, load };
}

test('the same approved reel posts to X and then YouTube without reapproval; repeat requests reuse the delivery', async () => {
  const f = fixture();
  assert.equal((await f.run('now', 'x')).status, 200);
  assert.equal(f.item.status, 'published');
  assert.equal((await f.run('now')).status, 200);
  assert.deepEqual(f.calls.map(c => c.platform), ['x', 'youtube']);
  assert.ok(f.calls.every(c => c.mediaUrl === '/api/video/media/reel' && c.caption === 'Selected caption'));
  const options = f.settings.find(s => s.type === 'YOUTUBE_CAMPAIGN_SETTINGS').payload;
  assert.equal(options.certified, true); assert.equal(options.privacy, 'public'); assert.equal(options.madeForKids, false); assert.equal(options.containsSyntheticMedia, true);
  const repeat = await f.run('now');
  assert.equal(repeat.status, 200); assert.equal((await repeat.json()).externalPostId, 'yt-video');
  assert.equal(f.calls.length, 2); assert.equal(f.jobs.length, 2);
});

test('a published reel remains available for scheduling to another account without resetting published status', async () => {
  const f = fixture(); await f.run('now', 'x');
  assert.equal((await f.run('schedule')).status, 201);
  assert.equal(f.item.status, 'published'); assert.equal(f.calls.length, 1);
  const duplicate = await f.run('schedule');
  assert.equal(duplicate.status, 409); assert.equal(f.jobs.length, 2);
  assert.match((await duplicate.json()).error, /Already scheduled/);
  assert.equal((await f.run('now')).status, 202); assert.equal(f.calls.length, 1);
});

test('scheduling X does not prevent immediately uploading the same approved reel to YouTube', async () => {
  const f = fixture(); assert.equal((await f.run('schedule', 'x')).status, 201);
  assert.equal(f.item.status, 'scheduled');
  assert.equal((await f.run('now')).status, 200);
  assert.deepEqual(f.calls.map(c => c.platform), ['youtube']);
});

test('drafts, withdrawn approval, foreign content, disconnected accounts, viewers and missing YouTube consent cannot publish or schedule', async () => {
  for (const route of ['now', 'schedule']) for (const [change, extra] of [
    [f => { f.item.status = 'draft'; }],
    [f => { f.item.status = 'rejected'; }],
    [f => { f.item.campaign.brand.organizationId = 'foreign'; }],
    [f => { f.ctx.role = 'viewer'; }],
    [f => { f.connections[1].status = 'disconnected'; }],
    [f => {}, { youtube: undefined }],
  ]) {
    const f = fixture(); change(f);
    const response = await f.run(route, 'youtube', extra);
    assert.ok(response.status >= 400); assert.equal(f.calls.length, 0); assert.equal(f.jobs.length, 0);
  }
});

test('active or completed delivery is reserved only for its own account; failed attempts remain retryable', async () => {
  for (const status of ['scheduled', 'publishing', 'retry', 'processing', 'verification_pending', 'published']) {
    const f = fixture(); f.item.status = 'published';
    f.jobs.push({ id: 'previous', organizationId: 'org', contentItemId: 'post', socialConnectionId: 'youtube', status, externalPostId: 'previous-video' });
    assert.ok([200, 202].includes((await f.run('now')).status));
    assert.equal(f.calls.length, 0); assert.equal(f.jobs.length, 1);
    assert.equal((await f.run('schedule')).status, 409);
    assert.equal((await f.run('now', 'x')).status, 200);
    assert.deepEqual(f.calls.map(c => c.platform), ['x']);
  }
  const f = fixture(); f.item.status = 'published';
  f.jobs.push({ id: 'failed', organizationId: 'org', contentItemId: 'post', socialConnectionId: 'youtube', status: 'failed' });
  assert.equal((await f.run('now')).status, 200); assert.equal(f.calls.length, 1);
});

test('refreshing Publishing retains a reel posted to X with YouTube still available; drafts are excluded', async () => {
  const f = fixture(); await f.run('now', 'x');
  const render = require('react-dom/server').renderToStaticMarkup;
  let html = render(await f.load('app/publishing/page.tsx').default());
  assert.match(html, /data-destination="x" data-delivery="published"/);
  assert.match(html, /data-destination="youtube" data-delivery="available"/);
  await f.run('now'); html = render(await f.load('app/publishing/page.tsx').default());
  assert.match(html, /data-destination="youtube" data-delivery="published"/);
  f.item.status = 'draft'; html = render(await f.load('app/publishing/page.tsx').default());
  assert.ok(!html.includes('data-destination='));
});
