const {test} = require('node:test'), assert = require('node:assert/strict');
const {load} = require('./helpers/weekly-load.cjs');
const {weeklyScenePhotos} = load('lib/weekly/scene-photos.ts');
const {automaticReelPlan} = load('lib/reels/auto-plan.ts');
const {reelDuration} = load('lib/reels/timeline.ts');
const brand = {id:'brand',name:'Rumi Guitars',industry:'retail guitars',description:'Musical instruments',logoUrl:null,websiteUrl:'https://shop.test'};
const input = {campaignId:'campaign',contentItemId:'post',brand,goal:'awareness',headline:'Make room for music',caption:'Find a quiet place and enjoy a little music.',direction:'Warm daylight and musical inspiration.'};

test('three saved AI scene plans differ in framing and never claim exact product identity', () => {
  const scenes = weeklyScenePhotos(input);
  assert.equal(scenes.length,3); assert.equal(new Set(scenes.map(s=>s.prompt)).size,3);
  assert.deepEqual(Array.from(scenes,s=>s.sceneId),['post-planned-1','post-planned-2','post-planned-3']);
  assert.match(scenes[0].context.direction,/wide environmental/); assert.match(scenes[1].context.direction,/meaningful detail/); assert.match(scenes[2].context.direction,/medium lifestyle/);
  for(const scene of scenes) { assert.equal(scene.context.headline,input.headline); assert.match(scene.prompt,/Do not invent a branded product model/); }
  assert.throws(()=>weeklyScenePhotos({...input,headline:'Meet the Martinez MF-17'}),/specific product/);
  assert.throws(()=>weeklyScenePhotos({...input,caption:'Shop https://shop.test/products/godin-guitar'}),/specific product/);
});

function workerFixture() {
  const packId='pack', slot={key:'slot',kind:'motion_reel',day:1,date:'2026-11-02',topic:'Music in everyday life',layout:'weekly-banner',reelPhotoSource:'ai'};
  const state={jobs:new Map(),assets:new Map(),posts:new Map(),calls:[],reviews:[],logoReads:[],decision:'passed',copies:0,interrupted:false};
  const business={...brand}; const campaign={id:'campaign',brandId:'brand',goal:'awareness',brand:business};
  const main={id:'generate',organizationId:'org',type:'CREATE_EVERYTHING',status:'queued',createdAt:new Date(),payload:{campaignId:'campaign',weeklyPackId:packId,weeklySlots:[slot],weeklySources:[],brief:'Prepare the week',days:7,goal:'awareness',photoSource:'ai',contentPlan:[{planKey:'slot',type:'reel_post',day:1,date:'2026-11-02',topics:[],platforms:[]}]}};
  state.jobs.set(main.id,main);state.jobs.set(packId,{id:packId,organizationId:'org',type:'WEEKLY_PACK',status:'queued',payload:{campaignId:'campaign',slots:[slot]}});
  const matches=(row,where)=>Object.entries(where||{}).every(([k,v])=> k==='payload'?v.path.reduce((a,b)=>a?.[b],row.payload)===v.equals : k==='campaign'?true : v&&typeof v==='object'&&'in' in v?v.in.includes(row[k]):row[k]===v);
  const db={
    job:{findFirst:async({where})=>[...state.jobs.values()].find(row=>matches(row,where))||null,
      findMany:async({where})=>[...state.jobs.values()].filter(row=>matches(row,where)),
      create:async({data})=>{assert.ok(data.id);assert.ok(!state.jobs.has(data.id));const row={status:'queued',...data};state.jobs.set(row.id,row);return row;},
      update:async({where,data})=>{const row=state.jobs.get(where.id);Object.assign(row,data);return row;},
      updateMany:async({where,data})=>{const rows=[...state.jobs.values()].filter(row=>matches(row,where));rows.forEach(row=>Object.assign(row,data));return{count:rows.length};}},
    campaign:{findUnique:async q=>{assert.equal(q.where.brand.organizationId,'org');return campaign;},update:async()=>campaign},
    brand:{updateMany:async({where,data})=>{assert.equal(where.organizationId,'org');assert.equal(where.websiteUrl,business.websiteUrl);Object.assign(business,data);return{count:1};}},
    contentItem:{count:async()=>state.posts.size,deleteMany:async()=>{},create:async({data})=>{const post={id:'post',mediaUrl:null,...data};state.posts.set(post.id,post);return post;},
      findUnique:async({where})=>{assert.equal(where.campaign.brand.organizationId,'org');return {...state.posts.get(where.id),campaign};},
      findFirst:async({where})=>{assert.equal(where.campaign.brand.organizationId,'org');return state.posts.get(where.id);}},
    mediaAsset:{findFirst:async({where})=>[...state.assets.values()].find(row=>matches(row,where))||null,
      upsert:async({where,create})=>{if(!state.assets.has(where.id))state.assets.set(where.id,create);return state.assets.get(where.id);},
      update:async({where,data})=>{const row=state.assets.get(where.id);Object.assign(row,data);return row;}},
    $transaction:async callback=>callback(db),
  };
  class ImageRejectedError extends Error{}; class PhotoReviewPendingError extends Error{};
  const mocks={
    'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/lib/prisma':{prisma:db},
    '@/lib/ai/image-provider':{ImageRejectedError,generateImage:async p=>{state.calls.push(p);return{base64:Buffer.from(p.requestId).toString('base64'),provider:'openai',model:'medium'};}},
    '@/lib/ai/photo-review':{PhotoReviewPendingError,reviewPhoto:async p=>{state.reviews.push(p);if(state.interrupted){state.interrupted=false;throw new PhotoReviewPendingError();}return{status:state.decision,issues:state.decision==='passed'?[]:['Needs review'],replacementDirection:'Try a different setting',comparedAssetIds:[]};}},
    '@/lib/ai/campaign':{generateCampaign:async()=>{state.copies++;return{title:'Music every day',posts:[{planKey:'slot',day:1,type:'reel_post',headline:input.headline,caption:input.caption,visualDirection:input.direction}],stories:[]};}},
    '@/lib/ai/visual-history':{recentBrandConcepts:async()=>[]},
    '@/lib/ai/visual-plan':{buildVisualConcept:()=>({subjectCategory:'experience'}),recentVisualConcept:()=>({})},
    '@/lib/onboarding/website':{readWebsiteLogo:async url=>{state.logoReads.push(url);return'data:image/png;base64,LOGO';}},
  };
  const api=load('app/api/jobs/run/route.ts',mocks);
  const run=id=>api.POST({headers:{get:()=>process.env.WORKER_SECRET},json:async()=>({organizationId:'org',jobId:id})});
  return {state,run,business};
}

test('weekly worker queues three included scenes, resumes saved photos and produces a 15-second multi-photo plan',async()=>{
  const old=process.env.WORKER_SECRET;process.env.WORKER_SECRET='fixture-secret';
  try {
    const f=workerFixture();assert.equal((await f.run('generate')).status,200);
    assert.equal(f.state.copies,1);assert.equal(f.state.logoReads.length,1);assert.equal(f.business.logoUrl,'data:image/png;base64,LOGO');
    const jobs=[...f.state.jobs.values()].filter(row=>row.type==='GENERATE_IMAGE');
    assert.equal(jobs.length,3);assert.equal(f.state.assets.size,0);
    assert.ok(jobs.every(job=>job.payload.scenePhotoPlan&&job.payload.weeklyPackId==='pack'));
    f.state.interrupted=true;
    assert.equal((await f.run(jobs[0].id)).status,202);assert.equal(f.state.calls.length,1);
    assert.equal((await f.run(jobs[0].id)).status,200);assert.equal(f.state.calls.length,1,'Review resume reuses paid pixels');
    for(const job of jobs.slice(1))assert.equal((await f.run(job.id)).status,200);
    assert.equal(f.state.calls.length,3);assert.equal(f.state.assets.size,3);
    assert.ok([...f.state.assets.values()].every(asset=>asset.kind==='reel_scene_image'&&asset.status==='ready'));
    assert.equal(f.state.posts.get('post').mediaUrl,null,'A scene photo is never passed off as a finished reel');
    const assets=[...f.state.assets.values()].map(asset=>({...asset,brandId:'brand'}));
    const result=automaticReelPlan({organizationId:'org',campaignId:'campaign',brand:{...brand,color:'#123456',accent:'#abcdef',website:brand.websiteUrl,logo:'/original-logo'},post:{...input,id:'post',type:'reel_post',plannedAIPhotos:true},assets});
    assert.equal(result.sources.length,3);assert.equal(new Set(result.sources.map(s=>s.src)).size,3);
    assert.equal(reelDuration(result.project),15);assert.equal(result.project.logo,'/original-logo');assert.equal(result.project.productSubject,undefined);
    assert.ok(result.project.scenes.every(scene=>scene.headline&&scene.kind==='image'));assert.equal(result.project.animation,'gentle');
    assert.equal((await f.run(jobs[0].id)).body.status,'idle');assert.equal(f.state.calls.length,3);
  } finally {if(old===undefined)delete process.env.WORKER_SECRET;else process.env.WORKER_SECRET=old;}
});

test('AI scene plan never fills a missing or rejected shot with another customer, unrelated photo or duplicate',()=>{
  const asset=n=>({id:'scene'+n,organizationId:'org',campaignId:'campaign',brandId:'brand',contentItemId:'post',kind:'reel_scene_image',status:'ready',url:'https://photo.test/'+n,metadata:{sceneId:`post-planned-${n}`,photoReview:{status:'passed'}}});
  const make=assets=>automaticReelPlan({organizationId:'org',campaignId:'campaign',brand:{...brand,color:'#123456',accent:'#abcdef',website:''},post:{id:'post',type:'reel_post',headline:input.headline,caption:input.caption,plannedAIPhotos:true},assets});
  const three=[asset(1),asset(2),asset(3)];assert.equal(make(three).sources.length,3);
  for(const bad of [{...asset(3),organizationId:'foreign'},{...asset(3),brandId:'foreign'},{...asset(3),contentItemId:'other'},{...asset(3),status:'superseded'},{...asset(3),metadata:{sceneId:'post-planned-3',photoReview:{status:'failed'}}},{...asset(3),url:asset(1).url}]) {
    assert.equal(make([asset(1),asset(2),bad,{...asset(3),id:'unrelated',kind:'ai_image'}]).sources.length,2);
  }
});

test('failed weekly scene review permits only one replacement, and missing scenes remain incomplete',async()=>{
  const old=process.env.WORKER_SECRET;process.env.WORKER_SECRET='fixture-secret';
  try {
    const f=workerFixture();await f.run('generate');const id='post-weekly-scene-1';f.state.decision='failed';
    assert.equal((await f.run(id)).status,202);assert.equal(f.state.calls.length,1);
    assert.equal((await f.run(id)).status,200);assert.equal(f.state.calls.length,2);
    assert.equal(f.state.jobs.get(id).result.needsReview,true);
    assert.ok([...f.state.assets.values()].every(asset=>asset.status==='superseded'));
    assert.equal(f.state.calls[1].requestId,`worker:${id}:replacement`);
    await f.run('post-weekly-scene-2');await f.run('post-weekly-scene-2');
    f.state.decision='passed';await f.run('post-weekly-scene-3');
    const count=f.state.calls.length;await f.run(id);assert.equal(f.state.calls.length,count,'Completed review is never repurchased');
  } finally {if(old===undefined)delete process.env.WORKER_SECRET;else process.env.WORKER_SECRET=old;}
});

test('saved weekly mapping enforces AI scenes even after caption edits and ignores unrelated product topics',async()=>{
  let inspected;
  const post={id:'post',campaignId:'campaign',type:'reel_post',headline:input.headline,caption:'Edited caption',campaign:{id:'campaign',title:'Music',brand}};
  const mocks={
    'next/server':{NextResponse:{json:(body,init={})=>({body,status:init.status||200})}},
    '@/lib/auth/context':{tenantContext:async()=>({organizationId:'org'})},
    '@/lib/reels/auto-plan':{automaticReelPlan:value=>{inspected=value;return{project:{scenes:[]},sources:[],warnings:[]};}},
    '@/lib/prisma':{prisma:{
      contentItem:{findFirst:async()=>post,findMany:async()=>[post]},campaign:{findMany:async()=>[{id:'campaign'}]},mediaAsset:{findMany:async()=>[]},
      job:{findMany:async q=>{assert.equal(q.where.organizationId,'org');return [
        {type:'CREATE_EVERYTHING',payload:{campaignId:'campaign',contentPlan:[{planKey:'slot',topics:['Rumi Guitars: editorial theme']}]},result:{posts:[{...post,caption:'Old caption',planKey:'slot'}]}},
        {type:'WEEKLY_PACK',payload:{campaignId:'campaign',slots:[{key:'slot',kind:'motion_reel',reelPhotoSource:'ai'}]},result:{items:[{slotKey:'slot',contentItemId:'post'}]}},
      ];}},
    }},
  };
  const api=load('app/api/reels/auto-plan/route.ts',mocks);
  const result=await api.POST(new Request('https://app.test/api/reels/auto-plan',{method:'POST',body:JSON.stringify({organizationId:'org',campaignId:'campaign',contentItemId:'post'})}));
  assert.equal(result.status,200);assert.equal(inspected.post.plannedAIPhotos,true);assert.equal(inspected.post.topics.length,0);
  assert.equal(inspected.post.caption,'Edited caption');assert.equal(inspected.post.visualDirection,undefined);
});

test('website-logo backfill is tenant scoped, optional and never overwrites a concurrent logo or website edit',async()=>{
  for(const mode of ['existing','missing','failure','found','concurrent']) {
    const reads=[],writes=[];const business={...brand,logoUrl:mode==='existing'?'manual-logo':null};
    const helper=load('lib/weekly/website-logo.ts',{'@/lib/onboarding/website':{readWebsiteLogo:async url=>{reads.push(url);if(mode==='failure')throw Error('unavailable');return mode==='missing'?undefined:'website-logo';}},'@/lib/prisma':{prisma:{brand:{updateMany:async q=>{writes.push(q);return{count:mode==='concurrent'?0:1};},findFirst:async q=>{assert.equal(q.where.organizationId,'org');return{logoUrl:'new-manual-logo'};}}}}});
    const logo=await helper.importWeeklyLogo('org',business);
    assert.equal(logo,mode==='existing'?'manual-logo':mode==='found'?'website-logo':mode==='concurrent'?'new-manual-logo':null);
    assert.equal(reads.length,mode==='existing'?0:1);assert.equal(writes.length,['found','concurrent'].includes(mode)?1:0);
    if(writes.length)assert.deepEqual(JSON.parse(JSON.stringify(writes[0].where)),{id:'brand',organizationId:'org',logoUrl:null,websiteUrl:'https://shop.test'});
  }
});
