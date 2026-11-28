const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(mocks = {}, env = {}) {
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, Date, URL, Request, TextEncoder, Uint8Array,
      crypto: require('node:crypto').webcrypto, process: { env }, console,
      require: name => name in mocks ? mocks[name] : name.startsWith('@/') ? load(name.slice(2) + '.ts') : require(name),
    });
    return module.exports;
  }
  return load;
}
function store() {
  const buckets = new Map();
  return { buckets, prisma: { apiRateBucket: { upsert: async ({ where, create }) => {
    const count = (buckets.get(where.key)?.count || 0) + 1;
    const value = { ...create, count }; buckets.set(where.key, value); return value;
  } } } };
}
test('normalized email quota is shared across separate application instances and contains no raw identity', async () => {
  const db = store();
  const a = loader({ '@/lib/prisma': { prisma: db.prisma } })('lib/auth/login-throttle.ts');
  const b = loader({ '@/lib/prisma': { prisma: db.prisma } })('lib/auth/login-throttle.ts');
  for (let i = 0; i < 10; i++) assert.equal(await (i % 2 ? a : b).allowCredentialAttempt(i % 2 ? ' Test@Example.com ' : 'test@example.com'), true);
  assert.equal(await a.allowCredentialAttempt('TEST@example.com'), false);
  assert.equal(db.buckets.size, 1);
  assert.ok([...db.buckets.keys()].every(key => !key.includes('example') && !key.includes('@')));
  assert.equal(await b.allowCredentialAttempt('another@example.com'), true);
});
test('Vercel request IP quota limits attempts spread across different accounts', async () => {
  const db = store();
  const api = loader({ '@/lib/prisma': { prisma: db.prisma } }, { VERCEL: '1' })('lib/auth/login-throttle.ts');
  const request = new Request('https://rumisocialai.com/login', { headers: { 'x-vercel-forwarded-for': '203.0.113.2' } });
  for (let i = 0; i < 100; i++) assert.equal(await api.allowCredentialAttempt(`account${i}@example.com`, request), true);
  assert.equal(await api.allowCredentialAttempt('next@example.com', request), false);
  assert.ok([...db.buckets.keys()].every(key => !key.includes('203.0.113.2')));
});
test('untrusted forwarded IP headers do not partition or exhaust identity protection outside Vercel', async () => {
  const db = store();
  const api = loader({ '@/lib/prisma': { prisma: db.prisma } })('lib/auth/login-throttle.ts');
  for (let i = 0; i < 10; i++) assert.equal(await api.allowCredentialAttempt('test@example.com', new Request('https://app.test', { headers: { 'x-vercel-forwarded-for': `203.0.113.${i}`, 'x-forwarded-for': `203.0.113.${i}` } })), true);
  assert.equal(await api.allowCredentialAttempt('test@example.com'), false);
  assert.equal(db.buckets.size, 1);
});
test('credential throttling fails closed if the distributed store is unavailable', async () => {
  const api = loader({ '@/lib/prisma': { prisma: { apiRateBucket: { upsert: async () => { throw Error('offline'); } } } } })('lib/auth/login-throttle.ts');
  assert.equal(await api.allowCredentialAttempt('known@example.com'), false);
  assert.equal(await api.allowCredentialAttempt('unknown@example.com'), false);
});
test('credential provider checks throttle before database lookup or password verification', async () => {
  let config, allowed = false, reads = 0, compares = 0;
  loader({
    'next-auth': settings => { config = settings; return {}; },
    'next-auth/providers/credentials': settings => settings,
    '@/lib/auth/login-throttle': { allowCredentialAttempt: async email => { assert.equal(email, 'test@example.com'); return allowed; } },
    '@/lib/prisma': { prisma: { user: { findUnique: async () => { reads++; return { id: 'u', email: 'test@example.com', name: 'Test', passwordHash: 'hash' }; } } } },
    '@/lib/activity/store': { recordActivity: async () => {} },
    bcryptjs: { compare: async () => { compares++; return true; } },
  })('auth.ts');
  const credentials = { email: ' Test@Example.com ', password: 'correct-password' };
  assert.equal(await config.providers[0].authorize(credentials, new Request('https://app.test')), null);
  assert.equal(reads, 0); assert.equal(compares, 0);
  allowed = true;
  assert.equal((await config.providers[0].authorize(credentials, new Request('https://app.test'))).id, 'u');
  assert.equal(reads, 1); assert.equal(compares, 1);
});
