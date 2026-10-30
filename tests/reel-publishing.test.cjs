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
const input={organizationId:'mind',contentItemId:'post',assetId:'reel',headline:'Notice your breathing',caption:'Pause and notice your breathing.'};
const request=(extra={})=>new Request('https://app.test/api/reels/prepare-publishing',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,...extra})});
function fixture(options={}) {
 const changes=[];let transactions=0;
 const item={id:'post',campaignId:'campaign',status:'draft',headline:input.headline,caption:input.caption,...options.item};
 const asset={id:'reel',url:'/api/video/media/reel',metadata:{contentType:'video/mp4'},...options.asset};
 const prisma={$transaction:async fn=>{
   transactions++;
   return fn({
     contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'mind');return item},update:async q=>{changes.push(q);return {...item,...q.data}}},
     mediaAsset:{findFirst:async q=>{assert.equal(q.where.organizationId,'mind');assert.equal(q.where.campaignId,item.campaignId);assert.equal(q.where.contentItemId,item.id);return options.missingAsset?null:asset}},
     publishJob:{findFirst:async q=>{assert.equal(q.where.organizationId,'mind');assert.ok(q.where.status.in.includes('processing'));assert.ok(q.where.status.in.includes('verification_pending'));return options.active?{id:'active'}:null}},
   });
 }};
 const api=load('app/api/reels/prepare-publishing/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'mind',role:options.role||'superadmin',isSuperAdmin:options.isSuperAdmin??!options.role})},'@/lib/prisma':{prisma}});
 return {api,changes,count:()=>transactions};
}
test('reviewed reel is selected and approved without sending a social post',async()=>{
 const {api,changes}=fixture();const r=await api.POST(request());assert.equal(r.status,200);assert.equal(changes.length,1);assert.deepEqual(JSON.parse(JSON.stringify(changes[0].data)),{mediaUrl:'/api/video/media/reel',status:'approved'});
});
test('viewer and changed workspace cannot prepare a reel',async()=>{
 for(const options of [{role:'viewer'},{}]){const f=fixture(options);const r=await f.api.POST(request(options.role?{}:{organizationId:'guitars'}));assert.equal(r.status,options.role?403:409);assert.equal(f.count(),0);}
});
test('ordinary owners, admins and members cannot bypass weekly completion and approval',async()=>{
 for(const role of ['owner','admin','member']){const f=fixture({role,isSuperAdmin:false});assert.equal((await f.api.POST(request())).status,403);assert.equal(f.count(),0);assert.equal(f.changes.length,0);}
});
test('missing or non-MP4 reel cannot be approved',async()=>{
 for(const options of [{missingAsset:true},{asset:{metadata:{contentType:'video/webm'}}}]){const f=fixture(options);const r=await f.api.POST(request());assert.ok([400,404].includes(r.status));assert.equal(f.changes.length,0);}
});
test('scheduled posts and changed captions are preserved',async()=>{
 for(const options of [{active:true},{item:{status:'published'}},{item:{caption:'Updated caption'}}]){const f=fixture(options);const r=await f.api.POST(request());assert.equal(r.status,409);assert.equal(f.changes.length,0);}
});
