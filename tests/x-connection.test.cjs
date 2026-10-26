const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

const origin = 'https://rumisocialai.com';
function fixture() {
  const publishes = new Map(), jobs = new Map(), connections = new Map(), jar = new Map(), calls = [], cache = new Map();
  const ctx = { userId: 'user', organizationId: 'org', role: 'owner', isSuperAdmin: false };
  const env = { NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: origin, TOKEN_ENCRYPTION_KEY: 'test-encryption-key' };
  let accountStatus = 200, tokenStatus = 200, onAccount;
  function matches(row, where) {
    return Object.entries(where).every(([key, value]) => value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : value && typeof value === 'object' && 'lt' in value ? row[key] < value.lt : row[key] === value);
  }
  const model = map => ({
    findFirst: async ({ where }) => [...map.values()].find(row => matches(row, where)) || null,
    findMany: async ({ where, select }) => [...map.values()].filter(row => matches(row, where)).map(row => select ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row),
    count: async ({ where }) => [...map.values()].filter(row => matches(row, where)).length,
    create: async ({ data }) => { assert.ok(!map.has(data.id)); map.set(data.id, { createdAt: new Date(), ...data }); return map.get(data.id); },
    upsert: async ({ where, create, update }) => { if (map.has(where.id)) Object.assign(map.get(where.id), update); else map.set(where.id, { createdAt: new Date(), ...create }); return map.get(where.id); },
    updateMany: async ({ where, data }) => { let count = 0; for (const row of map.values()) if (matches(row, where)) { Object.assign(row, data); count++; } return { count }; },
    deleteMany: async ({ where }) => { let count = 0; for (const [id, row] of map) if (matches(row, where)) { map.delete(id); count++; } return { count }; },
  });
  const prisma = { publishJob: model(publishes), job: model(jobs), socialConnection: model(connections), $transaction: async run => run(prisma) };
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
    if (url.endsWith('/users/me')) { if (onAccount) await onAccount(); return Response.json(accountStatus === 200 ? { data: { id: '12345', username: 'RumiGuitars' } } : { error: 'private-provider-error' }, { status: accountStatus }); }
    if (url.endsWith('/revoke')) return Response.json({ revoked: true });
    throw new Error(`Unexpected URL: ${url}`);
  };
  const mocks = {
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
      require: name => mocks[name] || (name.startsWith('@/') ? load(name.slice(2) + '.ts') : require(name)),
    });
    return module.exports;
  }
  const client = load('lib/x/connection.ts'), security = load('lib/security/crypto.ts');
  const routes = Object.fromEntries(['configure', 'connect', 'callback', 'disconnect'].map(route => [route, load(`app/api/social/x/${route}/route.ts`)]));
  const post = (route, data, requestOrigin = origin) => routes[route].POST(new Request(`${origin}/api/social/x/${route}`, { method: 'POST', headers: { origin: requestOrigin }, body: new URLSearchParams(data) }));
  const configure = () => post('configure', { clientId: 'client-id-example', clientSecret: 'private-client-secret' });
  async function start() {
    if (!connections.size) await configure();
    const response = await post('connect', { consent: 'yes' });
    for (const [name, cookie] of response.savedCookies) jar.set(name, cookie.value);
    return { response, url: new URL(response.headers.get('location')) };
  }
  const callback = (state, params = { code: 'provider-code' }) => routes.callback.GET(new Request(`${origin}/api/social/x/callback?${new URLSearchParams({ state, ...params })}`));
  return { publishes, ctx, env, jobs, connections, calls, jar, client, security, routes, post, configure, start, callback, load,
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
  for (const role of ['viewer', 'member', 'unknown']) {
    const f = fixture(); f.ctx.role = role;
    assert.equal((await f.configure()).status, 403); assert.equal(f.connections.size, 0);
  }
  for (const requestOrigin of ['https://attacker.example', 'null', '']) {
    const f = fixture();
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
  const config = [...f.connections.values()].find(row => row.provider === 'x_app').encryptedToken;
  assert.match(location(await f.configure()), /reason=disconnect_first/);
  assert.equal([...f.connections.values()].find(row => row.provider === 'x_app').encryptedToken, config);
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
  await f.configure();
  assert.equal((await f.client.xCredentials('org')).clientId, 'client-id-example');
  assert.equal((await f.client.xCredentials('other-org')).clientId, 'shared-id');
  f.env.NEXT_PUBLIC_APP_URL = 'http://rumisocialai.com';
  assert.throws(() => f.client.xCallbackUrl(), /X_APP_URL/);
});

test('X settings renders usable setup fields, never echoes credentials, and offers posting upgrade for legacy accounts', async () => {
  const f = fixture();
  const page = f.load('app/settings/x/page.tsx').default;
  const render = require('react-dom/server').renderToStaticMarkup;
  const first = render(await page({ searchParams: Promise.resolve({}) }));
  assert.match(first, /type="password"/); assert.match(first, /name="clientId"/);
  assert.match(first, /https:\/\/rumisocialai.com\/api\/social\/x\/callback/);
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
