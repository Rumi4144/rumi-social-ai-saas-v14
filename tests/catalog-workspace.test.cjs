const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks = {}, cache = new Map()) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const requireFile = name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/') || name.startsWith('.')) {
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
      return load(base.endsWith('.ts') ? base : `${base}.ts`, mocks, cache);
    }
    return require(name);
  };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: requireFile, process, Buffer, URL, console, fetch: mocks.__fetch || fetch, AbortSignal, FormData, Blob, Response, Uint8Array, Headers, ReadableStream, setTimeout, clearTimeout }, { filename: file });
  return module.exports;
}


const json=(body,options={})=>({body,status:options.status||200});
test('Master Mind catalog reads only its brand and never fetches the Rumi guitar catalog',async()=>{let productQuery;const api=load('app/api/video/presenter/products/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'mind-org'})},'@/lib/prisma':{prisma:{campaign:{findFirst:async q=>{assert.equal(q.where.brand.organizationId,'mind-org');return {brandId:'mind-brand',brand:{websiteUrl:'https://mastermind.example'}}}},product:{findMany:async q=>{productQuery=q;return []}}}},__fetch:async()=>{throw Error('must not fetch Rumi catalog for another business')}});const r=await api.GET(new Request('https://app.test/api/video/presenter/products?campaignId=mind-campaign'));assert.equal(r.status,200);assert.equal(productQuery.where.brandId,'mind-brand');assert.equal(r.body.products.length,0);});
test('foreign campaigns cannot expose catalog products',async()=>{const api=load('app/api/video/presenter/products/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'mind-org'})},'@/lib/prisma':{prisma:{campaign:{findFirst:async()=>null},product:{findMany:async()=>{throw Error('must not load foreign products')}}}}});assert.equal((await api.GET(new Request('https://app.test/api/video/presenter/products?campaignId=foreign'))).status,404);});
