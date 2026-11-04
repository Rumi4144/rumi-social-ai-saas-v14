const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

test('campaign processing forwards preview auth to its same-origin worker', async () => {
  const file = path.resolve(__dirname, '../app/api/campaigns/process/route.ts');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const calls = [];
  const env = { WORKER_SECRET: 'worker-secret' };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    process: { env },
    URL,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return new Response('{"status":"succeeded"}', { status: 200 });
    },
    require: name => {
      if (name === 'next/server') {
        return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200 }) } };
      }
      if (name === '@/lib/auth/context') return { tenantContext: async () => ({ organizationId: 'org', role: 'owner' }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });

  const request = {
    url: 'https://preview.example/api/campaigns/process',
    headers: {
      get: name => ({
        cookie: 'vercel-auth-token=fake-session',
        authorization: 'Bearer fake-token',
      }[name] || null),
    },
    json: async () => ({ jobId: 'saved-job' }),
  };
  const response = await module.exports.POST(request);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'succeeded' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://preview.example/api/jobs/run');
  assert.equal(calls[0].options.headers.cookie, 'vercel-auth-token=fake-session');
  assert.equal(calls[0].options.headers.authorization, 'Bearer fake-token');
  assert.equal(calls[0].options.headers['x-worker-secret'], 'worker-secret');
});
