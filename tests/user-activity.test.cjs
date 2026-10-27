const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Date, URL, Request, Response, crypto: require('node:crypto').webcrypto, process, console, require: name => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      if (name.startsWith('.')) return load(path.join(path.dirname(file), name) + '.ts');
      return require(name);
    } });
    cache.set(file, module.exports); return module.exports;
  }
  return load;
}
const session = loader()('lib/activity/session.ts');
const start = new Date('2026-10-26T18:00:00Z');
const at = seconds => new Date(start.getTime() + seconds * 1000);
const check = (tabId = 'a', visible = true, idleSeconds = 0) => ({ tabId, visible, idleSeconds });

test('a legacy cookie starts tracking without inventing a login time; empty visits show offline', () => {
  const value = session.newActivitySession(null, start);
  assert.equal(value.signedInAt, null);
  assert.equal(value.trackingStartedAt, start.toISOString());
  assert.equal(session.activityStatus(value, start), 'Offline');
  assert.equal(session.sessionSpanSeconds(value), 0);
});

test('online, idle and offline follow actual check-ins; idle and long gaps do not accumulate active time', () => {
  let value = session.newActivitySession(start.toISOString(), start);
  value = session.applyCheckIn(value, check(), start);
  assert.equal(session.activityStatus(value, at(20)), 'Online');
  value = session.applyCheckIn(value, check(), at(30));
  assert.equal(value.activeSeconds, 30);
  value = session.applyCheckIn(value, check('a', false), at(40));
  assert.equal(value.activeSeconds, 40);
  assert.equal(session.activityStatus(value, at(45)), 'Idle');
  value = session.applyCheckIn(value, check('a', true, 400), at(60));
  assert.equal(value.activeSeconds, 40);
  assert.equal(session.activityStatus(value, at(61)), 'Idle');
  assert.equal(session.activityStatus(value, at(151)), 'Offline');
  value = session.applyCheckIn(value, check(), at(3600));
  assert.equal(value.activeSeconds, 40);
  assert.equal(session.activityStatus(value, at(3600)), 'Online');
});

test('multiple tabs share one elapsed-time counter, while hidden tabs cannot hide an active tab', () => {
  let value = session.newActivitySession(start.toISOString(), start);
  value = session.applyCheckIn(value, check('a'), start);
  value = session.applyCheckIn(value, check('b', false), at(10));
  assert.equal(session.activityStatus(value, at(10)), 'Online');
  value = session.applyCheckIn(value, check('a'), at(30));
  value = session.applyCheckIn(value, check('b'), at(30));
  assert.equal(value.activeSeconds, 30);
  for (let i = 0; i < 100; i++) value = session.applyCheckIn(value, check(String(i)), at(30));
  assert.equal(value.activeSeconds, 30);
  assert.ok(Object.keys(value.tabs).length <= 20);
});

test('signed-out sessions cannot reopen and session span stops at sign-out', () => {
  const value = { ...session.newActivitySession(start.toISOString(), start), endedAt: at(90).toISOString() };
  assert.equal(session.applyCheckIn(value, check(), at(100)), value);
  assert.equal(session.activityStatus(value, at(100)), 'Signed out');
  assert.equal(session.sessionSpanSeconds(value), 90);
});

test('database updates serialize tabs and late sign-out requests, preserve ownership and retain history', async () => {
  const rows = new Map(), locks = [];
  let queue = Promise.resolve();
  const tx = {
    $executeRaw: async (strings, id) => { assert.match(strings.join(''), /pg_advisory_xact_lock/); locks.push(id); },
    auditLog: {
      findUnique: async ({ where }) => rows.get(where.id),
      create: async ({ data }) => rows.set(data.id, structuredClone(data)),
      update: async ({ where, data }) => rows.set(where.id, { ...rows.get(where.id), ...structuredClone(data) }),
    },
  };
  const prisma = { $transaction: fn => { const result = queue.then(() => fn(tx)); queue = result.catch(() => {}); return result; } };
  const { recordActivity } = loader({ '@/lib/prisma': { prisma } })('lib/activity/store.ts');
  const identity = { userId: 'u', sessionId: 's', signedInAt: start.toISOString() };
  const ping = tabId => ({ kind: 'check-in', checkIn: check(tabId), organizationId: 'business' });
  await recordActivity(identity, { kind: 'start' }, start);
  await recordActivity(identity, ping('a'), start);
  await Promise.all([recordActivity(identity, ping('a'), at(30)), recordActivity(identity, ping('b'), at(30))]);
  assert.equal(rows.get('activity_s').metadata.activeSeconds, 30);
  assert.equal(rows.get('activity_s').organizationId, 'business');
  await recordActivity(identity, { kind: 'end' }, at(45));
  await recordActivity(identity, ping('a'), at(60));
  assert.equal(rows.get('activity_s').metadata.endedAt, at(45).toISOString());
  await assert.rejects(recordActivity({ ...identity, userId: 'other' }, ping('x'), at(70)), /MISMATCH/);
  assert.equal(rows.size, 1);
  assert.equal(locks.length, 7);
});

const sid = '9b9bc01c-a7f4-412b-b3dc-dd17938e97cf';
const tab = 'e47d2bf4-78dc-423c-b1bb-076f1e2be40c';
test('check-ins require same origin, authenticated owner, current sign-in and validated inputs', async () => {
  let user = { user: { id: 'user' }, activity: { id: sid, signedInAt: null } }, exists = true;
  const recorded = [];
  const route = loader({
    'next/server': { NextResponse: class extends Response { static json = Response.json; } },
    '@/auth': { auth: async () => user },
    '@/lib/prisma': { prisma: { user: { findUnique: async () => exists ? { id: 'user' } : null } } },
    '@/lib/auth/context': { tenantContext: async () => ({ organizationId: 'authorized-org' }) },
    '@/lib/activity/store': { recordActivity: async (...args) => recorded.push(args) },
  })('app/api/activity/check-in/route.ts');
  const send = (extra = {}, origin = 'https://app.test') => route.POST(new Request('https://app.test/api/activity/check-in', { method: 'POST', headers: { origin }, body: JSON.stringify({ tabId: tab, sessionId: sid, visible: true, idleSeconds: 0, ...extra }) }));
  assert.equal((await send({}, 'https://evil.test')).status, 403);
  assert.equal((await send({ userId: 'other' })).status, 400);
  assert.equal((await send({ organizationId: 'other' })).status, 400);
  assert.equal((await send({ idleSeconds: -1 })).status, 400);
  assert.equal((await send({ sessionId: tab })).status, 401);
  assert.equal((await send()).status, 204);
  assert.equal(recorded[0][0].userId, 'user');
  assert.equal(recorded[0][1].organizationId, 'authorized-org');
  user = null; assert.equal((await send()).status, 401);
  user = { user: { id: 'user' }, activity: { id: sid } }; exists = false;
  assert.equal((await send()).status, 401);
  assert.equal(recorded.length, 1);
});

test('activity history is Master Admin only, includes inactive sessions and omits per-tab details', async () => {
  let deny = 'FORBIDDEN', reads = 0;
  const value = session.applyCheckIn(session.newActivitySession(null, start), check(), start);
  const api = loader({
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/admin/context': { superAdminContext: async () => { if (deny) throw Error(deny); } },
    '@/lib/prisma': { prisma: {
      auditLog: { findMany: async ({ where, take }) => { reads++; assert.equal(where.action, session.ACTIVITY_ACTION); assert.equal(take, 51); return [{ id: 'entry', userId: 'u', organizationId: 'o', metadata: value }]; } },
      user: { findMany: async () => [{ id: 'u', name: 'Client', email: 'client@example.com' }] },
      organization: { findMany: async () => [{ id: 'o', name: 'Client business' }] },
    } },
  })('app/api/admin/activity/route.ts');
  const req = () => new Request('https://app.test/api/admin/activity');
  assert.equal((await api.GET(req())).status, 403);
  deny = 'UNAUTHENTICATED'; assert.equal((await api.GET(req())).status, 401); assert.equal(reads, 0);
  deny = null; const response = await api.GET(req()), body = await response.json();
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(body.rows[0].business, 'Client business');
  assert.equal(body.rows[0].session.signedInAt, null);
  assert.equal('tabs' in body.rows[0].session, false);
  assert.equal((await api.GET(new Request('https://app.test/api/admin/activity?page=-1'))).status, 400);
});

test('sign-in records a new stable session; existing cookies remain unknown; tracking outages never block auth', async () => {
  let config, fail = false; const events = [];
  loader({
    'next-auth': settings => { config = settings; return {}; },
    'next-auth/providers/credentials': settings => settings,
    '@/lib/prisma': { prisma: {} },
    '@/lib/activity/store': { recordActivity: async (...args) => { if (fail) throw Error('offline'); events.push(args); } },
  })('auth.ts');
  const token = await config.callbacks.jwt({ token: {}, user: { id: 'u' } });
  assert.equal(events[0][1].kind, 'start');
  assert.equal(token.sub, 'u'); assert.ok(token.activitySignedInAt);
  const refreshed = await config.callbacks.jwt({ token });
  assert.equal(refreshed.activitySessionId, token.activitySessionId);
  assert.equal(events.length, 1);
  const legacy = await config.callbacks.jwt({ token: { sub: 'u' } });
  assert.equal(legacy.activitySignedInAt, null); assert.ok(legacy.activitySessionId);
  await config.events.signOut({ token }); assert.equal(events[1][1].kind, 'end');
  fail = true;
  assert.equal((await config.callbacks.jwt({ token: {}, user: { id: 'u' } })).sub, 'u');
  await config.events.signOut({ token });
});
