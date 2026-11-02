const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

const origin = 'https://rumisocialai.com';
function fixture() {
  const publishes = new Map(), jobs = new Map(), connections = new Map(), organizations = new Map(), audits = new Map(), jar = new Map(), calls = [], cache = new Map();
  const ctx = { userId: 'user', organizationId: 'org', role: 'owner', isSuperAdmin: false };
  const env = { NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: origin, TOKEN_ENCRYPTION_KEY: 'test-encryption-key' };
  let accountStatus = 200, tokenStatus = 200, onAccount, accountProfile = { id: '12345', username: 'RumiGuitars' };
  function matches(row, where) {
    return Object.entries(where).every(([key, value]) => value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : value && typeof value === 'object' && 'lt' in value ? row[key] < value.lt : row[key] === value);
  }
  const model = map => ({
    findFirst: async ({ where }) => [...map.values()].find(row => matches(row, where)) || null,
    findMany: async ({ where, select }) => [...map.values()].filter(row => matches(row, where)).map(row => select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row),
    count: async ({ where }) => [...map.values()].filter(row => matches(row, where)).length,
    create: async ({ data }) => { data = { id: crypto.randomUUID(), ...data }; assert.ok(!map.has(data.id)); map.set(data.id, { createdAt: new Date(), ...data }); return map.get(data.id); },
    upsert: async ({ where, create, update }) => { if (map.has(where.id)) Object.assign(map.get(where.id), update); else map.set(where.id, { createdAt: new Date(), ...create }); return map.get(where.id); },
    updateMany: async ({ where, data }) => { let count = 0; for (const row of map.values()) if (matches(row, where)) { Object.assign(row, data); count++; } return { count }; },
    deleteMany: async ({ where }) => { let count = 0; for (const [id, row] of map) if (matches(row, where)) { map.delete(id); count++; } return { count }; },
  });
  const prisma = { publishJob: model(publishes), job: model(jobs), socialConnection: model(connections), organization: model(organizations), auditLog: model(audits), user: { findUnique: async () => ({ id: ctx.userId, isSuperAdmin: ctx.isSuperAdmin }) }, $transaction: async run => run(prisma) };
  const reply = response => {
    response.savedCookies = new Map();
    response.cookies = { set: (name, value, options) => response.savedCookies.set(name, { value, options }) };
    return response;
  };
  const fetchMock = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    if (url.endsWith('/token')) return Response.json(tokenStatus === 200 ? { access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 7200, token_type: 'bearer', scope: 'tweet.read tweet.write users.read media.write offline.access' } : { error: 'private-provider-error' }, { status: tokenStatus });
    if (url.endsWith('/users/me')) { if (onAccount) await onAccount(); return Response.json(accountStatus === 200 ? { data: accountProfile } : { error: 'private-provider-error' }, { status: accountStatus }); }
    if (url.endsWith('/revoke')) return Response.json({ revoked: true });
    throw new Error(`Unexpected URL: ${url}`);
  };
  const mocks = {
    '@/auth': { auth: async () => ctx.signedOut ? null : { user: { id: ctx.userId } } },
    'next/navigation': { redirect: url => { throw Error('REDIRECT:' + url); } },
    'next/link': { __esModule: true, default: props => require('react').createElement('a', props) },
    '@/lib/prisma': { prisma }, '@/lib/auth/context': { tenantContext: async () => { if (ctx.signedOut) throw Error('UNAUTHENTICATED'); return { ...ctx }; } },
    'next/headers': { cookies: async () => ({ get: name => jar.has(name) ? { value: jar.get(name) } : undefined }) },
    'next/server': { NextResponse: { redirect: (url, status = 307) => reply(new Response(null, { status, headers: { Location: String(url) } })), json: (data, options) => reply(Response.json(data, options)) } },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Buffer, URL, URLSearchParams, AbortSignal, Response, Date, Error, console, process: { env }, fetch: fetchMock,
      require: name => mocks[name] || (name.startsWith('@/') ? load(name.slice(2) + (fs.existsSync(path.resolve(__dirname, '..', name.slice(2) + '.ts')) ? '.ts' : '.tsx')) : require(name)),
    });
    return module.exports;
  }
  const client = load('lib/x/connection.ts'), security = load('lib/security/crypto.ts');
  const routes = Object.fromEntries(['configure', 'connect', 'callback', 'disconnect'].map(route => [route, load(`app/api/social/x/${route}/route.ts`)]));
  const post = (route, data, requestOrigin = origin) => routes[route].POST(new Request(`${origin}/api/social/x/${route}`, { method: 'POST', headers: { origin: requestOrigin }, body: new URLSearchParams(data) }));
  async function adminPost(data, requestOrigin = origin, endpoint = 'app/api/admin/social/x/configure/route.ts') {
    const wasAdmin = ctx.isSuperAdmin; ctx.isSuperAdmin = true;
    try { return await load(endpoint).POST(new Request(`${origin}/api/admin/social/x/configure`, { method: 'POST', headers: { origin: requestOrigin }, body: new URLSearchParams(data) })); }
    finally { ctx.isSuperAdmin = wasAdmin; }
  }
  const configure = (data = {}) => adminPost({ clientId: 'client-id-example', clientSecret: 'private-client-secret', ...data });
  const seedLegacy = (org = 'org', clientId = 'legacy-client-id') => {
    const id = client.xId('app', org);
    connections.set(id, { id, organizationId: org, provider: 'x_app', status: 'configured', encryptedToken: security.encryptSecret(JSON.stringify({ clientId, clientSecret: 'legacy-secret' })) });
    organizations.set(org, { id: org, name: org === 'org' ? 'Rumi Guitars' : org });
    return connections.get(id);
  };
  async function start() {
    if (!connections.size) await configure();
    const response = await post('connect', { consent: 'yes' });
    for (const [name, cookie] of response.savedCookies) jar.set(name, cookie.value);
    return { response, url: new URL(response.headers.get('location')) };
  }
  const callback = (state, params = { code: 'provider-code' }) => routes.callback.GET(new Request(`${origin}/api/social/x/callback?${new URLSearchParams({ state, ...params })}`));
  return { publishes, ctx, env, jobs, connections, organizations, audits, calls, jar, client, security, routes, post, configure, adminPost, seedLegacy, start, callback, load,
    setAccountProfile: value => accountProfile = value,
    setAccountStatus: value => accountStatus = value, setTokenStatus: value => tokenStatus = value, onAccount: action => onAccount = action };
}
const location = response => response.headers.get('location');
const linked = f => [...f.connections.values()].filter(row => row.provider === 'x');

test('X setup, S256 authorization, encrypted account linking and disconnect use actual route handlers', async () => {
  const f = fixture();
  assert.match(location(await f.configure()), /status=saved/);
  const config = [...f.connections.values()][0];
  assert.equal(config.status, 'configured');
  assert.ok(!config.encryptedToken.includes('private-client-secret'));
  const { response, url } = await f.start();
  assert.equal(url.origin + url.pathname, 'https://x.com/i/oauth2/authorize');
  assert.equal(url.searchParams.get('redirect_uri'), `${origin}/api/social/x/callback`);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('scope'), 'tweet.read tweet.write users.read media.write offline.access');
  assert.ok(!url.toString().includes('private-client-secret'));
  const cookie = response.savedCookies.get(f.client.X_COOKIE);
  assert.equal(cookie.options.httpOnly, true); assert.equal(cookie.options.secure, true); assert.equal(cookie.options.sameSite, 'lax');
  const payload = [...f.jobs.values()][0].payload;
  const session = JSON.parse(f.security.decryptSecret(payload.encryptedSession));
  assert.equal(crypto.createHash('sha256').update(session.verifier).digest('base64url'), url.searchParams.get('code_challenge'));
  assert.ok(!JSON.stringify(payload).includes(session.verifier));
  const completed = await f.callback(url.searchParams.get('state'));
  assert.match(location(completed), /status=connected/);
  assert.equal(completed.headers.get('Cache-Control'), 'no-store');
  assert.equal(completed.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(completed.savedCookies.get(f.client.X_COOKIE).options.maxAge, 0);
  assert.equal(f.jobs.size, 0);
  const account = linked(f)[0];
  assert.equal(account.accountName, 'RumiGuitars'); assert.equal(account.externalId, '12345');
  assert.equal(account.status, 'connected'); // New grants enable publishing; legacy linked accounts still need authorization.
  assert.ok(!account.encryptedToken.includes('private-access'));
  assert.equal(JSON.parse(f.security.decryptSecret(account.encryptedToken)).refreshToken, 'private-refresh');
  const tokenCall = f.calls.find(call => call.url.endsWith('/token'));
  assert.equal(tokenCall.options.body.get('code_verifier'), session.verifier);
  assert.equal(tokenCall.options.headers.Authorization, 'Basic ' + Buffer.from('client-id-example:private-client-secret').toString('base64'));
  f.publishes.set('queued', { id:'queued', organizationId:'org', socialConnectionId:account.id, platform:'x', status:'scheduled' });
  f.publishes.set('foreign', { id:'foreign', organizationId:'other-org', socialConnectionId:account.id, platform:'x', status:'scheduled' });
  assert.match(location(await f.post('disconnect', { connectionId: account.id })), /status=disconnected/);
  assert.equal(f.publishes.get('queued').status, 'failed');
  assert.equal(f.publishes.get('foreign').status, 'scheduled');
  assert.equal(linked(f).length, 0);
  assert.equal(f.calls.filter(call => call.url.endsWith('/revoke')).length, 2);
  assert.equal(f.connections.size, 1); // App configuration retained for reconnecting.
});

test('X role and same-origin checks block unauthorized credential changes and connections', async () => {
  for (const role of ['owner', 'admin', 'superadmin', 'viewer', 'member', 'unknown']) {
    const f = fixture(); f.ctx.role = role;
    assert.equal((await f.post('configure', { clientId: 'client-id-example', clientSecret: 'private-client-secret' })).status, 403);
    assert.equal((await f.load('app/api/admin/social/x/configure/route.ts').POST(new Request(origin + '/api/admin/social/x/configure', { method: 'POST', headers: { origin }, body: new URLSearchParams({ sourceOrganizationId: 'org' }) }))).status, 403); assert.equal(f.connections.size, 0);
  }
  for (const requestOrigin of ['https://attacker.example', 'null', '']) {
    const f = fixture(); f.ctx.isSuperAdmin = true;
    assert.equal((await f.post('configure', { clientId: 'client-id-example', clientSecret: 'private-client-secret' }, requestOrigin)).status, 403);
    assert.equal((await f.post('connect', { consent: 'yes' }, requestOrigin)).status, 403);
    assert.equal(f.jobs.size, 0); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); await f.configure(); f.ctx.role = 'viewer';
  assert.match(location(await f.post('connect', { consent: 'yes' })), /reason=connection/);
  assert.equal(f.jobs.size, 0);
});

test('X consent and setup are required before starting; GET never initiates authorization', async () => {
  const f = fixture();
  assert.equal(location(await f.routes.connect.GET()), `${origin}/settings/x`);
  assert.equal((await f.post('connect', {})).status, 403);
  assert.match(location(await f.post('connect', { consent: 'yes' })), /reason=setup/);
  assert.equal(f.jobs.size, 0); assert.equal(f.calls.length, 0);
});

test('X callback rejects another browser, user, workspace, viewer or expired state before API access', async () => {
  for (const change of [
    f => f.jar.clear(), f => { f.ctx.userId = 'other-user'; }, f => { f.ctx.organizationId = 'other-org'; },
    f => { f.ctx.role = 'viewer'; }, f => { f.ctx.signedOut = true; },
    f => { const row = [...f.jobs.values()][0]; const session = JSON.parse(f.security.decryptSecret(row.payload.encryptedSession)); session.expiresAt = 1; row.payload.encryptedSession = f.security.encryptSecret(JSON.stringify(session)); },
  ]) {
    const f = fixture(), { url } = await f.start(); change(f);
    assert.match(location(await f.callback(url.searchParams.get('state'))), /reason=(session|connection)/);
    assert.equal(f.calls.length, 0); assert.equal(linked(f).length, 0);
  }
});

test('X callback is single-use, including simultaneous requests', async () => {
  const f = fixture(), { url } = await f.start(), state = url.searchParams.get('state');
  const responses = await Promise.all([f.callback(state), f.callback(state)]);
  assert.equal(responses.filter(response => location(response).includes('status=connected')).length, 1);
  assert.equal(f.calls.filter(call => call.url.endsWith('/token')).length, 1);
  assert.match(location(await f.callback(state)), /reason=session/);
  assert.equal(linked(f).length, 1);
});

test('X denial consumes the valid session and leaves existing accounts untouched', async () => {
  const f = fixture(), first = await f.start(); await f.callback(first.url.searchParams.get('state'));
  const saved = linked(f)[0].encryptedToken, second = await f.start(), before = f.calls.length;
  assert.match(location(await f.callback(second.url.searchParams.get('state'), { error: 'access_denied' })), /reason=cancelled/);
  assert.equal(f.calls.length, before); assert.equal(linked(f)[0].encryptedToken, saved); assert.equal(f.jobs.size, 0);
});

test('X profile verification errors cannot create a false connection and revoke the new grant', async () => {
  for (const [status, reason] of [[402, 'credits'], [403, 'permissions'], [429, 'rate'], [500, 'connection']]) {
    const f = fixture(), { url } = await f.start(); f.setAccountStatus(status);
    const response = await f.callback(url.searchParams.get('state'));
    assert.match(location(response), new RegExp(`reason=${reason}`));
    assert.ok(!location(response).includes('private-provider-error')); assert.equal(linked(f).length, 0);
    assert.equal(f.calls.filter(call => call.url.endsWith('/revoke')).length, 2); assert.equal(f.jobs.size, 0);
  }
});

test('X token failures do not disclose provider responses or save partial connections', async () => {
  const f = fixture(), { url } = await f.start(); f.setTokenStatus(401);
  assert.match(location(await f.callback(url.searchParams.get('state'))), /reason=credentials/);
  assert.equal(linked(f).length, 0); assert.equal(f.calls.length, 1); assert.equal(f.jobs.size, 0);
});

test('X setup updates invalidate outstanding sessions; linked accounts block credential replacement', async () => {
  const f = fixture(), { url } = await f.start(); await f.configure();
  assert.match(location(await f.callback(url.searchParams.get('state'))), /reason=session/);
  assert.equal(f.calls.length, 0);
  const second = await f.start(); await f.callback(second.url.searchParams.get('state'));
  const config = f.connections.get(f.client.X_PLATFORM_APP_ID).encryptedToken;
  assert.match(location(await f.configure({ clientId: 'different-client-id' })), /reason=in_use/);
  assert.equal(f.connections.get(f.client.X_PLATFORM_APP_ID).encryptedToken, config);
  assert.match(location(await f.configure({ clientSecret: 'rotated-client-secret' })), /status=saved/);
  assert.equal((await f.client.xCredentials('org')).clientSecret, 'rotated-client-secret');
});

test('Cancelled in-flight X session cannot recreate an account after disconnect or setup change', async () => {
  const f = fixture(), { url } = await f.start(); f.onAccount(() => f.jobs.clear());
  assert.match(location(await f.callback(url.searchParams.get('state'))), /reason=session/);
  assert.equal(linked(f).length, 0); assert.equal(f.calls.filter(call => call.url.endsWith('/revoke')).length, 2);
});

test('X disconnect is scoped to the current workspace and requires same-origin writer access', async () => {
  const f = fixture(), { url } = await f.start(); await f.callback(url.searchParams.get('state'));
  const account = linked(f)[0], before = f.calls.length;
  f.ctx.organizationId = 'another-org';
  assert.match(location(await f.post('disconnect', { connectionId: account.id })), /reason=session/);
  f.ctx.organizationId = 'org';
  assert.equal((await f.post('disconnect', { connectionId: account.id }, 'https://attacker.example')).status, 403);
  f.ctx.role = 'viewer'; await f.post('disconnect', { connectionId: account.id });
  assert.equal(linked(f).length, 1); assert.equal(f.calls.length, before);
});

test('X configuration uses tenant-specific encrypted values; shared environment credentials are fallback only', async () => {
  const f = fixture(); f.env.X_CLIENT_ID = 'shared-id'; f.env.X_CLIENT_SECRET = 'shared-secret';
  assert.equal((await f.client.xCredentials('org')).clientId, 'shared-id');
  f.seedLegacy();
  assert.equal((await f.client.xCredentials('org')).clientId, 'legacy-client-id');
  await f.configure();
  assert.equal((await f.client.xCredentials('org')).clientId, 'legacy-client-id');
  assert.equal((await f.client.xCredentials('other-org')).clientId, 'client-id-example');
  f.env.NEXT_PUBLIC_APP_URL = 'http://rumisocialai.com';
  assert.throws(() => f.client.xCallbackUrl(), /X_APP_URL/);
});

test('X customer settings hides developer setup and preserves separate account controls', async () => {
  const f = fixture();
  const page = f.load('app/settings/x/page.tsx').default;
  const render = require('react-dom/server').renderToStaticMarkup;
  const first = render(await page({ searchParams: Promise.resolve({}) }));
  assert.ok(!first.includes('name="clientId"')); assert.ok(!first.includes('type="password"'));
  assert.match(first, /X setup needs attention/);
  assert.match(first, /publish approved text, photos and finished reels/);
  assert.ok(!first.includes('action="/api/social/x/connect"'));
  await f.configure();
  const configured = render(await page({ searchParams: Promise.resolve({ status: 'saved' }) }));
  assert.match(configured, /action="\/api\/social\/x\/connect"/);
  assert.ok(!configured.includes('private-client-secret')); assert.ok(!configured.includes('client-id-example'));
  f.connections.set('foreign-account', { id: 'foreign-account', organizationId: 'other-org', provider: 'x', status: 'linked', accountName: 'PrivateOtherOrg' });
  f.connections.set('local-account', { id: 'local-account', organizationId: 'org', provider: 'x', status: 'linked', accountName: 'RumiGuitars' });
  const connected = render(await page({ searchParams: Promise.resolve({ status: 'linked' }) }));
  assert.match(connected, /Linked as @RumiGuitars/); assert.match(connected, /Enable X posting/); assert.ok(!connected.includes('PrivateOtherOrg'));
  assert.ok(!connected.includes('name="clientSecret"'));
  f.ctx.role = 'viewer';
  const viewer = render(await page({ searchParams: Promise.resolve({}) }));
  assert.ok(!viewer.includes('<form')); assert.match(viewer, /Ask a workspace administrator/);
});

test('Admin reuses Rumi Guitars app settings while Master Mind authorizes its own isolated account', async () => {
  const f = fixture();
  const legacy = f.seedLegacy();
  const first = await f.start();
  await f.callback(first.url.searchParams.get('state'));
  const rumi = linked(f)[0];
  f.publishes.set('rumi-scheduled', { id: 'rumi-scheduled', organizationId: 'org', socialConnectionId: rumi.id, platform: 'x', status: 'scheduled' });
  const original = JSON.stringify({ legacy, rumi, scheduled: f.publishes.get('rumi-scheduled') });
  const beforeCalls = f.calls.length;

  f.ctx.organizationId = 'master-mind';
  assert.equal(await f.client.xCredentials('master-mind'), null);
  assert.match(location(await f.adminPost({ sourceOrganizationId: 'org' })), /status=saved/);
  assert.equal(f.calls.length, beforeCalls); // Adopting app settings never authorizes or publishes.
  assert.equal(linked(f).length, 1);
  const shared = f.connections.get(f.client.X_PLATFORM_APP_ID);
  const copied = JSON.parse(f.security.decryptSecret(shared.encryptedToken));
  assert.deepEqual(copied, { clientId: 'legacy-client-id', clientSecret: 'legacy-secret' });
  assert.equal((await f.client.xCredentials('master-mind')).clientId, copied.clientId);
  const audit = [...f.audits.values()][0];
  assert.equal(audit.action, 'x.platform_app.configure');
  assert.equal(audit.metadata.sourceOrganizationId, 'org');
  assert.ok(!JSON.stringify(audit).includes('legacy-secret'));
  assert.ok(!JSON.stringify(audit).includes('private-access'));

  f.setAccountProfile({ id: '67890', username: 'MasterMind' });
  const second = await f.start();
  assert.equal(second.url.searchParams.get('client_id'), copied.clientId);
  assert.match(location(await f.callback(second.url.searchParams.get('state'))), /status=connected/);
  const master = linked(f).find(row => row.organizationId === 'master-mind');
  assert.equal(master.accountName, 'MasterMind');
  assert.equal(master.externalId, '67890');
  assert.equal(linked(f).length, 2);
  const markup = require('react-dom/server').renderToStaticMarkup(await f.load('app/settings/x/page.tsx').default({ searchParams: Promise.resolve({}) }));
  assert.match(markup, /Ready to post.*MasterMind/);
  assert.ok(!markup.includes('RumiGuitars'));
  assert.match(location(await f.post('disconnect', { connectionId: master.id })), /status=disconnected/);
  assert.equal(linked(f).length, 1);
  assert.equal(JSON.stringify({ legacy: f.connections.get(legacy.id), rumi: f.connections.get(rumi.id), scheduled: f.publishes.get('rumi-scheduled') }), original);
});

test('Admin shared setup protects accounts that were authorized using environment settings', async () => {
  const f = fixture();
  f.env.X_CLIENT_ID = 'environment-client'; f.env.X_CLIENT_SECRET = 'environment-secret';
  f.connections.set('environment-account', { id: 'environment-account', organizationId: 'org', provider: 'x', status: 'connected', encryptedToken: f.security.encryptSecret(JSON.stringify({ clientId: 'environment-client', accessToken: 'existing-access' })) });
  f.jobs.set('pending', { id: 'pending', type: f.client.X_OAUTH_TYPE });
  assert.match(location(await f.configure()), /reason=in_use/);
  assert.ok(!f.connections.has(f.client.X_PLATFORM_APP_ID));
  assert.ok(f.jobs.has('pending')); assert.equal(f.audits.size, 0);
  assert.equal((await f.client.xCredentials('org')).clientId, 'environment-client');
  assert.match(location(await f.configure({ clientId: 'environment-client', clientSecret: 'rotated-environment-secret' })), /status=saved/);
  assert.equal((await f.client.xCredentials('org')).clientSecret, 'rotated-environment-secret');
  assert.equal(linked(f).length, 1); assert.equal(f.calls.length, 0);
});

test('Invalid sources, malformed credentials and signed-out requests cannot replace the shared setup', async () => {
  const f = fixture(); await f.configure();
  const original = f.connections.get(f.client.X_PLATFORM_APP_ID).encryptedToken;
  for (const form of [{ sourceOrganizationId: 'missing' }, { clientId: 'short', clientSecret: 'secret' }, { clientId: 'spaces not allowed', clientSecret: 'valid-secret' }]) {
    assert.match(location(await f.adminPost(form)), /reason=(source|credentials)/);
    assert.equal(f.connections.get(f.client.X_PLATFORM_APP_ID).encryptedToken, original);
  }
  f.seedLegacy().encryptedToken = f.security.encryptSecret(JSON.stringify({ accessToken: 'not-an-app-secret' }));
  const bad = await f.adminPost({ sourceOrganizationId: 'org' });
  assert.match(location(bad), /reason=save/);
  assert.ok(!location(bad).includes('not-an-app-secret'));
  assert.equal(f.connections.get(f.client.X_PLATFORM_APP_ID).encryptedToken, original);
  assert.equal(f.audits.size, 1);
  f.ctx.signedOut = true;
  assert.equal((await f.configure()).status, 403);
  assert.equal(f.connections.get(f.client.X_PLATFORM_APP_ID).encryptedToken, original);
});

test('X developer setup is visible only in Master Admin and never echoes saved secrets', async () => {
  const f = fixture(), render = require('react-dom/server').renderToStaticMarkup;
  const adminPage = f.load('app/admin/social-apps/page.tsx').default;
  const query = { searchParams: Promise.resolve({}) };
  await assert.rejects(adminPage(query), /REDIRECT:\/dashboard/);
  f.ctx.signedOut = true;
  await assert.rejects(adminPage(query), /REDIRECT:\/login/);
  f.ctx.signedOut = false; f.ctx.isSuperAdmin = true; f.seedLegacy(); await f.configure();
  const admin = render(await adminPage(query));
  assert.match(admin, /Use an existing setup/); assert.match(admin, /Rumi Guitars/);
  assert.match(admin, /action="\/api\/admin\/social\/x\/configure"/);
  assert.match(admin, /name="clientSecret"/);
  for (const secret of ['private-client-secret', 'client-id-example', 'legacy-secret']) assert.ok(!admin.includes(secret));
  const customer = render(await f.load('app/settings/x/page.tsx').default(query));
  assert.match(customer, /href="\/admin\/social-apps"/);
  assert.ok(!customer.includes('name="clientSecret"')); assert.ok(!customer.includes('name="clientId"'));
});
