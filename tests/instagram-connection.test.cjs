const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const origin = 'https://rumisocialai.com';
function fixture() {
  const ctx = { userId: 'user', organizationId: 'org', role: 'owner' };
  const env = { NEXT_PUBLIC_APP_URL: origin, INSTAGRAM_APP_ID: 'app', INSTAGRAM_APP_SECRET: 'private-client-secret', AUTH_SECRET: 'test-state-key', TOKEN_ENCRYPTION_KEY: 'test-encryption-key' };
  const connections = [], jobs = [], publishes = [], calls = [], cache = new Map();
  let profileStatus = 200, tokenStatus = 200, profileId = '12345', errorCode = 190, onProfile;
  const matches = (row, where = {}) => row && Object.entries(where).every(([key, value]) => value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value);
  const model = rows => ({
    findFirst: async ({ where }) => rows.find(r => matches(r, where)) || null,
    findUnique: async ({ where }) => rows.find(r => matches(r, where)) || null,
    findMany: async ({ where }) => rows.filter(r => matches(r, where)),
    create: async ({ data }) => { const row = { id: 'id-' + rows.length, createdAt: new Date(), ...data }; rows.push(row); return row; },
    update: async ({ where, data }) => Object.assign(rows.find(r => matches(r, where)), data),
    updateMany: async ({ where, data }) => { const selected = rows.filter(r => matches(r, where)); selected.forEach(r => Object.assign(r, data)); return { count: selected.length }; },
  });
  const prisma = {
    socialConnection: model(connections), job: model(jobs), publishJob: model(publishes),
    membership: { findFirst: async ({ where }) => where.userId === ctx.userId && where.organizationId === ctx.organizationId && !ctx.removed ? { role: ctx.role, organization: { status: ctx.suspended ? 'suspended' : 'active' } } : null },
    user: { findUnique: async () => ctx.deleted ? null : { isSuperAdmin: !!ctx.isSuperAdmin } },
    $executeRaw: async () => {},
  };
  prisma.$transaction = async run => run(prisma);
  const mocks = {
    '@/lib/prisma': { prisma }, '@/lib/auth/context': { tenantContext: async () => { if (ctx.signedOut) throw Error('UNAUTHENTICATED'); return ctx; } },
    'next/server': { NextResponse: { json: Response.json, redirect: (url, status = 307) => new Response(null, { status, headers: { Location: String(url) } }) } },
    'next/link': { __esModule: true, default: props => require('react').createElement('a', props) },
  };
  const fetchMock = async (input, options) => {
    const url = String(input); calls.push({ url, options });
    assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    if (url.includes('api.instagram.com/oauth/access_token')) return Response.json(tokenStatus === 200 ? { access_token: 'short-private-token' } : { error_message: 'private-provider-error' }, { status: tokenStatus });
    if (url.includes('graph.instagram.com/access_token')) return Response.json({ access_token: 'long-private-token' });
    if (url.includes('/me?')) { if (onProfile) await onProfile(); return Response.json(profileStatus === 200 ? { id: profileId, username: 'rumiguitars1', account_type: 'BUSINESS' } : { error: { code: errorCode, message: 'private-provider-error' } }, { status: profileStatus }); }
    throw Error('Unexpected API');
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} }; cache.set(file, module.exports);
    const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Buffer, URL, URLSearchParams, AbortSignal, Response, Date, Error, console, process: { env }, fetch: fetchMock, require: name => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      if (name.startsWith('.')) { const next = path.join(path.dirname(file), name); return load(next + (fs.existsSync(path.resolve(__dirname, '..', next + '.ts')) ? '.ts' : '.tsx')); }
      return require(name);
    } });
    return module.exports;
  }
  const routes = Object.fromEntries(['connect', 'callback', 'disconnect', 'status'].map(r => [r, load(`app/api/social/instagram/${r}/route.ts`)]));
  const security = load('lib/security/crypto.ts');
  const start = async connectionId => { const response = await routes.connect.GET(new Request(`${origin}/api/social/instagram/connect${connectionId ? '?connectionId=' + connectionId : ''}`)); return { response, url: new URL(response.headers.get('location')) }; };
  const callback = (state, params = { code: 'provider-code' }) => routes.callback.GET(new Request(`${origin}/api/social/instagram/callback?${new URLSearchParams({ state, ...params })}`));
  const disconnect = (connectionId, requestOrigin = origin) => routes.disconnect.POST(new Request(`${origin}/api/social/instagram/disconnect`, { method: 'POST', headers: { origin: requestOrigin }, body: new URLSearchParams({ connectionId }) }));
  const status = id => routes.status.GET(new Request(`${origin}/api/social/instagram/status?connectionId=${id}`));
  async function connect() { const { url } = await start(); assert.match((await callback(url.searchParams.get('state'))).headers.get('location'), /instagram=connected/); return connections[0]; }
  return { ctx, env, connections, jobs, publishes, calls, prisma, mocks, routes, load, security, start, callback, connect, disconnect, status,
    profile: (status, id = '12345', code = 190) => { profileStatus = status; profileId = id; errorCode = code; }, token: value => tokenStatus = value, onProfile: action => onProfile = action };
}
const location = r => r.headers.get('location');

test('Instagram authorizes both scopes, preserves registered callback and reconnects without duplicating the account', async () => {
  const f = fixture(), { response, url } = await f.start();
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(url.origin, 'https://www.instagram.com');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://rumi-social-ai-saas-v14.vercel.app/api/social/instagram/callback');
  assert.equal(url.searchParams.get('scope'), 'instagram_business_basic,instagram_business_content_publish');
  assert.match(location(await f.callback(url.searchParams.get('state'))), /instagram=connected/);
  const account = f.connections[0];
  assert.equal(account.accountName, 'rumiguitars1');
  assert.equal(f.security.decryptSecret(account.encryptedToken), 'long-private-token');
  assert.ok(!account.encryptedToken.includes('private-token'));
  const second = await f.start(account.id);
  assert.match(location(await f.callback(second.url.searchParams.get('state'))), /instagram=connected/);
  assert.equal(f.connections.length, 1); assert.equal(f.connections[0].id, account.id);
  const tokenCall = f.calls.find(call => call.url.includes('api.instagram.com/oauth'));
  assert.equal(tokenCall.options.body.get('redirect_uri'), url.searchParams.get('redirect_uri'));
});

test('Instagram callback and connect use the same fallback app id and optional registered callback', async () => {
  const f = fixture(); delete f.env.INSTAGRAM_APP_ID; f.env.META_APP_ID = 'fallback-app';
  f.env.INSTAGRAM_REDIRECT_URI = origin + '/api/social/instagram/callback';
  const { url } = await f.start(); assert.equal(url.searchParams.get('client_id'), 'fallback-app');
  await f.callback(url.searchParams.get('state'));
  assert.equal(f.calls[0].options.body.get('client_id'), 'fallback-app');
  assert.equal(f.calls[0].options.body.get('redirect_uri'), url.searchParams.get('redirect_uri'));
});

test('expired, cancelled, tampered and replayed callbacks cannot write accounts', async () => {
  for (const change of [f => { f.jobs[0].payload.expiresAt = 1; }, f => { f.jobs[0].status = 'cancelled'; }]) {
    const f = fixture(), { url } = await f.start(); change(f);
    assert.match(location(await f.callback(url.searchParams.get('state'))), /reason=session/); assert.equal(f.calls.length, 0);
  }
  const f = fixture(), { url } = await f.start(), state = url.searchParams.get('state');
  assert.match(location(await f.callback(state + 'broken')), /reason=session/);
  const replies = await Promise.all([f.callback(state), f.callback(state)]);
  assert.equal(replies.filter(r => location(r).includes('instagram=connected')).length, 1);
  assert.equal(f.connections.length, 1); assert.equal(f.calls.length, 3);
});

test('viewer, removed member, deleted user and suspended workspace cannot authorize Instagram', async () => {
  for (const change of [f => { f.ctx.role = 'viewer'; }, f => { f.ctx.removed = true; }, f => { f.ctx.deleted = true; }, f => { f.ctx.suspended = true; }]) {
    const f = fixture(), { url } = await f.start(); change(f);
    assert.match(location(await f.callback(url.searchParams.get('state'))), /reason=workspace/);
    assert.equal(f.calls.length, 0); assert.equal(f.connections.length, 0);
  }
  const f = fixture(); f.ctx.role = 'viewer'; assert.match((await f.start()).url.search, /reason=workspace/); assert.equal(f.jobs.length, 0);
});

test('provider refusal and wrong-account reconnect leave existing credentials untouched and return safe reasons', async () => {
  for (const scenario of ['denial', 'token', 'profile', 'mismatch']) {
    const f = fixture(), account = await f.connect(), before = account.encryptedToken, { url } = await f.start(account.id);
    if (scenario === 'token') f.token(400);
    if (scenario === 'profile') f.profile(400);
    if (scenario === 'mismatch') f.profile(200, 'other-account');
    const response = await f.callback(url.searchParams.get('state'), scenario === 'denial' ? { error: 'access_denied' } : { code: 'code' });
    assert.match(location(response), new RegExp(scenario === 'denial' ? 'instagram=cancelled' : 'reason=' + ({ token: 'token_exchange', profile: 'profile', mismatch: 'account_mismatch' }[scenario])));
    assert.equal(account.encryptedToken, before); assert.equal(f.connections.length, 1);
    assert.ok(!location(response).includes('private-'));
  }
});

test('disconnect clears only this account token, stops pending jobs, and retains published history and other businesses', async () => {
  const f = fixture(), account = await f.connect(), { url } = await f.start(account.id);
  f.connections.push({ id: 'foreign', provider: 'instagram', organizationId: 'another', status: 'connected', encryptedToken: 'keep' });
  for (const status of ['scheduled', 'retry', 'published', 'publishing']) f.publishes.push({ id: status, status, organizationId: 'org', socialConnectionId: account.id });
  f.publishes.push({ id: 'other', status: 'scheduled', organizationId: 'another', socialConnectionId: 'foreign' });
  assert.equal((await f.disconnect(account.id)).status, 303);
  assert.equal(account.encryptedToken, null); assert.equal(account.status, 'disconnected'); assert.equal(account.externalId, '12345');
  assert.deepEqual(f.publishes.map(j => j.status), ['failed', 'failed', 'published', 'publishing', 'scheduled']);
  assert.equal(f.connections[1].encryptedToken, 'keep');
  const before = f.calls.length;
  assert.match(location(await f.callback(url.searchParams.get('state'))), /reason=session/); assert.equal(f.calls.length, before);
  const reconnect = await f.start(); await f.callback(reconnect.url.searchParams.get('state'));
  assert.equal(f.connections.length, 2); assert.equal(account.status, 'connected'); assert.equal(f.publishes[0].status, 'failed');
});

test('cross-workspace, cross-origin and read-only users cannot disconnect or inspect account credentials', async () => {
  const f = fixture(), account = await f.connect(), before = account.encryptedToken;
  f.ctx.organizationId = 'another';
  assert.equal((await f.disconnect(account.id)).status, 404); assert.equal((await f.status(account.id)).status, 404);
  assert.match((await f.start(account.id)).url.search, /reason=session/);
  f.ctx.organizationId = 'org';
  assert.equal((await f.disconnect(account.id, 'https://evil.example')).status, 403);
  assert.equal((await f.disconnect(account.id, '')).status, 403);
  f.ctx.role = 'viewer'; assert.equal((await f.disconnect(account.id)).status, 403);
  assert.equal(account.encryptedToken, before);
});

test('a disconnect during the provider response cannot be undone by the delayed callback', async () => {
  const f = fixture(), account = await f.connect(), { url } = await f.start(account.id);
  f.onProfile(() => f.disconnect(account.id));
  assert.match(location(await f.callback(url.searchParams.get('state'))), /reason=session/);
  assert.equal(account.status, 'disconnected'); assert.equal(account.encryptedToken, null);
});

test('connection check distinguishes valid access, expired token, mismatch and temporary error without changing saved data', async () => {
  const f = fixture(), account = await f.connect(), token = account.encryptedToken;
  const success = await f.status(account.id); assert.equal(success.headers.get('Cache-Control'), 'no-store');
  assert.equal((await success.json()).ok, true);
  for (const [status, id, code, message] of [[400, '12345', 190, /expired/], [200, 'another', 0, /different Instagram account/], [429, '12345', 4, /shortly/], [500, '12345', 1, /shortly/]]) {
    f.profile(status, id, code); const data = await (await f.status(account.id)).json();
    assert.equal(data.ok, false); assert.match(data.message, message); assert.ok(!JSON.stringify(data).includes('private-'));
  }
  assert.equal(account.encryptedToken, token); assert.equal(account.status, 'connected');
  f.ctx.signedOut = true; assert.equal((await f.status(account.id)).status, 401);
});

test('Settings shows working Instagram controls and callback errors without rendering tokens or another business', async () => {
  const f = fixture(), account = await f.connect();
  f.connections.push({ id: 'foreign', provider: 'instagram', organizationId: 'another', status: 'connected', accountName: 'PrivateBusiness' });
  const page = f.load('app/settings/page.tsx').default, render = require('react-dom/server').renderToStaticMarkup;
  const html = render(await page({ searchParams: Promise.resolve({ instagram: 'error', reason: 'token_exchange' }) }));
  assert.match(html, /Instagram did not accept/); assert.match(html, /Check connection/); assert.match(html, /Reconnect Instagram/);
  assert.match(html, /action="\/api\/social\/instagram\/disconnect"/);
  assert.ok(!html.includes(account.encryptedToken)); assert.ok(!html.includes('PrivateBusiness'));
  f.ctx.role = 'viewer'; const viewer = render(await page({ searchParams: Promise.resolve({}) }));
  assert.ok(!viewer.includes('Disconnect Instagram')); assert.ok(!viewer.includes('Reconnect Instagram'));
});

test('image-less legacy Instagram delivery fails before any API call and is not automatically retried', async () => {
  const f = fixture(); const result = await f.load('lib/publishing/instagram.ts').publishInstagram({ accessToken: 'token', accountId: '12345', caption: 'A post', mediaUrl: null });
  assert.equal(result.ok, false); assert.equal(result.retryable, false); assert.match(result.error, /no finished image/); assert.equal(f.calls.length, 0);
});
