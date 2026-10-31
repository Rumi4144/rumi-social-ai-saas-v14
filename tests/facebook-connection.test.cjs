const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const origin = 'https://rumisocialai.com';
function fixture() {
  const ctx = { userId: 'user', organizationId: 'org', role: 'owner' };
  const env = { NEXT_PUBLIC_APP_URL: origin, FACEBOOK_APP_ID: 'app', FACEBOOK_APP_SECRET: 'private-client-secret', AUTH_SECRET: 'test-state-key', TOKEN_ENCRYPTION_KEY: 'test-encryption-key' };
  const connections = [], jobs = [], publishes = [], calls = [], cache = new Map();
  let profileStatus = 200, tokenStatus = 200, profileId = '12345', errorCode = 190, onProfile, pagesStatus = 200, onPages;
  let pageList = [{id: '12345', name: 'Rumi Guitars', access_token: 'page-private-token', tasks: ['CREATE_CONTENT']}];
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
    'next/navigation': { redirect: url => { throw Error('REDIRECT:' + url); } },
    'next/link': { __esModule: true, default: props => require('react').createElement('a', props) },
  };
  const fetchMock = async (input, options) => {
    const url = String(input); calls.push({ url, options });
    assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    if (url.includes('/oauth/access_token')) return Response.json(tokenStatus === 200 ? { access_token: 'user-private-token' } : { error: { message: 'private-provider-error' } }, { status: tokenStatus });
    if (url.includes('/me/accounts')) { if (onPages) await onPages(); return Response.json(pagesStatus === 200 ? { data: pageList } : { error: { message: 'private-provider-error' } }, { status: pagesStatus }); }
    if (url.includes('/me?')) { if (onProfile) await onProfile(); return Response.json(profileStatus === 200 ? { id: profileId, name: 'Rumi Guitars' } : { error: { code: errorCode, message: 'private-provider-error' } }, { status: profileStatus }); }
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
  const routes = Object.fromEntries(['connect', 'callback', 'disconnect', 'status', 'select'].map(r => [r, load(`app/api/social/facebook/${r}/route.ts`)]));
  const security = load('lib/security/crypto.ts');
  const start = async connectionId => { const response = await routes.connect.GET(new Request(`${origin}/api/social/facebook/connect${connectionId ? '?connectionId=' + connectionId : ''}`)); return { response, url: new URL(response.headers.get('location')) }; };
  const callback = (state, params = { code: 'provider-code' }) => routes.callback.GET(new Request(`${origin}/api/social/facebook/callback?${new URLSearchParams({ state, ...params })}`));
  const disconnect = (connectionId, requestOrigin = origin) => routes.disconnect.POST(new Request(`${origin}/api/social/facebook/disconnect`, { method: 'POST', headers: { origin: requestOrigin }, body: new URLSearchParams({ connectionId }) }));
  const select = (jobId, pageId, requestOrigin = origin) => routes.select.POST(new Request(`${origin}/api/social/facebook/select`, { method: 'POST', headers: { origin: requestOrigin }, body: new URLSearchParams({jobId, pageId}) }));
  const status = id => routes.status.GET(new Request(`${origin}/api/social/facebook/status?connectionId=${id}`));
  async function connect() { const { url } = await start(); assert.match((await callback(url.searchParams.get('state'))).headers.get('location'), /facebook=connected/); return connections[0]; }
  return { ctx, env, connections, jobs, publishes, calls, prisma, mocks, routes, load, security, start, callback, connect, disconnect, status, select,
    pages: (list, status = 200) => { pageList = list; pagesStatus = status; }, onPages: action => onPages = action,
    profile: (status, id = '12345', code = 190) => { profileStatus = status; profileId = id; errorCode = code; }, token: value => tokenStatus = value, onProfile: action => onProfile = action };
}
const location = r => r.headers.get('location');

test('Facebook requests Page publishing scopes, preserves registered callback and reconnects without duplicating the account', async () => {
  const f = fixture(), { response, url } = await f.start();
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(url.origin, 'https://www.facebook.com');
  assert.equal(url.searchParams.get('redirect_uri'), origin + '/api/social/facebook/callback');
  assert.equal(url.searchParams.get('scope'), 'pages_show_list,pages_read_engagement,pages_manage_posts,business_management');
  assert.match(location(await f.callback(url.searchParams.get('state'))), /facebook=connected/);
  const account = f.connections[0];
  assert.equal(account.accountName, 'Rumi Guitars');
  assert.equal(url.searchParams.get('auth_type'), 'rerequest');
  assert.equal(JSON.parse(f.security.decryptSecret(account.encryptedToken)).pageAccessToken, 'page-private-token');
  assert.ok(!account.encryptedToken.includes('private-token'));
  const second = await f.start(account.id);
  assert.match(location(await f.callback(second.url.searchParams.get('state'))), /facebook=connected/);
  assert.equal(f.connections.length, 1); assert.equal(f.connections[0].id, account.id);
  const tokenCall = f.calls.find(call => call.url.includes('/oauth/access_token'));
  assert.equal(new URL(tokenCall.url).searchParams.get('redirect_uri'), url.searchParams.get('redirect_uri'));
});

test('expired, cancelled, tampered and replayed callbacks cannot write accounts', async () => {
  for (const change of [f => { f.jobs[0].payload.expiresAt = 1; }, f => { f.jobs[0].status = 'cancelled'; }]) {
    const f = fixture(), { url } = await f.start(); change(f);
    assert.match(location(await f.callback(url.searchParams.get('state'))), /reason=session/); assert.equal(f.calls.length, 0);
  }
  const f = fixture(), { url } = await f.start(), state = url.searchParams.get('state');
  assert.match(location(await f.callback(state + 'broken')), /reason=session/);
  const replies = await Promise.all([f.callback(state), f.callback(state)]);
  assert.equal(replies.filter(r => location(r).includes('facebook=connected')).length, 1);
  assert.equal(f.connections.length, 1); assert.equal(f.calls.length, 2);
});

test('viewer, removed member, deleted user and suspended workspace cannot authorize Facebook', async () => {
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
    if (scenario === 'profile') f.pages([], 400);
    if (scenario === 'mismatch') f.pages([{id: 'other-page', name: 'Wrong Page', access_token: 'different-token'}]);
    const response = await f.callback(url.searchParams.get('state'), scenario === 'denial' ? { error: 'access_denied' } : { code: 'code' });
    assert.match(location(response), new RegExp(scenario === 'denial' ? 'facebook=cancelled' : 'reason=' + ({ token: 'token_exchange', profile: 'pages', mismatch: 'account_mismatch' }[scenario])));
    assert.equal(account.encryptedToken, before); assert.equal(f.connections.length, 1);
    assert.ok(!location(response).includes('private-'));
  }
});

test('disconnect clears only this account token, stops pending jobs, and retains published history and other businesses', async () => {
  const f = fixture(), account = await f.connect(), { url } = await f.start(account.id);
  f.connections.push({ id: 'foreign', provider: 'facebook', organizationId: 'another', status: 'connected', encryptedToken: 'keep' });
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
  f.onPages(() => f.disconnect(account.id));
  assert.match(location(await f.callback(url.searchParams.get('state'))), /reason=session/);
  assert.equal(account.status, 'disconnected'); assert.equal(account.encryptedToken, null);
});

test('connection check distinguishes valid access, expired token, mismatch and temporary error without changing saved data', async () => {
  const f = fixture(), account = await f.connect(), token = account.encryptedToken;
  const success = await f.status(account.id); assert.equal(success.headers.get('Cache-Control'), 'no-store');
  assert.equal((await success.json()).ok, true);
  for (const [status, id, code, message] of [[400, '12345', 190, /expired/], [200, 'another', 0, /saved Facebook Page was not available/], [429, '12345', 4, /shortly/], [500, '12345', 1, /shortly/]]) {
    f.profile(status, id, code); const data = await (await f.status(account.id)).json();
    assert.equal(data.ok, false); assert.match(data.message, message); assert.ok(!JSON.stringify(data).includes('private-'));
  }
  assert.equal(account.encryptedToken, token); assert.equal(account.status, 'connected');
  f.ctx.signedOut = true; assert.equal((await f.status(account.id)).status, 401);
});

test('Settings shows working Facebook controls and callback errors without rendering tokens or another business', async () => {
  const f = fixture(), account = await f.connect();
  f.connections.push({ id: 'foreign', provider: 'facebook', organizationId: 'another', status: 'connected', accountName: 'PrivateBusiness' });
  const page = f.load('app/settings/page.tsx').default, render = require('react-dom/server').renderToStaticMarkup;
  const html = render(await page({ searchParams: Promise.resolve({ facebook: 'error', reason: 'token_exchange' }) }));
  assert.match(html, /Facebook did not accept/); assert.match(html, /Check connection/); assert.match(html, /Reconnect Facebook/);
  assert.match(html, /action="\/api\/social\/facebook\/disconnect"/);
  assert.ok(!html.includes(account.encryptedToken)); assert.ok(!html.includes('PrivateBusiness'));
  f.ctx.role = 'viewer'; const viewer = render(await page({ searchParams: Promise.resolve({}) }));
  assert.ok(!viewer.includes('Disconnect Facebook')); assert.ok(!viewer.includes('Reconnect Facebook'));
});


test('multiple Page choices are encrypted, user-bound, and consumed once without overwriting another Page', async () => {
  const f = fixture(), first = await f.connect(), originalToken = first.encryptedToken;
  f.pages([{id:'12345', name:'Rumi Guitars', access_token:'updated-page-token'}, {id:'67890', name:'Second business', access_token:'second-private-token'}]);
  const {url} = await f.start();
  const callbackResult = await f.callback(url.searchParams.get('state'));
  assert.match(location(callbackResult), /settings\/facebook\/select\?job=/);
  const jobId = new URL(location(callbackResult)).searchParams.get('job'), job = f.jobs.find(j => j.id === jobId);
  assert.ok(!JSON.stringify(job).includes('second-private-token'));
  const page = f.load('app/settings/facebook/select/page.tsx').default;
  const html = require('react-dom/server').renderToStaticMarkup(await page({searchParams:Promise.resolve({job:jobId})}));
  assert.match(html, /Second business/); assert.ok(!html.includes('private-token')); assert.ok(!html.includes(job.payload.encryptedPages));
  const replies = await Promise.all([f.select(jobId, '67890'), f.select(jobId, '67890')]);
  assert.equal(replies.filter(r => location(r).includes('facebook=connected')).length, 1);
  assert.equal(f.connections.length, 2); assert.equal(first.externalId, '12345'); assert.equal(first.encryptedToken, originalToken);
  assert.equal(f.connections[1].externalId, '67890');
  assert.equal(JSON.parse(f.security.decryptSecret(f.connections[1].encryptedToken)).pageAccessToken, 'second-private-token');
  assert.equal(JSON.stringify(job.payload), '{}');
});

test('reconnect picks the existing Page even if Facebook returns multiple Pages in another order', async () => {
  const f = fixture(), first = await f.connect();
  f.pages([{id:'67890', name:'Different Page', access_token:'wrong-token'}, {id:'12345', name:'Rumi Guitars', access_token:'refreshed-token'}]);
  const {url} = await f.start(first.id);
  assert.match(location(await f.callback(url.searchParams.get('state'))), /facebook=connected/);
  assert.equal(f.connections.length, 1); assert.equal(first.externalId, '12345');
  assert.equal(JSON.parse(f.security.decryptSecret(first.encryptedToken)).pageAccessToken, 'refreshed-token');
  assert.equal(f.jobs.filter(j => j.type === 'facebook_page_selection').length, 0);
});

test('Page selections reject expired, cancelled, foreign user, workspace, origin and viewer requests', async () => {
  for (const scenario of ['expired', 'cancelled', 'user', 'org', 'origin', 'viewer', 'unknown-page']) {
    const f = fixture(); f.pages([{id:'1', name:'First', access_token:'one'}, {id:'2',name:'Second',access_token:'two'}]);
    const {url} = await f.start();
    const result = await f.callback(url.searchParams.get('state'));
    const jobId = new URL(location(result)).searchParams.get('job'), job = f.jobs.find(j => j.id === jobId);
    if (scenario === 'expired') job.payload.expiresAt = 1;
    if (scenario === 'cancelled') job.status = 'cancelled';
    if (scenario === 'user') f.ctx.userId = 'other-user';
    if (scenario === 'org') f.ctx.organizationId = 'other-org';
    if (scenario === 'viewer') f.ctx.role = 'viewer';
    const response = await f.select(jobId, scenario === 'unknown-page' ? '3' : '1', scenario === 'origin' ? 'https://evil.example' : origin);
    assert.ok(response.status === 403 || location(response).includes('facebook=error'), scenario);
    assert.equal(f.connections.length, 0);
    if (['expired', 'cancelled', 'user', 'org', 'viewer'].includes(scenario)) {
      await assert.rejects(f.load('app/settings/facebook/select/page.tsx').default({searchParams:Promise.resolve({job:jobId})}), /REDIRECT:.*facebook=error/);
    }
  }
});

test('disconnect cancels pending Page selections and leaves Instagram, Facebook posts and other credentials untouched', async () => {
  const f = fixture(), first = await f.connect();
  f.connections.push({id:'instagram',organizationId:'org',provider:'instagram',status:'connected',encryptedToken:'keep-instagram'});
  f.publishes.push({id:'instagram-job', organizationId:'org', socialConnectionId:'instagram', status:'scheduled'});
  f.pages([{id:'1',name:'One',access_token:'one'}, {id:'2',name:'Two',access_token:'two'}]);
  const {url} = await f.start(), response = await f.callback(url.searchParams.get('state'));
  const jobId = new URL(location(response)).searchParams.get('job'), job = f.jobs.find(j => j.id === jobId);
  await f.disconnect(first.id);
  assert.equal(job.status, 'cancelled'); assert.equal(JSON.stringify(job.payload), '{}');
  assert.match(location(await f.select(jobId,'1')), /facebook=error/);
  assert.equal(f.connections.length, 2); assert.equal(f.connections[1].encryptedToken,'keep-instagram');
  assert.equal(f.publishes[0].status, 'scheduled');
});

test('missing setup, expired response, unknown target and no available Pages leave the saved connection untouched', async () => {
  for (const scenario of ['setup', 'late', 'unknown', 'no-pages']) {
    const f = fixture(), first = await f.connect(), token = first.encryptedToken;
    if (scenario === 'setup') { delete f.env.FACEBOOK_APP_SECRET; assert.match((await f.start(first.id)).url.search, /reason=setup/); }
    else if (scenario === 'unknown') assert.match((await f.start('foreign')).url.search, /reason=session/);
    else {
      const {url} = await f.start(first.id);
      if (scenario === 'no-pages') f.pages([]);
      if (scenario === 'late') f.onPages(() => { f.jobs.find(j => j.status === 'processing').payload.expiresAt = 1; });
      assert.match(location(await f.callback(url.searchParams.get('state'))), /facebook=error/);
    }
    assert.equal(first.encryptedToken, token); assert.equal(first.status, 'connected');
  }
});

test('new connect attempts have unique signed state even when started together', async () => {
  const f = fixture(); const [one,two] = await Promise.all([f.start(), f.start()]);
  assert.notEqual(one.url.searchParams.get('state'), two.url.searchParams.get('state')); assert.equal(f.jobs.length, 2);
});
