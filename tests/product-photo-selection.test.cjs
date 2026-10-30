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
  vm.runInNewContext(js, { module, exports: module.exports, require: requireFile, process, Buffer, URL, console, fetch: mocks.__fetch || fetch, AbortSignal, FormData, Blob, Request, Response, Uint8Array, Headers, ReadableStream, setTimeout, clearTimeout }, { filename: file });
  return module.exports;
}


const json=(body,options={})=>({body,status:options.status||200});
const {photoProducts}=load('lib/presenter/catalog-choices.ts');
test('photo suggestions exclude campaign headlines, missing photos and duplicate website products',()=>{
 const result=photoProducts([{id:'post-p',name:'A headline',imageUrl:'https://img/a'},{id:'missing',name:'No photo'},{id:'a',name:'Actual guitar',imageUrl:'https://img/guitar',sourceUrl:'https://shop/guitar'},{id:'duplicate',name:'Same guitar',imageUrl:'https://img/guitar',sourceUrl:'https://shop/guitar'}]);
 assert.deepEqual(Array.from(result,p=>p.id),['a']);
});
function fixture(options={}){const changes=[];let queried=false;const tx={contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'org');return options.missing?null:{id:'post',status:options.published?'published':'draft'}},update:async q=>changes.push(['post',q.data])},publishJob:{findFirst:async()=>options.scheduled?{id:'job'}:null},mediaAsset:{updateMany:async q=>changes.push(['retire',q]),create:async q=>changes.push(['photo',q.data])}};const api=load('app/api/products/select-photo/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({isSuperAdmin:!options.viewer,organizationId:'org',role:options.viewer?'viewer':'owner'})},'@/lib/prisma':{prisma:{$transaction:async fn=>{queried=true;return fn(tx)}}},'@/app/api/video/presenter/products/route':{GET:async()=>({ok:true,json:async()=>({products:[{id:'actual',name:'Actual guitar',description:'Verified catalog details',imageUrl:'https://shop/photo.jpg',sourceUrl:'https://shop/guitar'}]})})}});return {api,changes,queried:()=>queried};}
const req=(id='actual')=>new Request('https://app.test/api/products/select-photo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId:'campaign',contentItemId:'post',productId:id})});
test('selection uses authoritative catalog photo and details and returns the post to draft',async()=>{const f=fixture();assert.equal((await f.api.POST(req())).status,200);const photo=f.changes.find(c=>c[0]==='photo')[1],post=f.changes.find(c=>c[0]==='post')[1];assert.equal(photo.url,'https://shop/photo.jpg');assert.equal(photo.metadata.userSelected,true);assert.equal(post.headline,'Actual guitar');assert.match(post.caption,/Verified catalog details/);assert.equal(post.status,'draft');});
test('unknown products, viewers and scheduled posts cannot replace campaign media',async()=>{for(const options of [{viewer:true},{scheduled:true},{published:true},{missing:true}]){const f=fixture(options);assert.ok([403,404,409].includes((await f.api.POST(req())).status));assert.equal(f.changes.length,0);}const f=fixture();assert.equal((await f.api.POST(req('foreign'))).status,400);assert.equal(f.queried(),false);});
