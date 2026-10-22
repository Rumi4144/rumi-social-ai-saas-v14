const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), ts=require('typescript');
function load(file,deps={},extra={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>n in deps?deps[n]:require(n),URL,Date,process,AbortSignal,console,...extra});return module.exports;}
const catalog=load('lib/ai-lab/catalog.ts');
function fixture(){
 const state={jobs:new Map(),org:'own',role:'owner',calls:0,fail:null,quoteCost:.009,saveFailure:false};
 const matches=(j,w)=>j&&(!w.id||j.id===w.id)&&(!w.organizationId||j.organizationId===w.organizationId)&&(!w.type||j.type===w.type)&&(!w.status||(w.status.in?w.status.in.includes(j.status):j.status===w.status))&&(!w.createdAt?.gt||j.createdAt>w.createdAt.gt)&&(!w.createdAt?.gte||j.createdAt>=w.createdAt.gte);
 const job={findFirst:async q=>[...state.jobs.values()].find(j=>matches(j,q.where))||null,findMany:async q=>[...state.jobs.values()].filter(j=>matches(j,q.where)),create:async q=>{const item={id:q.data.id||'quote-'+state.jobs.size,createdAt:new Date(),error:null,...q.data};if(state.jobs.has(item.id))throw Error('duplicate');state.jobs.set(item.id,item);return item;},updateMany:async q=>{const item=state.jobs.get(q.where.id);if(!matches(item,q.where))return {count:0};Object.assign(item,q.data);return {count:1};},update:async q=>{if(state.saveFailure){state.saveFailure=false;throw Error('temporary database failure');}const item=state.jobs.get(q.where.id);Object.assign(item,q.data);return item;}};
 const prisma={job,mediaAsset:{findMany:async()=>[]}};let tail=Promise.resolve();prisma.$transaction=(fn,opts)=>{assert.equal(opts.isolationLevel,'Serializable');const run=tail.then(async()=>{const snapshot=structuredClone(state.jobs);try{return await fn(prisma);}catch(e){state.jobs=snapshot;throw e;}});tail=run.catch(()=>{});return run;};
 class ProviderError extends Error{constructor(definitive){super();this.definitive=definitive;}}
 const jobs={labJobId:(org,id)=>org+id,labSummary:j=>({id:j.id,status:j.status,error:j.error,estimateUsd:j.payload.estimateUsd}),labRefresh:async j=>j};
 const api=load('app/api/ai-lab/route.ts',{'next/server':{NextResponse:{json:(body,opts)=>({body,status:opts?.status||200})}},'@/lib/prisma':{prisma},'@/lib/auth/context':{tenantContext:async()=>({organizationId:state.org,role:state.role})},'@/lib/http/errors':{apiError:e=>({status:e.message==='FORBIDDEN'?403:500})},'@/lib/ai-lab/catalog':{...catalog,labConfigured:()=>true},'@/lib/ai-lab/jobs':jobs,'@/lib/ai-lab/providers':{LabProviderError:ProviderError,labQuote:async()=>state.quoteCost,labSubmit:async()=>{state.calls++;if(state.fail)throw state.fail;return {taskId:'task'};}}});
 const input={model:'flux',prompt:'A natural portrait in a bright kitchen, teal and cream palette.'};
 const post=body=>api.POST({json:async()=>({organizationId:'own',...body})});
 const quote=()=>post({action:'quote',input});
 const generate=quoteId=>({action:'generate',quoteId,requestId:'12345678-1234-4234-8234-123456789abc',acknowledge:true});
 return {state,api,post,quote,generate,ProviderError};
}
test('workspace changes, viewers and missing cost approval cannot start paid tests',async()=>{
 const f=fixture();f.state.role='viewer';assert.equal((await f.quote()).status,403);f.state.role='owner';assert.equal((await f.post({action:'quote',organizationId:'foreign',input:{model:'flux',prompt:'An image in daylight'}})).status,409);
 assert.equal((await f.post({...f.generate('missing'),acknowledge:false})).status,400);assert.equal(f.state.calls,0);
});
test('identical concurrent submissions reserve one estimate and call the provider once',async()=>{
 const f=fixture(),q=await f.quote();assert.equal(q.status,200);const [a,b]=await Promise.all([f.post(f.generate(q.body.quoteId)),f.post(f.generate(q.body.quoteId))]);assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(f.state.calls,1);assert.equal([...f.state.jobs.values()].filter(j=>j.type==='AI_LAB').length,1);
 await f.post(f.generate(q.body.quoteId));assert.equal(f.state.calls,1);
});
test('quotes are workspace-bound, expire, and cannot be reused for a second generation',async()=>{
 const f=fixture(),q=await f.quote();const stored=f.state.jobs.get(q.body.quoteId);stored.createdAt=new Date(Date.now()-121000);assert.equal((await f.post(f.generate(q.body.quoteId))).status,409);
 stored.createdAt=new Date();stored.organizationId='foreign';assert.equal((await f.post(f.generate(q.body.quoteId))).status,409);assert.equal(f.state.calls,0);
 stored.organizationId='own';await f.post(f.generate(q.body.quoteId));const created=[...f.state.jobs.values()].find(j=>j.type==='AI_LAB');created.status='succeeded';assert.equal((await f.post({...f.generate(q.body.quoteId),requestId:'12345678-1234-4234-8234-123456789abd'})).status,409);assert.equal(f.state.calls,1);
});
test('daily reservations and active tests stop further provider spending',async()=>{
 const f=fixture(),q=await f.quote();f.state.jobs.set('earlier',{id:'earlier',organizationId:'own',type:'AI_LAB',status:'running',createdAt:new Date(),payload:{estimateUsd:.1}});assert.equal((await f.post(f.generate(q.body.quoteId))).status,409);assert.equal(f.state.calls,0);
 f.state.jobs.get('earlier').status='succeeded';f.state.jobs.get('earlier').payload.estimateUsd=2;assert.equal((await f.post(f.generate(q.body.quoteId))).status,409);assert.equal(f.state.calls,0);
});
test('ambiguous submission never automatically buys a replacement',async()=>{
 const f=fixture(),q=await f.quote();f.state.fail=Error('timeout');const first=await f.post(f.generate(q.body.quoteId));assert.equal(first.body.job.status,'uncertain');await f.post(f.generate(q.body.quoteId));assert.equal(f.state.calls,1);assert.match(first.body.job.error,/Automatic resubmission is blocked/);
});
test('previous-day uncertain jobs keep blocking new spending',async()=>{
 const f=fixture(),q=await f.quote();f.state.jobs.set('old',{id:'old',organizationId:'own',type:'AI_LAB',status:'uncertain',createdAt:new Date(Date.now()-86400000),payload:{estimateUsd:.2}});assert.equal((await f.post(f.generate(q.body.quoteId))).status,409);assert.equal(f.state.calls,0);
});
test('confirmed task survives a transient database failure without buying another generation',async()=>{
 const f=fixture(),q=await f.quote();f.state.saveFailure=true;const result=await f.post(f.generate(q.body.quoteId));assert.equal(result.status,200);assert.equal(result.body.job.status,'running');assert.equal(f.state.calls,1);assert.equal([...f.state.jobs.values()].find(j=>j.type==='AI_LAB').payload.taskId,'task');
});
test('invalid or excessive provider prices fail before generation',async()=>{
 for(const value of [NaN,Infinity,-1,1.01,undefined,'0.01'])assert.throws(()=>catalog.labCost(value));
 const f=fixture();f.state.quoteCost=5;assert.equal((await f.quote()).status,422);assert.equal(f.state.calls,0);
});
test('provider adapters use fixed models, live complete-input quotes and no submission retry',async()=>{
 let calls=[];const provider=load('lib/ai-lab/providers.ts',{'./catalog':catalog},{fetch:async(url,options)=>{calls.push({url,options,body:options.body?JSON.parse(options.body):null});return {ok:true,json:async()=>url.includes('/model/price')?{code:200,data:{currency:'USD',discounted_price:.225}}:{id:'task',polling_url:'https://api.bfl.ai/v1/get_result?id=task'}};}});
 await provider.labSubmit({model:'flux',prompt:'A kitchen portrait'});assert.equal(calls[0].body.resolution,'1k');assert.equal(calls[0].body.aspect_ratio,'4:5');assert.equal(calls[0].options.redirect,'error');
 await provider.labQuote({model:'infinitetalk',prompt:'Natural delivery'},{image:'https://media.test/photo',audio:'https://media.test/audio'});assert.equal(calls[1].body.inputs.audio,'https://media.test/audio');assert.equal(calls[1].body.inputs.image,'https://media.test/photo');
 for(const url of ['http://api.bfl.ai/v1/get_result','https://api.bfl.ai.evil.com/v1/get_result','https://api.bfl.ai/v1/other','https://user:pass@api.bfl.ai/v1/get_result'])assert.throws(()=>provider.bflPollingUrl(url));
 calls=[];const bad=load('lib/ai-lab/providers.ts',{'./catalog':catalog},{fetch:async()=>{calls.push(1);throw Error('network');}});await assert.rejects(()=>bad.labSubmit({model:'flux',prompt:'A portrait'}));assert.equal(calls.length,1);
});
