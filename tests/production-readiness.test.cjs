const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { load } = require('./helpers/weekly-load.cjs');
const readiness = load('lib/operations/readiness.ts');
const valid = () => ({
  AUTH_SECRET: 'auth-unique-' + 'a'.repeat(40), TOKEN_ENCRYPTION_KEY: 'token-unique-' + 'b'.repeat(40),
  WORKER_SECRET: 'worker-unique-' + 'c'.repeat(40), CRON_SECRET: 'cron-unique-' + 'd'.repeat(40),
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test', NEXT_PUBLIC_APP_URL: 'https://rumi.test',
  OPENAI_API_KEY: 'provider-test-key', BLOB_READ_WRITE_TOKEN: 'storage-test-key',
});
test('production readiness rejects missing cron, placeholder/shared secrets and non-production origins', () => {
  assert.ok(Object.values(readiness.configurationChecks(valid())).every(Boolean));
  const env = valid(); delete env.CRON_SECRET;
  assert.equal(readiness.configurationChecks(env).CRON_SECRET, false);
  env.CRON_SECRET = env.WORKER_SECRET;
  assert.equal(readiness.configurationChecks(env).DISTINCT_SECRETS, false);
  env.AUTH_SECRET = 'replace-with-' + 'x'.repeat(40);
  assert.equal(readiness.configurationChecks(env).AUTH_SECRET, false);
  for (const origin of ['http://localhost:3000', 'https://rumi.test/path', 'https://user:password@rumi.test', 'https://rumi.test?redirect=1']) {
    assert.equal(readiness.configurationChecks({ ...valid(), NEXT_PUBLIC_APP_URL: origin }).NEXT_PUBLIC_APP_URL, false);
  }
  assert.equal(readiness.configurationChecks(valid(), true).STRIPE_SECRET_KEY, false);
});
test('required table checks match every Prisma model, detecting an empty/partial restore', () => {
  const models = [...fs.readFileSync('prisma/schema.prisma', 'utf8').matchAll(/^model\s+(\w+)\s+\{/gm)].map(match => match[1]);
  assert.deepEqual([...readiness.REQUIRED_TABLES].sort(), models.sort());
  assert.equal(readiness.missingTables([]).length, models.length);
  assert.equal(readiness.missingTables(models.map(tablename => ({ tablename }))).length, 0);
  assert.ok(readiness.missingTables([{ tablename: 'User' }]).includes('PublishJob'));
});
test('health fails closed for database outage, missing schema and broken cron config', async () => {
  const saved = { ...process.env };
  Object.assign(process.env, valid());
  let rows = readiness.REQUIRED_TABLES.map(tablename => ({ tablename })), outage = false;
  const route = load('app/api/health/route.ts', {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/prisma': { prisma: { $queryRaw: async () => { if (outage) throw new Error('private connection string'); return rows; } } },
  });
  try {
    let response = await route.GET(); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    rows = [{ tablename: 'User' }]; response = await route.GET(); assert.equal(response.status, 503); assert.equal((await response.json()).checks.schema, false);
    outage = true; response = await route.GET(); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private connection string/);
    outage = false; rows = readiness.REQUIRED_TABLES.map(tablename => ({ tablename })); delete process.env.CRON_SECRET;
    response = await route.GET(); assert.equal(response.status, 503); assert.equal((await response.json()).checks.CRON_SECRET, false);
  } finally {
    for (const name of Object.keys(process.env)) if (!(name in saved)) delete process.env[name];
    Object.assign(process.env, saved);
  }
});
test('read-only preflight exits nonzero on bad config without exposing secret values', () => {
  const secret = 'private-sentinel-do-not-print';
  const run = spawnSync(process.execPath, ['scripts/readiness-check.cjs'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: '', AUTH_SECRET: secret } });
  assert.equal(run.status, 1); assert.match(run.stderr, /configuration needs attention/); assert.doesNotMatch(run.stderr, new RegExp(secret));
});
