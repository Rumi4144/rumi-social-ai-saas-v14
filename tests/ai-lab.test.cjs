const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), ts=require('typescript');
function load(file,deps={},extra={}){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>n in deps?deps[n]:require(n),URL,Date,process,AbortSignal,console,...extra});return module.exports;}
const catalog=load('lib/ai-lab/catalog.ts');
function fixture(){
 const state={jobs:new Map(),org:'own',role:'owner',calls:0,fail:null,quoteCost:.009,saveFailure:false,foreignPost:false,assets:[]};
 const matches=(j,w)=>j&&(!w.id||j.id===w.id)&&(!w.organizationId||j.organizationId===w.organizationId)&&(!w.type||j.type===w.type)&&(!w.status||(w.status.in?w.status.in.includes(j.status):j.status===w.status))&&(!w.createdAt?.gt||j.createdAt>w.createdAt.gt)&&(!w.createdAt?.gte||j.createdAt>=w.createdAt.gte);
 const job={findFirst:async q=>[...state.jobs.values()].find(j=>matches(j,q.where))||null,findMany:async q=>[...state.jobs.values()].filter(j=>matches(j,q.where)),create:async q=>{const item={id:q.data.id||'quote-'+state.jobs.size,createdAt:new Date(),error:null,...q.data};if(state.jobs.has(item.id))throw Error('duplicate');state.jobs.set(item.id,item);return item;},updateMany:async q=>{const item=state.jobs.get(q.where.id);if(!matches(item,q.where))return {count:0};Object.assign(item,q.data);return {count:1};},update:async q=>{if(state.saveFailure){state.saveFailure=false;throw Error('temporary database failure');}const item=state.jobs.get(q.where.id);Object.assign(item,q.data);return item;}};
 const prisma={job,contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,state.org);return state.foreignPost?null:{id:q.where.id};}},mediaAsset:{findMany:async q=>state.assets.filter(a=>a.organizationId===q.where.organizationId && a.kind===q.where.kind && a.status===q.where.status && a.createdAt>q.where.createdAt.gt && (!q.where.id || q.where.id.in.includes(a.id))) }};let tail=Promise.resolve();prisma.$transaction=(fn,opts)=>{assert.equal(opts.isolationLevel,'Serializable');const run=tail.then(async()=>{const snapshot=structuredClone(state.jobs);try{return await fn(prisma);}catch(e){state.jobs=snapshot;throw e;}});tail=run.catch(()=>{});return run;};
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
test('speech requires an allowed preset and a bounded script before any generation',async()=>{
 const f=fixture();
 for(const input of [{model:'speech',prompt:'A friendly introduction'}, {model:'speech',prompt:'A friendly introduction',voiceId:'invented'}, {model:'speech',prompt:'x'.repeat(601),voiceId:'Calm_Woman'}])assert.equal((await f.post({action:'quote',input})).status,400);
 const q=await f.post({action:'quote',input:{model:'speech',prompt:'Learn about self-hypnosis with Master Mind.',voiceId:'Calm_Woman'}});assert.equal(q.status,200);assert.equal(f.state.calls,0);await f.post(f.generate(q.body.quoteId));assert.equal(f.state.calls,1);
});
test('speech quote and generation preserve the exact script and share the WaveSpeed connection',async()=>{
 const calls=[],script='Learn about self-hypnosis with Master Mind. Visit master-mind.us.';
 const provider=load('lib/ai-lab/providers.ts',{'./catalog':catalog},{fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.includes('/model/price')?{code:200,data:{currency:'USD',discounted_price:.0166}}:{code:200,data:{id:'speech-task'}}};}});
 const input={model:'speech',prompt:script,voiceId:'Calm_Woman'};
 assert.equal(await provider.labQuote(input),.0166);await provider.labSubmit(input);
 assert.equal(calls[0].body.model_id,'minimax/speech-02-hd');assert.equal(calls[0].body.inputs.text,script);assert.equal(calls[1].body.text,script);assert.equal(calls[1].body.voice_id,'Calm_Woman');assert.equal(calls[1].body.format,'mp3');assert.equal(calls[1].url,'https://api.wavespeed.ai/api/v3/minimax/speech-02-hd');
});
test('finished speech is saved privately and becomes a tenant-owned reusable audio input',async()=>{
 const job={id:'voice-job',organizationId:'own',status:'running',createdAt:new Date(),payload:{model:'speech',prompt:'A friendly introduction',voiceId:'Calm_Woman',voiceAccent:'french',accentSpeaker:'French_MovieLeadFemale',estimateUsd:.02,taskId:'task'}};
 const assets=[],stored=[];let polls=0;
 const prisma={job:{updateMany:async()=>({count:1}),update:async q=>{Object.assign(job,q.data);return job;},findUniqueOrThrow:async()=>job},mediaAsset:{upsert:async q=>{assets.push(q.create);return q.create;}}};
 const jobs=load('lib/ai-lab/jobs.ts',{'@/lib/video/mp4':{assertMp4Video:()=>{},mp4Duration:()=>15},'@/lib/prisma':{prisma},'@vercel/blob':{put:async(path,bytes,options)=>stored.push({path,options})},'@/lib/reels/public-fetch':{fetchPublicBytes:async()=>({bytes:Buffer.from('mp3 audio'),contentType:'audio/mpeg'})},'./catalog':catalog,'./providers':{labPoll:async()=>{polls++;return {status:'ready',url:'https://provider.test/voice.mp3'};}}});
 await jobs.labRefresh(job);assert.equal(job.status,'succeeded');assert.equal(stored[0].options.access,'private');assert.equal(stored[0].path,'ai-lab/own/voice-job.mp3');assert.equal(assets[0].organizationId,'own');assert.equal(assets[0].metadata.kind,'audio');assert.equal(assets[0].metadata.voiceId,'Calm_Woman');assert.equal(assets[0].metadata.voiceAccent,'french');assert.equal(assets[0].metadata.accentSpeaker,'French_MovieLeadFemale');assert.equal(jobs.labSummary(job).accentSpeaker,'French_MovieLeadFemale');assert.equal(jobs.labSummary({...job,payload:{...job.payload,voiceAccent:undefined,accentSpeaker:undefined}}).voiceAccent,'original');assert.equal(jobs.labSummary(job).audioAssetId,'voice-job');assert.equal(jobs.labSummary(job).kind,'audio');await jobs.labRefresh(job);assert.equal(polls,1);
});

test('campaign destinations are ownership checked before quotes and checked again before spending',async()=>{
 const f=fixture(),input={model:'flux',prompt:'A calm portrait for this post.',campaignId:'campaign',contentItemId:'post'};
 f.state.foreignPost=true;assert.equal((await f.post({action:'quote',input})).status,422);assert.equal(f.state.calls,0);
 f.state.foreignPost=false;const q=await f.post({action:'quote',input});assert.equal(q.status,200);f.state.foreignPost=true;assert.notEqual((await f.post(f.generate(q.body.quoteId))).status,200);assert.equal(f.state.calls,0);
 assert.equal((await f.post({action:'quote',input:{...input,contentItemId:undefined}})).status,400);
});
test('campaign presenter is saved as reviewable video; deleted destination preserves the paid sample',async()=>{
 for(const deleted of [false,true]){
  const job={id:'video-job',organizationId:'own',status:'running',createdAt:new Date(),payload:{model:'infinitetalk',prompt:'Friendly natural presenter',estimateUsd:.225,taskId:'task',campaignId:'campaign',contentItemId:'post'}};const assets=[];
  const prisma={job:{updateMany:async()=>({count:1}),update:async q=>{Object.assign(job,q.data);return job;},findUniqueOrThrow:async()=>job},contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'own');return deleted?null:{id:'post'};}},mediaAsset:{upsert:async q=>assets.push(q.create)}};
  const jobs=load('lib/ai-lab/jobs.ts',{'@/lib/video/mp4':{assertMp4Video:()=>{},mp4Duration:()=>15},'@/lib/prisma':{prisma},'@vercel/blob':{put:async()=>{}},'@/lib/reels/public-fetch':{fetchPublicBytes:async()=>({bytes:Buffer.from('mp4 fixture'),contentType:'video/mp4'})},'./catalog':catalog,'./providers':{labPoll:async()=>({status:'ready',url:'https://provider.test/video.mp4'})}});
  await jobs.labRefresh(job);assert.equal(job.status,'succeeded');assert.ok(jobs.labSummary(job).url);
  if(deleted){assert.equal(assets.length,0);assert.equal(jobs.labSummary(job).campaignId,undefined);assert.match(job.error,/sample is saved/);}
  else{assert.equal(assets[0].kind,'campaign_video');assert.equal(assets[0].provider,'wavespeed');assert.equal(assets[0].campaignId,'campaign');assert.equal(assets[0].metadata.pathname,'ai-lab/own/video-job.mp4');assert.equal(assets[0].metadata.duration,15);assert.equal(assets[0].metadata.publishMode,'review');}
 }
});

test('product preparation uses two owned current image references and rechecks them before spending',async()=>{
 const f=fixture();const img=(id,overrides={})=>({id,organizationId:'own',kind:'ai_lab_input',status:'ready',createdAt:new Date(),metadata:{kind:'image'},url:'https://provider.test/'+id+'.png',...overrides});
 f.state.assets=[img('presenter'),img('product',{organizationId:'foreign'})];
 const input={model:'holding',prompt:'Hold this exact guitar naturally.',imageAssetId:'presenter',productAssetId:'product'};
 assert.equal((await f.post({action:'quote',input})).status,422);assert.equal(f.state.calls,0);
 f.state.assets[1]=img('product',{createdAt:new Date(Date.now()-7*86400000)});assert.equal((await f.post({action:'quote',input})).status,422);
 f.state.assets[1]=img('product');const quote=await f.post({action:'quote',input});assert.equal(quote.status,200);
 f.state.assets[1].status='deleted';assert.equal((await f.post(f.generate(quote.body.quoteId))).status,500);assert.equal(f.state.calls,0);
 f.state.assets[1].status='ready';assert.equal((await f.post(f.generate(quote.body.quoteId))).status,200);assert.equal(f.state.calls,1);
});
test('prepared holding photos require explicit product review before video quotes',async()=>{
 const f=fixture();f.state.assets=[{id:'image',organizationId:'own',kind:'ai_lab_input',status:'ready',createdAt:new Date(),metadata:{kind:'image',source:'generated_holding'},url:'https://provider.test/image.png'},{id:'audio',organizationId:'own',kind:'ai_lab_input',status:'ready',createdAt:new Date(),metadata:{kind:'audio'},url:'https://provider.test/audio.mp3'}];
 const input={model:'infinitetalk',prompt:'Friendly natural delivery.',imageAssetId:'image',audioAssetId:'audio'};
 assert.equal((await f.post({action:'quote',input})).status,422);
 assert.equal((await f.post({action:'quote',input:{...input,productReviewed:true}})).status,200);assert.equal(f.state.calls,0);
});
test('holding adapter quotes and submits the identical two-reference FLUX edit without OpenAI or Runway',async()=>{
 const calls=[];const provider=load('lib/ai-lab/providers.ts',{'./catalog':catalog},{fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.includes('/model/price')?{code:200,data:{currency:'USD',discounted_price:.012}}:{code:200,data:{id:'holding-task'}}};}});
 const input={model:'holding',prompt:'Natural relaxed pose.'},media={image:'https://provider.test/presenter.png',product:'https://provider.test/guitar.png'};
 assert.equal(await provider.labQuote(input,media),.012);assert.equal((await provider.labSubmit(input,media)).taskId,'holding-task');
 assert.equal(calls[0].body.model_id,'wavespeed-ai/flux-2-klein-4b/edit');assert.match(calls[1].url,/wavespeed-ai\/flux-2-klein-4b\/edit$/);assert.deepEqual(calls[0].body.inputs,calls[1].body);assert.equal(calls[1].body.images[0],media.image);assert.equal(calls[1].body.images[1],media.product);assert.match(calls[1].body.prompt,/headstock/);assert.equal(calls.length,2);
});
test('finished holding image is private, reusable and remains separate from the campaign product photo',async()=>{
 const job={id:'holding-job',organizationId:'own',status:'running',updatedAt:new Date(0),payload:{model:'holding',prompt:'Hold the guitar.',taskId:'task',estimateUsd:.012,campaignId:'campaign',contentItemId:'post'}};const assets=[];
 const prisma={job:{updateMany:async()=>({count:1}),update:async q=>Object.assign(job,q.data),findUniqueOrThrow:async()=>job},mediaAsset:{upsert:async q=>{assets.push(q.create);return q.create;}}};
 const jobs=load('lib/ai-lab/jobs.ts',{'@/lib/video/mp4':{},'@/lib/prisma':{prisma},'@vercel/blob':{put:async(path)=>assert.equal(path,'ai-lab/own/holding-job.png')},'@/lib/reels/public-fetch':{fetchPublicBytes:async()=>({bytes:Buffer.from('fixture'),contentType:'image/png'})},'./catalog':catalog,'./providers':{labPoll:async()=>({status:'ready',url:'https://provider.test/holding.png'})}});
 await jobs.labRefresh(job);assert.equal(job.status,'succeeded');assert.equal(assets.length,1);assert.equal(assets[0].kind,'ai_lab_input');assert.equal(assets[0].metadata.source,'generated_holding');assert.equal(assets[0].campaignId,undefined);assert.equal(jobs.labSummary(job).imageAssetId,'holding-job');
});
test('saved photo picker exposes only ready unexpired images in the active workspace',async()=>{
 const f=fixture();const base={organizationId:'own',kind:'ai_lab_input',status:'ready',createdAt:new Date(),metadata:{kind:'image',filename:'My presenter.jpg'}};
 f.state.assets=[{...base,id:'own-photo'},{...base,id:'other-photo',organizationId:'foreign'},{...base,id:'old-photo',createdAt:new Date(Date.now()-7*86400000)},{...base,id:'unfinished',status:'uploading'},{...base,id:'audio',metadata:{kind:'audio'}}];
 const result=await f.api.GET();assert.equal(result.status,200);assert.equal(result.body.inputs.length,1);assert.equal(result.body.inputs[0].id,'own-photo');assert.equal(result.body.inputs[0].name,'My presenter.jpg');assert.equal(result.body.inputs[0].url,undefined);
});

test('voice presets, style and pace are bounded and the quote exactly matches synthesis settings',async()=>{
 const f=fixture();const input={model:'speech',prompt:'Find a guitar that speaks to you.',voiceId:'Casual_Guy',voiceEmotion:'happy',voiceSpeed:.95};
 for(const change of [{voiceSpeed:0},{voiceSpeed:2},{voiceEmotion:'invented'},{voiceId:'invented'}])assert.equal((await f.post({action:'quote',input:{...input,...change}})).status,400);
 assert.equal((await f.post({action:'quote',input})).status,200);
 const calls=[];const provider=load('lib/ai-lab/providers.ts',{'./catalog':catalog},{fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>url.includes('/model/price')?{code:200,data:{currency:'USD',discounted_price:.004}}:{code:200,data:{id:'voice-task'}}};}});
 await provider.labQuote(input);await provider.labSubmit(input);assert.deepEqual(calls[0].body.inputs,calls[1].body);assert.equal(calls[1].body.text,input.prompt);assert.equal(calls[1].body.voice_id,'Casual_Guy');assert.equal(calls[1].body.emotion,'happy');assert.equal(calls[1].body.speed,.95);assert.equal(calls[1].body.sample_rate,44100);assert.equal(calls[1].body.bitrate,128000);
 const defaults=provider.speechInputs({model:'speech',voiceId:'Friendly_Person',prompt:'A conversational introduction.'});assert.equal(defaults.speed,1);assert.equal(defaults.emotion,'neutral');
});

test('regional accents retain original voice choices and quote the exact documented regional speaker',async()=>{
 const cases=[['Wise_Woman','british','English_Wiselady'],['Deep_Voice_Man','american','English_ManWithDeepVoice'],['Casual_Guy','australian','English_Aussie_Bloke'],['Patient_Man','indian','English_GentleTeacher']];
 for(const [voiceId,voiceAccent,resolved] of cases){
  const calls=[];const provider=load('lib/ai-lab/providers.ts',{'./catalog':catalog},{fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>url.includes('/model/price')?{code:200,data:{currency:'USD',discounted_price:.004}}:{code:200,data:{id:'voice-task'}}};}});
  const input={model:'speech',voiceId,voiceAccent,prompt:'Explore our guitar collection.'};await provider.labQuote(input);await provider.labSubmit(input);assert.equal(calls[1].voice_id,resolved);assert.equal(calls[1].text,input.prompt);assert.equal(calls[1].language_boost,'English');assert.equal(input.voiceId,voiceId);assert.deepEqual(calls[0].inputs,calls[1]);
 }
 for(const voiceId of Object.keys(catalog.labVoices))assert.equal(catalog.labAccentVoice(voiceId),voiceId);
 const f=fixture(),base={model:'speech',voiceId:'Calm_Woman',prompt:'A calm spoken introduction.'};
 for(const voiceAccent of ['invented','australian','indian'])assert.equal((await f.post({action:'quote',input:{...base,voiceAccent}})).status,400);
 assert.equal(f.state.calls,0);assert.equal((await f.post({action:'quote',input:{...base,voiceAccent:'british'}})).status,200);
});

test('international English previews retain the script and quote the selected documented speaker',async()=>{
 const accents=['french','persian','spanish','italian'];let checked=0;
 for(const voiceAccent of accents)for(const accentSpeaker of Object.keys(catalog.labAccentSpeakers[voiceAccent])){
  const calls=[];const provider=load('lib/ai-lab/providers.ts',{'./catalog':catalog},{fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>url.includes('/model/price')?{code:200,data:{currency:'USD',discounted_price:.003}}:{code:200,data:{id:'task'}}};}});
  const input={model:'speech',voiceId:'Friendly_Person',voiceAccent,accentSpeaker,prompt:'Explore our guitars. Visit rumiguitars.com today.'};await provider.labQuote(input);await provider.labSubmit(input);assert.equal(calls[1].voice_id,accentSpeaker);assert.equal(calls[1].text,input.prompt);assert.equal(calls[1].language_boost,'English');assert.deepEqual(calls[0].inputs,calls[1]);checked++;
 }
 assert.equal(checked,14);
 const f=fixture(),base={model:'speech',voiceId:'Friendly_Person',voiceAccent:'french',prompt:'A clear English introduction.'};
 for(const accentSpeaker of ['invented','Persian_male_1_v1','__proto__','constructor'])assert.equal((await f.post({action:'quote',input:{...base,accentSpeaker}})).status,400);
 assert.equal(f.state.calls,0);assert.equal((await f.post({action:'quote',input:{...base,accentSpeaker:'French_CasualMan'}})).status,200);
 assert.equal(catalog.labAccentVoice('Casual_Guy','southern'),'moss_audio_076697ad-7144-11f0-a447-9613c873494c');assert.equal(catalog.labAccentAvailable('Calm_Woman','southern'),false);
});

test('guitar preparation widens the camera framing rather than shrinking the reference instrument',()=>{
 const provider=load('lib/ai-lab/providers.ts',{'./catalog':catalog}),media={image:'https://provider.test/person.jpg',product:'https://provider.test/guitar.jpg'};
 const full=provider.holdingInputs({model:'holding',prompt:'Natural pose.',holdingPose:'guitar'},media);
 assert.match(full.prompt,/FULL-SIZE ADULT GUITAR/);assert.match(full.prompt,/Move the camera farther away/);assert.match(full.prompt,/across the presenter's lap/);assert.match(full.prompt,/never shorten the neck/);assert.equal(full.images[1],media.product);
 const other=provider.holdingInputs({model:'holding',prompt:'Hold this product.',holdingPose:'reference'},media);assert.doesNotMatch(other.prompt,/FULL-SIZE ADULT GUITAR/);assert.match(other.prompt,/reference product's real-world scale/);
});


test('standing strumming pose keeps the actual guitar and passes API validation',async()=>{
 const provider=load('lib/ai-lab/providers.ts',{'./catalog':catalog});
 const input={model:'holding',prompt:'Natural standing portrait.',holdingPose:'guitar-standing-strum',imageAssetId:'presenter',productAssetId:'product'};
 const result=provider.holdingInputs(input,{image:'https://provider.test/person.jpg',product:'https://provider.test/guitar.jpg'});
 assert.match(result.prompt,/standing portrait/);assert.match(result.prompt,/poised mid-strum over the strings/);assert.match(result.prompt,/strap over the shoulder/);assert.match(result.prompt,/No chair, stool, sitting/);assert.doesNotMatch(result.prompt,/presenter's lap|not performing|No text[^.]*playing demonstration/);assert.equal(result.images[1],'https://provider.test/guitar.jpg');
 const f=fixture();const response=await f.post({action:'quote',input});assert.notEqual(response.status,400);
});
