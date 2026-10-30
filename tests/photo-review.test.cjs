const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps={},env={},cache=new Map()){
 file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,Buffer,URL,Date,process:{env},require:n=>n in deps?deps[n]:n.startsWith('.')||n.startsWith('@/')?load(n.startsWith('@/')?n.slice(2)+'.ts':path.resolve(path.dirname(file),n+'.ts'),deps,env,cache):require(n)});return module.exports;
}
class ImagePendingError extends Error{};class ImageRejectedError extends Error{};class PhotoReviewPendingError extends ImagePendingError{};
const context={brandId:'brand',brandName:'Client',headline:'Financial clarity',caption:'Take a small planning step',business:'Financial education',audience:'Adults',voice:'Reassuring',visualRules:'Candid scenes',goal:'Education',occasion:''};
const good={anatomy:'plausible',anatomyEvidence:'Visible fingers have coherent joints; the thumb is naturally hidden.',objectInteraction:'plausible',interactionEvidence:'The fingertips rest naturally on the object.',messageFits:true,emotionFits:true,visuallyDistinct:true,accurate:true,issues:[],replacementDirection:''};
const pass={status:'passed',issues:[],replacementDirection:'',comparedAssetIds:[]};
const fail={status:'failed',issues:['Repeats the desk portrait.'],replacementDirection:'Overhead hands organizing a simple plan.',comparedAssetIds:['peer']};
const input={organizationId:'org',campaignId:'campaign',contentItemId:'post',requestId:'original-request',prompt:'A meaningful planning scene',format:'portrait',generated:{base64:'first',provider:'bfl',model:'flux'},context,previousMediaUrl:'old',metadata:{subjectCategory:'human',occasion:null}};
function fixture(decisions=[pass]){
 const jobs=new Map(),assets=new Map([['old',{id:'old',organizationId:'org',campaignId:'campaign',contentItemId:'post',kind:'ai_image',status:'ready',url:'old'}]]),calls=[],reviews=[];
 const post={id:'post',headline:context.headline,caption:context.caption,mediaUrl:'old',status:'draft'};let published=false,missing=false,replacementError=null;
 const prisma={
 job:{findFirst:async q=>jobs.get(q.where.id)||null,create:async q=>{if(jobs.has(q.data.id))throw Error('duplicate');const row={...q.data,updatedAt:new Date()};jobs.set(row.id,row);return row;},update:async q=>{Object.assign(jobs.get(q.where.id),q.data);return jobs.get(q.where.id);}},
 mediaAsset:{upsert:async q=>{if(!assets.has(q.where.id))assets.set(q.where.id,{...q.create});return assets.get(q.where.id);},findFirst:async q=>assets.get(q.where.id),update:async q=>{Object.assign(assets.get(q.where.id),q.data);return assets.get(q.where.id);},updateMany:async()=>{for(const a of assets.values())if(a.status==='ready')a.status='superseded';}},
 contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'org');assert.equal(q.where.campaign.brandId,'brand');return missing?null:post;},update:async q=>Object.assign(post,q.data)},
 publishJob:{findFirst:async q=>{assert.equal(q.where.organizationId,'org');return published?{id:'published'}:null;}}};
 prisma.$transaction=async fn=>fn(prisma);
 const cache=new Map();
 const api=load('lib/ai/reviewed-photo.ts',{'@/lib/prisma':{prisma},'./photo-review':{PhotoReviewPendingError,reviewPhoto:async q=>{if(!cache.has(q.assetId)){reviews.push(q);cache.set(q.assetId,decisions[Math.min(cache.size,decisions.length-1)]);}return cache.get(q.assetId);}},'./image-provider':{ImageRejectedError,generateImage:async q=>{calls.push(q);if(replacementError)throw replacementError;return {base64:'replacement',provider:'bfl',model:'flux'};}}});
 return{api,jobs,assets,post,calls,reviews,published:()=>published=true,missing:()=>missing=true,error:e=>replacementError=e};
}
test('passed photo selected once, original preserved, approval reset; duplicate completion cannot overwrite a later choice',async()=>{
 const f=fixture();f.post.status='approved';const r=await f.api.selectReviewedPhoto(input);assert.equal(r.selected,true);assert.equal(f.calls.length,0);assert.equal(f.post.status,'draft');assert.equal(f.assets.get('old').url,'old');assert.equal(f.assets.get('old').status,'superseded');
 await f.api.selectReviewedPhoto(input);assert.equal(f.reviews.length,1);f.assets.get(r.asset.id).status='superseded';f.post.mediaUrl='user-choice';const replay=await f.api.selectReviewedPhoto(input);assert.equal(replay.selected,false);assert.equal(f.post.mediaUrl,'user-choice');
});
test('failed first photo allows exactly one corrected replacement, retains both, and freezes feedback on resume',async()=>{
 const f=fixture([fail,pass]);await assert.rejects(f.api.selectReviewedPhoto(input),PhotoReviewPendingError);assert.equal(f.calls.length,0);assert.equal(f.post.mediaUrl,'old');
 const r=await f.api.selectReviewedPhoto({...input,prompt:'Drifted prompt',context:{...context,headline:'Unrelated'}});assert.equal(r.selected,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].requestId,'original-request:replacement');assert.match(f.calls[0].prompt,/Overhead hands/);assert.doesNotMatch(f.calls[0].prompt,/Drifted/);assert.equal(f.assets.size,3);assert.equal(f.reviews[1].context.headline,context.headline);
 await f.api.selectReviewedPhoto(input);assert.equal(f.calls.length,1);assert.equal(f.reviews.length,2);
});
test('two failures leave existing photo selected and stop automatic spending',async()=>{
 const f=fixture([fail,fail]);await assert.rejects(f.api.selectReviewedPhoto(input));const r=await f.api.selectReviewedPhoto(input);assert.equal(r.selected,false);assert.equal(r.candidateIds.length,2);assert.equal(f.post.mediaUrl,'old');assert.equal(f.assets.get('old').status,'ready');assert.equal(r.asset.status,'superseded');await f.api.selectReviewedPhoto(input);assert.equal(f.calls.length,1);
});
test('unavailable review does not pass or buy a replacement',async()=>{const f=fixture([{...pass,status:'unavailable',issues:['Review unavailable']}]);const r=await f.api.selectReviewedPhoto(input);assert.equal(r.selected,false);assert.equal(f.calls.length,0);assert.equal(f.post.mediaUrl,'old');});
test('interrupted replacement resumes its same provider request and prompt',async()=>{const f=fixture([fail,pass]);await assert.rejects(f.api.selectReviewedPhoto(input));f.error(new ImagePendingError());await assert.rejects(f.api.selectReviewedPhoto(input));f.error(null);await f.api.selectReviewedPhoto(input);assert.equal(f.calls[0].requestId,f.calls[1].requestId);assert.equal(f.calls[0].prompt,f.calls[1].prompt);});
test('definitive replacement rejection preserves the first photo for manual review',async()=>{const f=fixture([fail]);await assert.rejects(f.api.selectReviewedPhoto(input));f.error(new ImageRejectedError());const r=await f.api.selectReviewedPhoto(input);assert.equal(r.selected,false);assert.equal(r.candidateIds.length,1);assert.match(r.review.issues.join(' '),/replacement could not/);await f.api.selectReviewedPhoto(input);assert.equal(f.calls.length,1);});
test('publication, changed caption, changed photo and foreign post prevent automatic selection',async()=>{
 for(const change of [f=>f.published(),f=>f.post.caption='Edited',f=>f.post.mediaUrl='Chosen by user',f=>f.missing(),f=>f.post.status='published']){const f=fixture();change(f);const previous=f.post.mediaUrl;const r=await f.api.selectReviewedPhoto(input);assert.equal(r.selected,false);assert.equal(f.post.mediaUrl,previous);assert.equal(f.assets.get('old').status,'ready');}
});
function reviewFixture(options={}){
 const jobs=new Map(),requests=[],queries=[];let counter=0;
 const prisma={job:{findFirst:async q=>jobs.get(q.where.id),create:async q=>{if(jobs.has(q.data.id))throw Error('duplicate');const row={...q.data,updatedAt:new Date()};jobs.set(row.id,row);return row;},update:async q=>Object.assign(jobs.get(q.where.id),q.data)},campaign:{findFirst:async q=>{queries.push(q);return {id:'campaign'};}},mediaAsset:{findMany:async q=>{queries.push(q);return options.peers || [0,0,1,2,3].map((p,i)=>({id:'peer'+i,contentItemId:'post'+p,url:'data:image/png;base64,'+Buffer.from('peer-'+p).toString('base64')}));}}};
 const sizes=[];const sharp=()=>({rotate(){return this;},resize(w){sizes.push(w);return this;},jpeg(){return this;},async toBuffer(){return Buffer.from('thumb');}});
 class OpenAI{constructor(config){assert.equal(config.maxRetries,0);assert.equal(config.timeout,30000);this.responses={create:async q=>{counter++;requests.push(q);if(options.wait)await options.wait;if(options.error)throw Error('network');return options.response||{status:'completed',output_text:JSON.stringify(options.verdict||good)};}};}}
 const api=load('lib/ai/photo-review.ts',{'@/lib/prisma':{prisma},openai:OpenAI,sharp,'./image-provider':{ImagePendingError},'@/lib/reels/public-fetch':{fetchPublicBytes:async()=>{throw Error('Unsafe URL');}}},options.noKey?{}:{OPENAI_API_KEY:'fake-for-tests'});
 return{api,jobs,requests,queries,sizes,calls:()=>counter};
}
const reviewInput={organizationId:'org',campaignId:'campaign',contentItemId:'post',assetId:'candidate',url:'data:image/png;base64,YQ==',context};
test('vision gets actual candidate plus three unique same-campaign photos, strict output, no response storage',async()=>{
 const f=reviewFixture();const r=await f.api.reviewPhoto(reviewInput);assert.equal(r.status,'passed');assert.equal(f.requests[0].input[0].content.filter(c=>c.type==='input_image').length,4);assert.deepEqual(f.sizes,[1024,512,512,512]);assert.equal(f.requests[0].store,false);assert.equal(f.requests[0].text.format.strict,true);assert.equal(f.queries[0].where.brand.organizationId,'org');assert.equal(f.queries[1].where.organizationId,'org');assert.equal(f.queries[1].where.campaignId,'campaign');assert.equal(f.queries[1].where.contentItemId.not,'post');assert.equal(f.queries[1].take,16);await f.api.reviewPhoto(reviewInput);assert.equal(f.calls(),1);
});
test('each failed criterion rejects an image, malformed and incomplete outputs never pass',async()=>{
 for(const criterion of ['messageFits','emotionFits','visuallyDistinct','accurate']){const f=reviewFixture({verdict:{...good,[criterion]:false,issues:['Mismatch'],replacementDirection:'Different meaningful scene'}});assert.equal((await f.api.reviewPhoto(reviewInput)).status,'failed');}
 for(const response of [{status:'incomplete',output_text:JSON.stringify(good)},{status:'completed',output_text:'{}'},{status:'completed',output_text:'garbled'}]){const f=reviewFixture({response});assert.equal((await f.api.reviewPhoto(reviewInput)).status,'unavailable');}
});
test('missing key, unreadable image and network timeout are visible review failures with no paid retry',async()=>{
 for(const options of [{noKey:true},{error:true}]){const f=reviewFixture(options);assert.equal((await f.api.reviewPhoto(reviewInput)).status,'unavailable');await f.api.reviewPhoto(reviewInput);assert.equal(f.calls(),options.noKey?0:1);}
 const f=reviewFixture();assert.equal((await f.api.reviewPhoto({...reviewInput,url:'https://127.0.0.1/private'})).status,'unavailable');assert.equal(f.calls(),0);
});
test('concurrent reviews reserve one paid call; stale interrupted claims do not resubmit',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const f=reviewFixture({wait:gate});const first=f.api.reviewPhoto(reviewInput);await new Promise(resolve=>setImmediate(resolve));await assert.rejects(f.api.reviewPhoto(reviewInput),ImagePendingError);release();await first;assert.equal(f.calls(),1);
 const interrupted=reviewFixture();const hash=require('node:crypto').createHash('sha256').update(JSON.stringify(['org','candidate'])).digest('hex').slice(0,40);interrupted.jobs.set('photo-review-'+hash,{status:'running',updatedAt:new Date(0)});assert.equal((await interrupted.api.reviewPhoto(reviewInput)).status,'unavailable');assert.equal(interrupted.calls(),0);
});
test('review rubric handles captions, emotions, recurrence, factual accuracy and untrusted instructions',()=>{const f=reviewFixture();const prompt=f.api.photoReviewPrompt(context);for(const term of ['caption','Emotion','Variety','Accuracy','untrusted','solemn','recurring spokesperson','Do not identify people'])assert.ok(prompt.includes(term));assert.equal(f.api.photoPasses({...good,issues:['Unresolved issue']}),false);assert.throws(()=>f.api.photoVerdict({...good,accurate:'yes'}));});

test('manual route blocks scheduled posts before paid generation and returns review/pending state accurately',async()=>{
 for(const state of ['scheduled','flagged','pending']){
  let generated=0,reviewInput;
  const post={id:'post',campaignId:'campaign',type:'post',status:state==='scheduled'?'scheduled':'draft',headline:context.headline,caption:context.caption,mediaUrl:'old',campaign:{goal:'Education',brand:{id:'brand',name:'Client'}}};
  const prisma={contentItem:{findFirst:async()=>post,findMany:async()=>[{id:'post'}]},publishJob:{findFirst:async()=>null},onboardingState:{findUnique:async()=>null},job:{findFirst:async()=>null,create:async()=>({})}};
  const api=load('app/api/creative/generate-image/route.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},'@/lib/prisma':{prisma},'@/lib/auth/context':{tenantContext:async()=>({isSuperAdmin:true,organizationId:'org',role:'owner'})},'@/lib/ai/visual-history':{recentBrandConcepts:async()=>[],regenerationVariationIndex:()=>0},'@/lib/ai/image-provider':{ImagePendingError,generateImage:async()=>{generated++;return input.generated;}},'@/lib/ai/reviewed-photo':{selectReviewedPhoto:async q=>{reviewInput=q;if(state==='pending')throw new ImagePendingError('Saved progress');return {asset:{id:'candidate',url:'saved'},selected:false,review:fail};}}});
  const r=await api.POST({json:async()=>({requestId:'00000000-0000-4000-8000-000000000000',campaignId:'campaign',contentItemId:'post',prompt:'A clear planning moment'})});
  if(state==='scheduled'){assert.equal(r.status,409);assert.equal(generated,0);}else if(state==='pending'){assert.equal(r.status,202);assert.equal(r.body.pending,true);}else{assert.equal(r.status,200);assert.equal(r.body.needsReview,true);assert.equal(reviewInput.context.caption,context.caption);assert.equal(reviewInput.previousMediaUrl,'old');}
 }
});
test('background worker stops before layout or media changes when the photo needs human review',async()=>{
 const job={id:'job',organizationId:'org',type:'GENERATE_IMAGE',status:'queued',payload:{campaignId:'campaign',contentItemId:'post',prompt:'Planning moment'}};let savedResult;
 const prisma={job:{findFirst:async()=>job,updateMany:async()=>({count:1}),update:async q=>{if(q.data.result)savedResult=q.data.result;return {...job,...q.data};}},contentItem:{findUnique:async()=>({id:'post',headline:context.headline,caption:context.caption,mediaUrl:'old',type:'post',campaign:{brand:{id:'brand',name:'Client'}}}),update:async()=>{throw Error('Must not select flagged photo');}}};
 const deps={'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},'@/lib/prisma':{prisma},'@/lib/ai/image-provider':{ImageRejectedError,generateImage:async()=>input.generated,imageConfiguration:()=>({})},'@/lib/ai/visual-history':{recentBrandConcepts:async()=>[],regenerationVariationIndex:()=>0},'@/lib/ai/visual-director':{buildVisualDirection:()=>input.prompt},'@/lib/ai/visual-plan':{isSubjectCategory:()=>false},'@/lib/ai/reviewed-photo':{selectReviewedPhoto:async()=>({asset:{id:'candidate'},selected:false,review:fail})},'@/lib/render/svg':{renderSocialSvg:()=>{throw Error('Must not render flagged photo');}}};
 for(const name of ['@/lib/campaign/setup-photos','@/lib/ai/campaign','@/lib/campaign/content-plan','@/lib/campaign/photo-matching','@/lib/render/showcase','@/lib/ai/occasion','@/lib/render/raster'])deps[name]={};
 const api=load('app/api/jobs/run/route.ts',deps,{WORKER_SECRET:'test'});const r=await api.POST({headers:{get:()=> 'test'},json:async()=>({organizationId:'org'})});assert.equal(r.status,200);assert.equal(r.body.needsReview,true);assert.equal(savedResult.needsReview,true);
});

test('reel review compares same-post photos and other scenes, skipping own scene and flagged candidates',async()=>{
 const peer=(id,sceneId,photoReview)=>({id,contentItemId:'post',url:'data:image/png;base64,'+Buffer.from(id).toString('base64'),metadata:{sceneId,photoReview}});
 const f=reviewFixture({peers:[peer('old-same-scene','scene1'),peer('flagged','scene2',{status:'failed'}),peer('main'),peer('other-scene','scene2'),peer('third-scene','scene3'),peer('extra','scene4')]});
 const r=await f.api.reviewPhoto({...reviewInput,sceneId:'scene1'});assert.deepEqual(Array.from(r.comparedAssetIds),['main','other-scene','third-scene']);assert.equal(f.queries[1].where.contentItemId,'post');assert.equal(f.queries[1].where.id.not,'candidate');assert.equal(f.queries[1].where.organizationId,'org');assert.equal(f.queries[1].where.campaignId,'campaign');assert.equal(f.requests[0].input[0].content.filter(c=>c.type==='input_image').length,4);
});

test('distorted or uncertain anatomy/contact fails even when every general criterion passes',async()=>{
 for(const field of ['anatomy','objectInteraction'])for(const value of ['defective','uncertain']){
  const verdict={...good,[field]:value,anatomyEvidence:'Two visible fingers merge at the palm.',interactionEvidence:'A finger passes through the strings.',issues:[]};
  const f=reviewFixture({verdict});const result=await f.api.reviewPhoto(reviewInput);
  assert.equal(result.status,'failed');assert.ok(result.issues.length);assert.match(result.issues.join(' '),field==='anatomy'?/fingers merge/:/passes through/);
  assert.equal(f.requests[0].text.format.schema.required.includes(field),true);
  assert.ok(f.requests[0].text.format.schema.properties[field].enum.includes('uncertain'));
 }
});
test('natural occlusion and photos without people can pass, missing or invalid physical checks cannot',async()=>{
 for(const verdict of [good,{...good,anatomy:'not_visible',anatomyEvidence:'No person is depicted.',objectInteraction:'not_applicable',interactionEvidence:'The guitar is displayed alone.'}]){
  assert.equal((await reviewFixture({verdict}).api.reviewPhoto(reviewInput)).status,'passed');
 }
 const missing={...good};delete missing.anatomy;
 for(const verdict of [missing,{...good,anatomy:'probably'},{...good,anatomyEvidence:''},{...good,objectInteraction:'unknown'}]){
  const f=reviewFixture({verdict});assert.equal((await f.api.reviewPhoto(reviewInput)).status,'unavailable');await f.api.reviewPhoto(reviewInput);assert.equal(f.calls(),1);
 }
});
test('hand-defect feedback reaches one replacement and blocks selection when it still fails',async()=>{
 const verdict={...good,anatomy:'defective',anatomyEvidence:'Fingers merge into the palm.',replacementDirection:'A simple natural hand pose with distinct fingers.',issues:[]};
 const rejected=await reviewFixture({verdict}).api.reviewPhoto(reviewInput);
 const f=fixture([rejected,rejected]);await assert.rejects(f.api.selectReviewedPhoto(input),PhotoReviewPendingError);const result=await f.api.selectReviewedPhoto(input);
 assert.equal(result.selected,false);assert.equal(f.calls.length,1);assert.match(f.calls[0].prompt,/Fingers merge into the palm/);assert.match(f.calls[0].prompt,/simple natural hand pose/);assert.equal(result.candidateIds.length,2);assert.equal(f.post.mediaUrl,'old');await f.api.selectReviewedPhoto(input);assert.equal(f.calls.length,1);
});
