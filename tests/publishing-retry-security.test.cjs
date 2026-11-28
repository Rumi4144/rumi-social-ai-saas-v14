const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load({ role = 'owner', failure, job = { id: 'job', status: 'failed', externalPostId: null }, count = 1 } = {}) {
  const reads = [], writes = [];
  const json = (body, options = {}) => ({ body, status: options.status || 200 });
  const mocks = {
    'next/server': { NextResponse: { json } },
    '@/lib/auth/context': { tenantContext: async () => { if (failure) throw Error(failure); return { organizationId: 'mine', role }; } },
    '@/lib/prisma': { prisma: { publishJob: {
      findFirst: async query => { reads.push(query); return job; },
      updateMany: async query => { writes.push(query); return { count }; },
    } } },
    '@/lib/http/errors': { apiError: error => json({ error: error.message }, { status: error.message === 'UNAUTHENTICATED' ? 401 : 403 }) },
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(__dirname + '/../app/api/publishing/retry/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { module, exports: module.exports, require: name => mocks[name] || require(name), URL, Date });
  return { post: module.exports.POST, reads, writes };
}
function request(body = { jobId: 'job' }, origin = 'https://rumisocialai.com') {
  return new Request('https://rumisocialai.com/api/publishing/retry', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
  });
}

test('publishing retries require sign-in, write permissions and same-origin requests before accessing jobs', async () => {
  for (const [options, origin, status] of [
    [{ failure: 'UNAUTHENTICATED' }, undefined, 401],
    [{ role: 'viewer' }, undefined, 403],
    [{}, 'https://attacker.example', 403],
    [{}, '', 403],
  ]) {
    const api = load(options);
    assert.equal((await api.post(request(undefined, origin))).status, status);
    assert.equal(api.reads.length, 0); assert.equal(api.writes.length, 0);
  }
});
test('foreign or missing job IDs do not reveal jobs or mutate another workspace', async () => {
  const api = load({ job: null });
  assert.equal((await api.post(request({ jobId: 'foreign' }))).status, 404);
  assert.equal(api.reads[0].where.organizationId, 'mine');
  assert.equal(api.reads[0].where.id, 'foreign'); assert.equal(api.writes.length, 0);
});
test('published, pending and receipt-bearing deliveries cannot be republished through retry', async () => {
  for (const job of [
    { id: 'job', status: 'published', externalPostId: 'public-post' },
    { id: 'job', status: 'publishing', externalPostId: null },
    { id: 'job', status: 'retry', externalPostId: null },
    { id: 'job', status: 'scheduled', externalPostId: null },
    { id: 'job', status: 'failed', externalPostId: 'public-post' },
  ]) {
    const api = load({ job });
    assert.equal((await api.post(request())).status, 409); assert.equal(api.writes.length, 0);
  }
});
test('a legitimate failed delivery is atomically requeued within the current workspace', async () => {
  const api = load();
  const response = await api.post(request());
  assert.equal(response.status, 200);
  const query = api.writes[0];
  assert.deepEqual(JSON.parse(JSON.stringify(query.where)), { id: 'job', organizationId: 'mine', status: 'failed', externalPostId: null });
  assert.equal(query.data.attempts, 0); assert.equal(query.data.status, 'retry');
  assert.equal(query.data.lastError, null); assert.ok(query.data.scheduledFor instanceof Date);
});
test('a concurrent retry or worker transition returns conflict instead of another enqueue', async () => {
  const api = load({ count: 0 });
  assert.equal((await api.post(request())).status, 409);
});
test('malformed or empty job requests are rejected without database reads', async () => {
  const api = load();
  assert.equal((await api.post(request({ jobId: '' }))).status, 400);
  assert.equal((await api.post(new Request('https://rumisocialai.com/api/publishing/retry', { method: 'POST', headers: { origin: 'https://rumisocialai.com' }, body: '{broken' }))).status, 400);
  assert.equal(api.reads.length, 0);
});
