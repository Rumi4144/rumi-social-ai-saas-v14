const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { fixture, input, request } = require('./helpers/signup-fixture.cjs');

test('public signup stores only a hashed-token pending registration and sends a confirmation link without creating tenants', async () => {
  const f = fixture(), api = f.load('app/api/auth/register/route.ts');
  const response = await api.POST(request({ email: ' New@Example.com ' }));
  assert.equal(response.status, 202); assert.equal('userId' in response.body, false);
  assert.equal(f.state().users.size, 0); assert.equal(f.state().organizations.length, 0); assert.equal(f.state().subscriptions.length, 0);
  const token = f.token(), pending = f.state().jobs.get(f.pendingId(token));
  assert.equal(token.length, 64); assert.equal(pending.type, 'VERIFY_SIGNUP');
  assert.equal(pending.organizationId, '__public_signup__'); assert.equal(pending.status, 'awaiting_verification');
  assert.equal(pending.payload.passwordHash, f.PASSWORD_HASH); assert.equal(pending.payload.email, 'new@example.com');
  assert.ok(new Date(pending.payload.expiresAt) > new Date());
  assert.equal(JSON.stringify(pending).includes(input.password), false); assert.equal(JSON.stringify(pending).includes(token), false);
  assert.equal(f.sent[0].to[0], 'new@example.com'); assert.equal(f.sent[0].text.includes(input.password), false);
});
test('only explicit same-origin verification POST creates exactly one workspace, membership and trial then scrubs the pending data', async () => {
  const f = fixture(); await f.load('app/api/auth/register/route.ts').POST(request());
  const token = f.token(), api = f.load('app/api/auth/verify-email/route.ts');
  assert.equal((await api.GET()).status, 405); assert.equal(f.state().users.size, 0);
  assert.equal((await api.POST(request({ token }, '/api/auth/verify-email', 'https://attacker.example'))).status, 403);
  assert.equal((await api.POST(request({ token }, '/api/auth/verify-email', ''))).status, 403);
  assert.equal(f.state().users.size, 0);
  assert.equal((await api.POST(request({ token }, '/api/auth/verify-email'))).status, 200);
  assert.equal(f.state().users.size, 1); assert.equal(f.state().organizations.length, 1); assert.equal(f.state().brands.length, 1);
  assert.equal(f.state().memberships[0].role, 'owner'); assert.equal(f.state().subscriptions[0].credits, 100);
  const completed = f.state().jobs.get(f.pendingId(token));
  assert.equal(completed.status, 'completed'); assert.equal(JSON.stringify(completed.payload), '{}');
  assert.equal(JSON.stringify(completed).includes(f.PASSWORD_HASH), false);
  assert.equal((await api.POST(request({ token }, '/api/auth/verify-email'))).status, 410);
  assert.equal(f.state().organizations.length, 1);
});
test('expired, malformed and unknown tokens cannot create an account and expired hashes are removed', async () => {
  const f = fixture(); await f.load('app/api/auth/register/route.ts').POST(request());
  const token = f.token(), api = f.load('app/api/auth/verify-email/route.ts');
  const pending = f.state().jobs.get(f.pendingId(token)); pending.createdAt = new Date(Date.now() - 31 * 60 * 1000); pending.payload.expiresAt = new Date(Date.now() - 1000).toISOString();
  for (const value of [token, 'invalid', 'b'.repeat(64)]) assert.equal((await api.POST(request({ token: value }, '/api/auth/verify-email'))).status, 410);
  assert.equal(f.state().users.size, 0); assert.equal(f.state().jobs.size, 0);
});
test('concurrent confirmation clicks and distinct signup tokens for the same email cannot grant extra workspaces or trials', async () => {
  const f = fixture(), register = f.load('app/api/auth/register/route.ts');
  await register.POST(request()); const first = f.token();
  await register.POST(request({ email: 'NEW@EXAMPLE.COM' })); const second = f.token();
  assert.notEqual(first, second);
  const verify = f.load('app/api/auth/verify-email/route.ts');
  const results = await Promise.all([first, first, second, second].map(token => verify.POST(request({ token }, '/api/auth/verify-email'))));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 200, 410, 410]);
  assert.equal(f.state().users.size, 1); assert.equal(f.state().organizations.length, 1);
  assert.equal(f.state().memberships.length, 1); assert.equal(f.state().subscriptions.length, 1);
});
test('failed verification transaction rolls back its claim and every partial account write, allowing a safe retry', async () => {
  const f = fixture({ failTransaction: true }); await f.load('app/api/auth/register/route.ts').POST(request());
  const token = f.token(), verify = f.load('app/api/auth/verify-email/route.ts');
  assert.equal((await verify.POST(request({ token }, '/api/auth/verify-email'))).status, 503);
  assert.equal(f.state().users.size, 0); assert.equal(f.state().organizations.length, 0);
  assert.equal(f.state().jobs.get(f.pendingId(token)).status, 'awaiting_verification');
  f.failTransaction(false);
  assert.equal((await verify.POST(request({ token }, '/api/auth/verify-email'))).status, 200);
  assert.equal(f.state().subscriptions.length, 1);
});
test('existing and invited accounts get the same signup response and cannot have passwords or roles replaced', async () => {
  const f = fixture(), register = f.load('app/api/auth/register/route.ts');
  const initial = await register.POST(request()); const token = f.token();
  f.state().users.set(input.email, { id: 'invited', email: input.email, passwordHash: 'existing-hash' });
  f.state().memberships.push({ userId: 'invited', organizationId: 'existing-org', role: 'admin' });
  const again = await register.POST(request());
  assert.equal(again.status, initial.status); assert.equal(JSON.stringify(again.body), JSON.stringify(initial.body));
  assert.equal(f.sent.length, 1);
  assert.equal((await f.load('app/api/auth/verify-email/route.ts').POST(request({ token }, '/api/auth/verify-email'))).status, 200);
  assert.equal(f.state().users.get(input.email).passwordHash, 'existing-hash');
  assert.equal(f.state().memberships[0].role, 'admin'); assert.equal(f.state().organizations.length, 0); assert.equal(f.state().subscriptions.length, 0);
});
test('mail configuration and delivery failures fail closed without creating accounts or retaining undeliverable signup secrets', async () => {
  for (const options of [{ env: { RESEND_API_KEY: '' } }, { env: { RESEND_FROM_EMAIL: '' } }, { failDelivery: true }, { failDelivery: 'throw' }]) {
    const f = fixture(options), api = f.load('app/api/auth/register/route.ts');
    assert.equal((await api.POST(request())).status, 503);
    assert.equal(f.state().users.size, 0); assert.equal(f.state().organizations.length, 0); assert.equal(f.state().jobs.size, 0);
    if (options.env) assert.equal((await api.GET()).body.mode, 'unavailable');
  }
});
test('signup and verification quotas apply across app instances and identities are hashed', async () => {
  const f = fixture(), one = f.load('app/api/auth/register/route.ts'), two = f.load('app/api/auth/register/route.ts');
  for (let i = 0; i < 3; i++) assert.equal((await (i % 2 ? one : two).POST(request())).status, 202);
  assert.equal((await two.POST(request({ email: ' NEW@example.com ' }))).status, 429); assert.equal(f.sent.length, 3);
  const token = 'a'.repeat(64), verify = f.load('app/api/auth/verify-email/route.ts');
  for (let i = 0; i < 10; i++) assert.equal((await verify.POST(request({ token }, '/api/auth/verify-email'))).status, 410);
  assert.equal((await verify.POST(request({ token }, '/api/auth/verify-email'))).status, 429);
  assert.ok([...f.limits.keys()].every(key => !key.includes('@') && !key.includes(token)));
});
test('security challenge or quota failures never create an account', async () => {
  const f = fixture({ failLimits: true }), api = f.load('app/api/auth/register/route.ts');
  assert.equal((await api.POST(request())).status, 429); assert.equal(f.sent.length, 0); assert.equal(f.state().jobs.size, 0);
});
test('malformed, oversized, cross-origin and missing-industry signup requests are rejected before storing pending data', async () => {
  const f = fixture(), api = f.load('app/api/auth/register/route.ts');
  for (const invalid of [{ password: 'a'.repeat(73) }, { password: '界'.repeat(30) }, { name: 'a'.repeat(101) }, { organization: 'a'.repeat(151) }, { industry: 'Unknown' }]) assert.equal((await api.POST(request(invalid))).status, 400);
  assert.equal((await api.POST(request({}, '/api/auth/register', 'https://attacker.example'))).status, 403);
  assert.equal((await api.POST(new Request('https://rumisocialai.com/api/auth/register', { method: 'POST', headers: { Origin: 'https://rumisocialai.com' }, body: '{bad' }))).status, 400);
  assert.equal(f.state().jobs.size, 0); assert.equal(f.sent.length, 0);
});
test('expired signup cleanup is bounded and cannot erase actual tenant jobs', async () => {
  const f = fixture(), helper = f.load('lib/auth/signup-verification.ts');
  const createdAt = new Date(Date.now() - 31 * 60 * 1000);
  for (let i = 0; i < 60; i++) f.state().jobs.set(`expired-${i}`, { id: `expired-${i}`, type: 'VERIFY_SIGNUP', organizationId: '__public_signup__', status: 'awaiting_verification', createdAt, payload: { passwordHash: f.PASSWORD_HASH } });
  f.state().jobs.set('real-tenant', { id: 'real-tenant', type: 'VERIFY_SIGNUP', organizationId: 'org', status: 'awaiting_verification', createdAt, payload: {} });
  await helper.purgeExpiredSignups();
  assert.equal(f.state().jobs.size, 11); assert.equal(f.state().jobs.has('real-tenant'), true);
});
test('verification page never automatically submits and offers explicit confirmation and signup recovery', () => {
  const page = fs.readFileSync(__dirname + '/../app/verify-email/verify-email.tsx', 'utf8');
  assert.match(page, /onClick=\{confirm\}/); assert.match(page, /method: "POST"/);
  const effect = page.match(/useEffect\(\(\) => \{([^}]+)\}/)[1];
  assert.doesNotMatch(effect, /fetch|confirm\(/); assert.match(page, /href="\/signup"/);
  const serverPage = fs.readFileSync(__dirname + '/../app/verify-email/page.tsx', 'utf8');
  assert.match(serverPage, /referrer: "no-referrer"/);
});
