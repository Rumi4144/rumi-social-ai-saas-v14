const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { load } = require('./helpers/weekly-load.cjs');

test('admin recovery dispatches only the selected step when another worker wins the race', async () => {
  const job = { id: 'selected-image', organizationId: 'org-a', type: 'GENERATE_IMAGE', status: 'failed', attempts: 1,
    payload: { campaignId: 'campaign-a', sourceImageUrl: 'https://brand.test/original.jpg' }, result: null };
  let selectedClaimed = false, siblingExecuted = false;
  const tx = { job: {
    findFirst: async ({ where }) => {
      assert.equal(where.organizationId, 'org-a');
      if (where.type === 'WEEKLY_PACK') return { payload: { campaignId: 'campaign-a' } };
      if (where.type === 'IMAGE_PROVIDER_TASK') return null;
      assert.equal(where.id, job.id);
      assert.equal(where.payload.equals, 'campaign-a');
      return job;
    },
    updateMany: async ({ where, data }) => {
      assert.equal(where.status, 'failed'); assert.equal(where.id, job.id); assert.equal(where.organizationId, 'org-a');
      Object.assign(job, data);
      return { count: 1 };
    },
  } };
  const deps = {
    'next/server': { NextResponse: Response },
    '@/lib/prisma': { prisma: { $transaction: async callback => callback(tx) } },
    '@/lib/admin/context': { superAdminContext: async () => ({ id: 'master' }) },
    '@/lib/http/errors': { apiError: error => { throw error; } },
    '@/lib/weekly/plan': { manifestOf: payload => payload },
    '@/lib/weekly/recovery': load('lib/weekly/recovery.ts'),
  };
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync('app/api/admin/weekly/retry/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Request, Response, URL,
    process: { env: { WORKER_SECRET: 'test-worker' } }, require: name => name in deps ? deps[name] : require(name),
    fetch: async (url, init) => {
      assert.equal(url, 'https://rumi.test/api/jobs/run');
      assert.equal(init.headers['x-worker-secret'], 'test-worker');
      const body = JSON.parse(init.body);
      assert.equal(body.organizationId, 'org-a'); assert.equal(body.jobId, job.id);
      // Simulate the cron having claimed this exact job before dispatch arrives.
      job.status = 'running'; selectedClaimed = true;
      if (body.exact !== true) siblingExecuted = true;
      return Response.json({ status: 'idle' });
    },
  });
  const response = await module.exports.POST(new Request('https://rumi.test/api/admin/weekly/retry', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId: 'org-a', packId: 'pack-a', jobId: job.id }),
  }));
  assert.equal(response.status, 200); assert.equal((await response.json()).status, 'idle');
  assert.equal(selectedClaimed, true); assert.equal(siblingExecuted, false);
});
