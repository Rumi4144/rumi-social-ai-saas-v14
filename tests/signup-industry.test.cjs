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
const input={email:'new@example.com',name:'New Customer',password:'valid-password',organization:'New Business',industry:'Health & Wellness'};
const req=(extra={})=>new Request('https://app.test/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,...extra})});
test('all ten signup industries persist to the new brand inside the registration transaction',async()=>{
 const {INDUSTRIES}=load('lib/industries.ts');assert.equal(INDUSTRIES.length,10);
 for(const industry of INDUSTRIES){let brand;const prisma={$transaction:async fn=>fn({user:{create:async()=>({id:'user'})},organization:{create:async()=>({id:'org'})},brand:{create:async q=>{brand=q.data}},membership:{create:async()=>({})},subscription:{create:async()=>({})}})};
 const api=load('app/api/auth/register/route.ts',{'next/server':{NextResponse:{json}},'@/lib/prisma':{prisma},bcryptjs:{hash:async()=> 'hashed'}});
 const result=await api.POST(req({industry}));assert.equal(result.status,201);assert.equal(brand.industry,industry);assert.equal(brand.organizationId,'org');
 }
});
test('unknown or missing signup industry is rejected before creating an account',async()=>{
 const api=load('app/api/auth/register/route.ts',{'next/server':{NextResponse:{json}},'@/lib/prisma':{prisma:{$transaction:()=>{throw Error('must not create')}}},bcryptjs:{hash:async()=> 'hashed'}});
 assert.equal((await api.POST(req({industry:'Unknown'}))).status,400);assert.equal((await api.POST(req({industry:undefined}))).status,400);
});
