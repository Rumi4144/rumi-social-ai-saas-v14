const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
function load(path, deps) {
  const code = ts.transpileModule(fs.readFileSync(__dirname+'/../'+path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:n=>deps[n],fetch:(...a)=>global.fetch(...a),Request,Response,URL,Date,JSON,Math,Number,AbortSignal,TransformStream,ReadableStream,Headers,process,console:{log(){},warn(){}}});
  return module.exports;
}
const json = (data,status=200)=>new Response(JSON.stringify(data),{status});
let jobs = new Map(), balance = 100, ledger = [], calls = [], replies = [], assets = [], stored = [], org = 'org';
const taskId='11111111-2222-4333-8444-555555555555';
const db={
  job:{
    findFirst:async({where})=>{const j=jobs.get(where.id);return j && j.organizationId===where.organizationId && (!where.status || j.status===where.status)?j:null},
    create:async({data})=>{if(jobs.has(data.id))throw Object.assign(new Error('unique'),{code:'P2002'});const j={...data,createdAt:new Date(),updatedAt:new Date(),progress:0,error:null};jobs.set(j.id,j);return j},
    update:async({where,data})=>{const j=jobs.get(where.id);Object.assign(j,data);return j},
    updateMany:async({where,data})=>{const j=jobs.get(where.id);if(!j || where.organizationId && j.organizationId!==where.organizationId || where.status && (typeof where.status==='string'? j.status!==where.status: !where.status.in.includes(j.status)) || where.updatedAt && j.updatedAt>=where.updatedAt.lt)return {count:0};Object.assign(j,data);return {count:1}},
    findUniqueOrThrow:async({where})=>jobs.get(where.id),
    findMany:async({where})=>Array.from(jobs.values()).filter(j=>j.organizationId===where.organizationId),
  },
  subscription:{
    updateMany:async({where,data})=>{if(balance<where.credits.gte)return {count:0};balance-=data.credits.decrement;return {count:1}},
    findUniqueOrThrow:async()=>({credits:balance}),findUnique:async()=>({credits:balance}),
    update:async({data})=>{balance+=data.credits.increment;return {credits:balance}},
  },
  creditLedger:{create:async({data})=>ledger.push(data)},
  mediaAsset:{findFirst:async({where})=>where.organizationId==='org' && where.id==='owned'?{url:'https://example.com/image.jpg'}:null,findMany:async()=>[],upsert:async({create})=>{if(!assets.some(a=>a.id===create.id))assets.push(create)}},
  campaign:{findFirst:async()=>null},
};
const prisma={...db,$transaction:async fn=>{const beforeJobs=new Map(Array.from(jobs,([k,v])=>[k,{...v}])),beforeBalance=balance,beforeLedger=[...ledger];try{return await fn(db)}catch(e){jobs=beforeJobs;balance=beforeBalance;ledger=beforeLedger;throw e}}};
global.fetch=async(url,init)=>{calls.push({url:String(url),init});const response=replies.shift();if(response instanceof Error)throw response;if(!response)throw Error('Unexpected fetch');return response};
const helper=load('lib/video/runway.ts',{});
const storage={put:async(path,body,opts)=>{await new Response(body).arrayBuffer();stored.push({path,opts})},get:async()=>({statusCode:200,stream:new Response('video').body,blob:{size:5}})};
const video=load('lib/video/jobs.ts',{'@/lib/prisma':{prisma},'@vercel/blob':storage,'./runway':helper});
const context={tenantContext:async()=>({organizationId:org,role:'owner'})};
const errors={apiError:(e)=>json({error:'Error'},e.message==='UNAUTHENTICATED'?401:500)};
const route=load('app/api/video/queue/route.ts',{'next/server':{NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),{...init,headers:{...init?.headers,'Content-Type':'application/json'}})}},zod:require('../node_modules/zod'),'@/lib/prisma':{prisma},'@/lib/auth/context':context,'@/lib/http/errors':errors,'@/lib/video/runway':helper,'@/lib/video/jobs':video});
const file=load('app/api/video/file/route.ts',{'@vercel/blob':storage,'@/lib/prisma':{prisma},'@/lib/auth/context':context,'@/lib/http/errors':errors});
const id='11111111-2222-4333-8444-555555555551';
const input={requestId:id,imageUrl:'https://example.com/guitar.jpg',prompt:'Slow cinematic camera movement',duration:5,ratio:'720:1280',consent:true};
const post=v=>route.POST(new Request('https://rumisocialai.com/api/video/queue',{method:'POST',body:JSON.stringify(v)}));
const poll=()=>route.GET(new Request('https://rumisocialai.com/api/video/queue?jobId='+id));
(async()=>{
  assert.equal(helper.validImage('https://127.0.0.1/img'),false);
  assert.equal(helper.validImage('https://site.test:8080/img'),false);
  assert.equal(helper.validImage('data:image/svg+xml;base64,abcd'),false);
  assert.equal(helper.validImage('data:image/png;base64,YQ=='),true);
  assert.equal((await post({...input,consent:false})).status,400);assert.equal(balance,100);
  assert.equal((await post(input)).status,503);assert.equal(jobs.size,0);
  process.env.RUNWAY_API_KEY='test';process.env.BLOB_READ_WRITE_TOKEN='test';
  assert.equal((await post({...input,assetId:'foreign'})).status,404);assert.equal(calls.length,0);
  assert.equal((await post({...input,campaignId:'foreign'})).status,404);
  replies.push(json({id:taskId}));assert.equal((await post(input)).status,202);assert.equal(balance,60);assert.equal(ledger.length,1);
  assert.equal(JSON.parse(calls[0].init.body).model,'gen4.5');assert.equal(calls[0].init.headers['X-Runway-Version'],'2024-11-06');
  await post(input);assert.equal(calls.length,1);assert.equal(balance,60,'idempotent credit debit');
  org='other';assert.equal((await poll()).status,404);org='org';
  jobs.get(id).updatedAt=new Date(0);replies.push(json({status:'RUNNING',progress:0.5}));await poll();assert.equal(jobs.get(id).progress,45);
  jobs.get(id).updatedAt=new Date(0);replies.push(json({status:'SUCCEEDED',output:['https://example.cloudfront.net/video.mp4']}),new Response('MP4'));
  await poll();assert.equal(jobs.get(id).status,'succeeded');assert.equal(stored.length,1);assert.equal(stored[0].opts.access,'private');assert.equal(assets.length,1);
  assert.equal((await (await poll()).json()).job.videoUrl,'/api/video/file?jobId='+id);assert.equal(assets[0].provider,'runway');
  const count=calls.length;await poll();assert.equal(calls.length,count,'completed video never regenerated');
  org='other';assert.equal((await file.GET(new Request('https://rumisocialai.com/api/video/file?jobId='+id))).status,404);org='org';
  assert.equal((await file.GET(new Request('https://rumisocialai.com/api/video/file?jobId='+id))).status,200);
  for (const [range,body,contentRange] of [['bytes=0-1','vi','bytes 0-1/5'],['bytes=2-','deo','bytes 2-4/5'],['bytes=-2','eo','bytes 3-4/5']]) {
    const response=await file.GET(new Request('https://rumisocialai.com/api/video/file?jobId='+id,{headers:{range}}));
    assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),contentRange);assert.equal(await response.text(),body);
  }
  for (const range of ['bytes=5-','bytes=3-1','bytes=-0','bytes=0-1,3-4']) assert.equal((await file.GET(new Request('https://rumisocialai.com/api/video/file?jobId='+id,{headers:{range}}))).status,416);

  const rejectedId=id.slice(0,-1)+'2';replies.push(json({error:'invalid'},400));await post({...input,requestId:rejectedId});assert.equal(balance,60);assert.equal(jobs.get(rejectedId).status,'failed');
  await video.failVideo(jobs.get(rejectedId),'failure');assert.equal(balance,60,'refund exactly once');
  const uncertainId=id.slice(0,-1)+'3';replies.push(new Error('lost response'));await post({...input,requestId:uncertainId});assert.equal(jobs.get(uncertainId).status,'uncertain');assert.equal(balance,20);
  const lostCount=calls.length;await post({...input,requestId:uncertainId});assert.equal(calls.length,lostCount,'never repeat ambiguous paid request');
  const lowId=id.slice(0,-1)+'4';assert.equal((await post({...input,requestId:lowId})).status,402);assert.equal(jobs.has(lowId),false,'insufficient credits roll back claim');
  jobs.get(uncertainId).status='running';jobs.get(uncertainId).payload.taskId=taskId;jobs.get(uncertainId).updatedAt=new Date(0);
  replies.push(json({status:'FAILED',failureCode:'SAFETY.INPUT'}));
  await video.refreshVideo(jobs.get(uncertainId));assert.equal(balance,60,'terminal failure refunds credits');
  await video.refreshVideo(jobs.get(uncertainId));assert.equal(balance,60,'terminal failure does not refund twice');
  jobs.get(id).status='running';jobs.get(id).updatedAt=new Date(0);
  replies.push(json({status:'SUCCEEDED',output:['https://example.cloudfront.net/video.mp4']}),new Error('download temporarily failed'));
  await poll();assert.equal(jobs.get(id).status,'saving');assert.equal(balance,60,'storage outage does not submit or charge a new generation');
  jobs.get(id).updatedAt=new Date(0);
  replies.push(json({status:'SUCCEEDED',output:['https://example.cloudfront.net/video.mp4']}),new Response('MP4'));
  await poll();assert.equal(jobs.get(id).status,'succeeded');assert.equal(assets.length,1,'storage retry must reuse the same media asset');
  console.log('PASS: Runway input validation, setup gating, asset/campaign ownership, one credit debit, request idempotency, tenant isolation, progress polling, private durable video storage, private delivery, provider rejection refund once, ambiguous request protection, insufficient-credit rollback.');
})().catch(e=>{console.error(e);process.exitCode=1});
