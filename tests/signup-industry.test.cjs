const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, request } = require('./helpers/signup-fixture.cjs');

test('all ten signup industries persist only after email verification creates the new brand', async () => {
  const f = fixture(), { INDUSTRIES } = f.load('lib/industries.ts');
  assert.equal(INDUSTRIES.length, 10);
  for (const [index, industry] of INDUSTRIES.entries()) {
    const api = f.load('app/api/auth/register/route.ts');
    const response = await api.POST(request({ industry, email: `new${index}@example.com` }));
    assert.equal(response.status, 202); assert.equal(f.state().brands.length, index);
    const verify = f.load('app/api/auth/verify-email/route.ts');
    assert.equal((await verify.POST(request({ token: f.token() }, '/api/auth/verify-email'))).status, 200);
    assert.equal(f.state().brands[index].industry, industry);
    assert.equal(f.state().brands[index].organizationId, f.state().organizations[index].id);
  }
});
test('unknown or missing signup industry is rejected before sending email or creating an account', async () => {
  const f = fixture(), api = f.load('app/api/auth/register/route.ts');
  assert.equal((await api.POST(request({ industry: 'Unknown' }))).status, 400);
  assert.equal((await api.POST(request({ industry: undefined }))).status, 400);
  assert.equal(f.sent.length, 0); assert.equal(f.state().jobs.size, 0);
});
test('protected signup rejects missing or invalid challenge before storing a pending registration', async () => {
  const f = fixture(), api = f.load('app/api/auth/register/route.ts', {
    '@/lib/turnstile': { signupProtection: () => ({ mode: 'protected', siteKey: 'public-test', secret: 'private-test' }), verifySignupChallenge: async (_secret, token) => token === 'approved' },
  });
  assert.equal((await api.POST(request())).status, 400);
  assert.equal((await api.POST(request({ challenge: 'bad' }))).status, 400);
  assert.equal(f.state().jobs.size, 0);
  assert.equal((await api.POST(request({ challenge: 'approved' }))).status, 202);
  assert.equal(f.state().jobs.size, 1); assert.equal(f.state().users.size, 0);
  assert.equal((await api.GET()).body.secret, undefined);
});
