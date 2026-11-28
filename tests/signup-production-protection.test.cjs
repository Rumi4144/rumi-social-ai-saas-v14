const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(env, result = {}, fetchFailure = false) {
  const module = { exports: {} };
  const calls = [];
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(__dirname + '/../lib/turnstile.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, process: { env }, URLSearchParams, AbortSignal,
    fetch: async (...args) => { calls.push(args); if (fetchFailure) throw Error('unavailable'); return { ok: true, json: async () => result }; },
  });
  return { ...module.exports, calls };
}
test('production signup fails closed on Vercel and standalone Node when protection keys are absent', () => {
  for (const env of [{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }, { TURNSTILE_SITE_KEY: 'partial' }, { TURNSTILE_SECRET_KEY: 'partial' }]) {
    assert.equal(load(env).signupProtection().mode, 'unavailable');
  }
  assert.equal(load({ NODE_ENV: 'development' }).signupProtection().mode, 'local');
  assert.equal(load({ NODE_ENV: 'production', TURNSTILE_SITE_KEY: 'site', TURNSTILE_SECRET_KEY: 'secret' }).signupProtection().mode, 'protected');
});
test('a successful challenge must belong to this hostname and signup action', async () => {
  for (const result of [
    { success: false, hostname: 'rumisocialai.com', action: 'signup' },
    { success: true, hostname: 'attacker.example', action: 'signup' },
    { success: true, hostname: 'rumisocialai.com', action: 'login' },
  ]) assert.equal(await load({}, result).verifySignupChallenge('secret', 'token'), false);
  assert.equal(await load({}, { success: true, hostname: 'rumisocialai.com', action: 'signup' }).verifySignupChallenge('secret', 'token'), true);
});
test('missing or oversized challenges never call the verification service', async () => {
  const api = load({});
  assert.equal(await api.verifySignupChallenge('secret', undefined), false);
  assert.equal(await api.verifySignupChallenge('secret', 'a'.repeat(2049)), false);
  assert.equal(api.calls.length, 0);
});
