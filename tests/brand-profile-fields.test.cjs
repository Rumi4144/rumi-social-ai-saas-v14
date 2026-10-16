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
function fixture(){const updates=[],queries=[];const api=load('app/api/brand-brain/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'mind'})},'@/lib/prisma':{prisma:{brand:{findFirst:async q=>{queries.push(q);return {id:'current-brand'}},update:async q=>{updates.push(q);return q.data}}}}});return {api,updates,queries};}
const req=body=>new Request('https://app.test/api/brand-brain',{method:'POST',body:JSON.stringify(body)});
test('website industry and business context save on the same latest workspace brand that is loaded',async()=>{const f=fixture();const r=await f.api.POST(req({name:'Master Mind',websiteUrl:'https://mind.example',industry:'Health & Wellness',description:'Hypnosis education',targetAudience:'Adults'}));assert.equal(r.status,200);assert.equal(f.queries[0].where.organizationId,'mind');assert.equal(f.queries[0].orderBy.createdAt,'desc');assert.equal(f.updates[0].data.websiteUrl,'https://mind.example');assert.equal(f.updates[0].data.description,'Hypnosis education');assert.equal(f.updates[0].where.id,'current-brand');});
test('older clients leave unsubmitted website and description fields intact',async()=>{const f=fixture();assert.equal((await f.api.POST(req({name:'Master Mind',voice:'Warm'}))).status,200);assert.equal('websiteUrl' in f.updates[0].data,false);assert.equal('description' in f.updates[0].data,false);});
test('invalid website input is rejected without changing the brand',async()=>{for(const websiteUrl of ['javascript:alert(1)','not a URL','https://user:secret@mind.example']){const f=fixture();assert.equal((await f.api.POST(req({name:'Master Mind',websiteUrl}))).status,400);assert.equal(f.updates.length,0);}});
