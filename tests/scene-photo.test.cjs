const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps,cache=new Map()){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,require:n=>n in deps?deps[n]:n.startsWith('@/')||n.startsWith('.')?load(n.startsWith('@/')?n.slice(2)+'.ts':path.resolve(path.dirname(file),n+'.ts'),deps,cache):require(n),URL,process});return module.exports;
}
class ImageRejectedError extends Error {status=422;}
class PhotoReviewPendingError extends Error {}
const pass={status:'passed',issues:[],replacementDirection:'',comparedAssetIds:[]};
const fail={...pass,status:'failed',issues:['Repeats the seated guitar portrait.'],replacementDirection:'Close-up of hands playing strings, without a portrait.'};

function fixture(decisions=[pass]){
 const state={credits:5,jobs:new Map(),assets:new Map(),ledger:[],calls:0,org:'own',role:'owner',foreign:false,fail:null,options:null,prompt:null,reviews:[],reviewCache:new Map(),headline:'A calm moment',caption:'Find a comfortable place',replacementFail:null};
 const find=async q=>{const job=state.jobs.get(q.where.id);return job && (!q.where.organizationId || job.organizationId===q.where.organizationId)?job:null;};
 const prisma={contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,state.org);return state.foreign?null:{id:'post',headline:state.headline,caption:state.caption,campaign:{brand:{id:'brand',name:'Master Mind',industry:'Hypnosis',description:'Educational services'}}};}},job:{findFirst:find,findUniqueOrThrow:async q=>{const job=await find(q);if(!job)throw Error('missing');return job;},create:async q=>{if(state.jobs.has(q.data.id))throw Error('duplicate');state.jobs.set(q.data.id,q.data);return q.data;},update:async q=>{const job=state.jobs.get(q.where.id);Object.assign(job,q.data);return job;},updateMany:async q=>{const job=state.jobs.get(q.where.id);if(!job || !q.where.status.in.includes(job.status))return {count:0};Object.assign(job,q.data);return {count:1};}},subscription:{updateMany:async q=>{assert.equal(q.where.organizationId,state.org);assert.equal(q.where.credits.gte,1);if(state.credits<1)return {count:0};state.credits--;return {count:1};},findUniqueOrThrow:async()=>({credits:state.credits}),update:async q=>{state.credits+=q.data.credits.increment;return {credits:state.credits};}},creditLedger:{create:async q=>state.ledger.push(q.data)},mediaAsset:{findFirst:async q=>state.assets.get(q.where.id)||null,update:async q=>{Object.assign(state.assets.get(q.where.id),q.data);return state.assets.get(q.where.id);},upsert:async q=>{assert.equal(q.create.kind,'reel_scene_image');if(!state.assets.has(q.where.id))state.assets.set(q.where.id,q.create);return state.assets.get(q.where.id);}}};
 let tail=Promise.resolve();prisma.$transaction=fn=>{const run=tail.then(async()=>{const before={credits:state.credits,jobs:structuredClone(state.jobs),assets:structuredClone(state.assets),ledger:structuredClone(state.ledger)};try{return await fn(prisma);}catch(error){Object.assign(state,{credits:before.credits,ledger:before.ledger});throw error;}});tail=run.catch(()=>{});return run;};
 const api=load('app/api/reels/scene-photo/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},'@/lib/prisma':{prisma},
  '@/lib/auth/context':{tenantContext:async()=>({organizationId:state.org,role:state.role})},'@/lib/http/errors':{apiError:error=>({status:error.message==='FORBIDDEN'?403:500,body:{error:error.message}})},
  '@/lib/ai/photo-review':{PhotoReviewPendingError,reviewPhoto:async input=>{state.reviews.push(input);if(!state.reviewCache.has(input.assetId))state.reviewCache.set(input.assetId,decisions[Math.min(state.reviewCache.size,decisions.length-1)]);return state.reviewCache.get(input.assetId);}},
  '@/lib/ai/image-provider':{ImageRejectedError,imageConfiguration:()=>({provider:'bfl',model:'flux-3-image-klein'}),generateImage:async input=>{state.requests ||= new Set();if(!state.requests.has(input.requestId)){state.calls++;state.requests.add(input.requestId);}state.prompt=input.prompt;state.options={maxRetries:0};if(input.requestId.endsWith(':replacement')&&state.replacementFail)throw state.replacementFail;if(state.fail)throw state.fail;return {base64:'aW1hZ2U=',provider:'bfl',model:'flux-3-image-klein'};}},
  openai:class {constructor(options){state.options=options;}images={generate:async input=>{state.calls++;state.prompt=input.prompt;if(state.fail)throw state.fail;return {data:[{b64_json:'aW1hZ2U='}]};}}},
 });
 const body={organizationId:'own',campaignId:'campaign',contentItemId:'post',sceneId:'scene1',sceneNumber:1,requestId:'12345678-1234-4234-8234-123456789abc',direction:'Close-up of hands beside a closed laptop in soft natural light.'};
 return {state,api,body,request:(patch={})=>({json:async()=>({...body,...patch})})};
}
const prior=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='mock-photo-only';
test.after(()=>{if(prior===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=prior;});
test('scene photo charges once, creates a separate owned asset, and duplicate clicks reuse it',async()=>{
 const f=fixture();const results=await Promise.all([f.api.POST(f.request()),f.api.POST(f.request())]);
 assert.ok(results.some(r=>r.status===200));assert.equal(f.state.calls,1);assert.equal(f.state.credits,4);assert.equal(f.state.ledger.length,1);assert.equal(f.state.assets.size,1);
 const asset=[...f.state.assets.values()][0];assert.equal(asset.contentItemId,'post');assert.equal(asset.organizationId,'own');assert.equal(asset.metadata.sceneId,'scene1');assert.match(f.state.prompt,/hands beside a closed laptop/);assert.equal(f.state.options.maxRetries,0);
 const repeat=await f.api.POST(f.request());assert.equal(repeat.status,200);assert.equal(repeat.body.source.kind,'image');assert.equal(f.state.calls,1);
 const changed=await f.api.POST(f.request({direction:'A different planned camera shot beside a window.'}));assert.equal(changed.status,409);assert.equal(f.state.calls,1);
});
test('foreign post, stale workspace, viewer, and insufficient credits never call the paid provider',async()=>{
 const f=fixture();f.state.foreign=true;assert.equal((await f.api.POST(f.request())).status,404);
 f.state.foreign=false;assert.equal((await f.api.POST(f.request({organizationId:'other'}))).status,409);
 f.state.role='viewer';assert.equal((await f.api.POST(f.request())).status,403);
 f.state.role='owner';f.state.credits=0;assert.equal((await f.api.POST(f.request())).status,402);assert.equal(f.state.calls,0);assert.equal(f.state.ledger.length,0);
});
test('confirmed provider rejection returns the credit once and does not silently regenerate',async()=>{
 const f=fixture();f.state.fail={status:429};const result=await f.api.POST(f.request());assert.equal(result.status,422);assert.equal(f.state.credits,5);assert.equal(f.state.ledger.length,2);assert.equal(f.state.assets.size,0);
 assert.equal((await f.api.POST(f.request())).status,422);assert.equal(f.state.calls,1);assert.equal(f.state.credits,5);
});
test('ambiguous provider failure is retained for checking without a second paid generation',async()=>{
 const f=fixture();f.state.fail=Error('connection lost');const result=await f.api.POST(f.request());assert.equal(result.status,202);assert.equal(result.body.status,'uncertain');assert.equal(f.state.credits,4);
 await f.api.POST(f.request());assert.equal(f.state.calls,1);assert.equal(f.state.credits,4);
 const url=`https://app.test/api/reels/scene-photo?contentItemId=post&requestId=${f.body.requestId}`;
 assert.equal((await f.api.GET(new Request(url))).body.status,'uncertain');f.state.org='other';assert.equal((await f.api.GET(new Request(url))).status,404);
});

test('one failed scene photo gets one replacement, keeps both, freezes its plan and debits once',async()=>{
 const f=fixture([fail,pass]);const first=await f.api.POST(f.request());assert.equal(first.status,202);assert.equal(first.body.status,'continuing');assert.equal(f.state.calls,1);assert.equal([...f.state.assets.values()][0].status,'superseded');
 const completed=await f.api.POST(f.request());assert.equal(completed.status,200);assert.equal(completed.body.needsReview,false);assert.equal(f.state.calls,2);assert.equal(f.state.credits,4);assert.equal(f.state.assets.size,2);assert.equal(f.state.ledger.length,1);assert.match(f.state.prompt,/Close-up of hands playing strings/);
 assert.equal(f.state.reviews.at(-1).sceneId,'scene1');assert.equal(f.state.reviews.at(-1).context.headline,'A calm moment');
 for(let i=0;i<3;i++)await f.api.POST(f.request());assert.equal(f.state.calls,2);assert.equal(f.state.credits,4);
});
test('two failed photos or unavailable review require human selection and never loop paid calls',async()=>{
 for(const decisions of [[fail,fail],[{...pass,status:'unavailable',issues:['Review could not finish']} ]]){
  const f=fixture(decisions);await f.api.POST(f.request());const done=await f.api.POST(f.request());assert.equal(done.body.needsReview,true);assert.ok(done.body.source);assert.equal(f.state.calls,decisions.length);assert.ok([...f.state.assets.values()].every(a=>a.status==='superseded'));
  await f.api.POST(f.request());assert.equal(f.state.calls,decisions.length);assert.equal(f.state.credits,4);
 }
});
test('rejected replacement retains the first paid photo without refunding or generating again',async()=>{
 const f=fixture([fail]);await f.api.POST(f.request());f.state.replacementFail=new ImageRejectedError();const done=await f.api.POST(f.request());assert.equal(done.body.needsReview,true);assert.equal(f.state.assets.size,1);assert.equal(f.state.credits,4);assert.match(done.body.review.issues.join(' '),/replacement could not/);await f.api.POST(f.request());assert.equal(f.state.calls,2);
});
test('lost replacement response resumes the same paid request and preserves the first photo',async()=>{
 const f=fixture([fail,pass]);await f.api.POST(f.request());f.state.replacementFail=Error('lost response');assert.equal((await f.api.POST(f.request())).body.status,'uncertain');assert.equal(f.state.assets.size,1);f.state.replacementFail=null;assert.equal((await f.api.POST(f.request())).body.needsReview,false);assert.equal(f.state.calls,2);assert.equal(f.state.credits,4);
});
test('edited post cannot silently receive a photo approved against its older caption',async()=>{
 const f=fixture([fail,pass]);await f.api.POST(f.request());f.state.caption='A different message now';const done=await f.api.POST(f.request());assert.equal(done.body.needsReview,true);assert.match(done.body.review.issues.join(' '),/post changed/);assert.equal(f.state.reviews.at(-1).context.caption,'Find a comfortable place');
});
