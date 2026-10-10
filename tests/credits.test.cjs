const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
function route(context, records, reads) {
  const module = { exports: {} };
  const deps = {
    'next/server': { NextResponse: { json: (body, init) => new Response(JSON.stringify(body), init) } },
    '@/lib/auth/context': { tenantContext: context },
    '@/lib/prisma': { prisma: { subscription: { findUnique: async ({ where }) => { reads.push(where.organizationId); return records[where.organizationId] ?? null; } } } },
    '@/lib/http/errors': { apiError: error => new Response(JSON.stringify({ error: error.message }), { status: error.message === 'UNAUTHENTICATED' ? 401 : 500 }) },
    '@/lib/credits': { CREDIT_COST: { textCampaign: 3, staticCreative: 5, voiceover: 4, videoScene: 40, videoAssembly: 2 } },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../app/api/credits/route.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => deps[name] });
  return module.exports;
}
test('credit balances follow the authenticated workspace and are never cached', async () => {
  let organizationId = 'rumi'; const reads = [];
  const api = route(async () => ({ organizationId }), { rumi: { plan: 'business', credits: 81 }, other: { plan: 'starter', credits: 12 } }, reads);
  let response = await api.GET(); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal((await response.json()).balance, 81);
  organizationId = 'other'; assert.equal((await (await api.GET()).json()).balance, 12);
  organizationId = 'empty'; const empty = await (await api.GET()).json(); assert.equal(empty.balance, 0); assert.equal(empty.plan, null);
  assert.deepEqual(reads, ['rumi', 'other', 'empty']);
});
test('signed-out users cannot query workspace credits', async () => {
  const reads = []; const api = route(async () => { throw new Error('UNAUTHENTICATED'); }, {}, reads);
  assert.equal((await api.GET()).status, 401); assert.equal(reads.length, 0);
});
