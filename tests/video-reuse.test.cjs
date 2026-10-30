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
function fixture(options={}){const changes=[];const tx={contentItem:{findFirst:async()=>({id:'target',campaignId:'campaign',status:'draft',campaign:{brandId:'brand'}}),update:async q=>changes.push(q)},campaign:{findMany:async q=>{assert.equal(q.where.brandId,'brand');return [{id:'campaign'},{id:'earlier'}]}},mediaAsset:{findFirst:async q=>{assert.equal(q.where.organizationId,'org');assert.deepEqual(Array.from(q.where.campaignId.in),['campaign','earlier']);return options.foreign?null:{id:'source',url:'/api/video/media/source',prompt:'Saved clip',metadata:{pathname:'reels/org/original/video.mp4',contentType:'video/mp4'}}},create:async q=>{changes.push(q);return {id:'reused'}}},publishJob:{findFirst:async()=>options.scheduled?{id:'active'}:null}};const api=load('app/api/video/reuse/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({isSuperAdmin:!options.viewer,organizationId:'org',role:options.viewer?'viewer':'owner'})},'@/lib/prisma':{prisma:{$transaction:async fn=>fn(tx)}}});return {api,changes};}
const req=()=>new Request('https://app.test/api/video/reuse',{method:'POST',body:JSON.stringify({contentItemId:'target',assetId:'source'})});
test('reusing same-brand video creates a reference for the destination without changing its source',async()=>{const f=fixture();const r=await f.api.POST(req());assert.equal(r.status,200);assert.equal(f.changes[0].data.metadata.reusedFromAssetId,'source');assert.equal(f.changes[0].data.contentItemId,'target');assert.equal(f.changes[1].where.id,'target');assert.equal(f.changes[1].data.mediaUrl,'/api/video/media/reused');assert.equal(f.changes[1].data.status,'draft');});
test('viewers, other-brand clips and scheduled posts cannot be changed',async()=>{for(const options of [{viewer:true},{foreign:true},{scheduled:true}]){const f=fixture(options);assert.ok([403,404,409].includes((await f.api.POST(req())).status));assert.equal(f.changes.length,0);}});
test('private storage resolves through the authorized original asset rather than the destination post path',async()=>{const original={id:'source',organizationId:'org',url:'/api/video/media/source',contentItemId:'original',metadata:{pathname:'reels/org/original/video.mp4'}};let query;const {resolveVideoAsset}=load('lib/video/reuse.ts',{'@/lib/prisma':{prisma:{mediaAsset:{findFirst:async q=>{query=q;return original}}}}});const result=await resolveVideoAsset({id:'copy',organizationId:'org',url:'internal',contentItemId:'target',metadata:{reusedFromAssetId:'source'}});assert.equal(result.id,'source');assert.equal(result.contentItemId,'original');assert.equal(query.where.organizationId,'org');});
