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
  vm.runInNewContext(js, { module, exports: module.exports, require: requireFile, process, Buffer, URL, console, fetch: mocks.__fetch || fetch, AbortSignal, FormData, Blob, Response, Uint8Array }, { filename: file });
  return module.exports;
}
const plan = load('lib/ai/visual-plan.ts');
const director = load('lib/ai/visual-director.ts');
const response = { NextResponse: { json: (body, options = {}) => ({ status: options.status || 200, json: async () => body }) } };

test('product campaign rotates all six subjects; services never get product heroes', () => {
  for (const context of [{ industry: 'Classical guitar retail' }, { businessType: 'service', description: 'Hypnotherapy and coaching' }]) {
    const history = []; const categories = [];
    for (let i = 0; i < 14; i++) { const c = plan.buildVisualConcept({ businessContext: context, variationIndex: i, recentConcepts: history }); categories.push(c.subjectCategory); history.push(c); }
    assert.equal(categories.some((c, i) => i && c === categories[i - 1]), false);
    if (context.businessType) { assert.equal(categories.includes('product'), false); assert.equal(new Set(categories).size, 5); }
    else { assert.equal(new Set(categories).size, 6); assert.ok(categories.filter(c => c === 'product').length <= 3); }
  }
});
test('service business context and previous motifs reach image prompt without another brand', () => {
  const context = { businessType: 'service', description: 'Hypnotherapy and confidence coaching' };
  const recentConcepts = [{ subjectCategory: 'environment', direction: 'An empty chair in a room' }];
  const concept = plan.buildVisualConcept({ businessContext: context, variationIndex: 0, recentConcepts });
  const prompt = director.buildVisualDirection({ brand: { name: 'Master Mind' }, businessContext: context, visualConcept: concept, recentConcepts, visualDirection: 'Another empty chair' });
  assert.match(prompt, /Primary subject category: human/);
  assert.match(prompt, /takes priority over conflicting/);
  assert.match(prompt, /An empty chair in a room/);
  assert.match(prompt, /Hypnotherapy/);
  assert.equal(prompt.includes('Rumi Guitars'), false);
});
test('uncertain businesses are not assigned an invented physical product', () => {
  assert.equal(plan.businessVisualMode({}), 'unknown');
  for (let i = 0; i < 12; i++) assert.notEqual(plan.buildVisualConcept({ businessContext: {}, variationIndex: i }).subjectCategory, 'product');
  assert.equal(plan.businessVisualMode({ industry: 'Furniture retail' }), 'product');
});
test('brand history queries enforce organization and matching brand campaigns', async () => {
  let campaignsQuery, jobsQuery;
  const prisma = { campaign: { findMany: async q => { campaignsQuery = q; return [{ id: 'brand-a-campaign' }]; } }, job: { findMany: async q => { jobsQuery = q; return [{ payload: { visualConcept: { subjectCategory: 'human' }, originalDirection: 'Performing' } }]; } } };
  const history = load('lib/ai/visual-history.ts', { '@/lib/prisma': { prisma } });
  await history.recentBrandConcepts('org-a', 'brand-a', new Date(100));
  assert.equal(campaignsQuery.where.brandId, 'brand-a'); assert.equal(campaignsQuery.where.brand.organizationId, 'org-a');
  assert.equal(jobsQuery.where.organizationId, 'org-a'); assert.equal(jobsQuery.where.OR[0].payload.equals, 'brand-a-campaign'); assert.equal(jobsQuery.where.createdAt.lt.getTime(), 100);
});
test('real clip validator rejects fake MIME, oversized and noncanonical payloads', () => {
  const clips = load('lib/video/clips.ts');
  const bytes = Buffer.alloc(32); bytes.write('ftyp', 4);
  assert.equal(clips.decodeClip(`data:video/mp4;base64,${bytes.toString('base64')}`).bytes.length, 32);
  assert.throws(() => clips.decodeClip(`data:video/webm;base64,${bytes.toString('base64')}`));
  assert.throws(() => clips.decodeClip('data:video/mp4;base64,YQ=='));
  assert.throws(() => clips.decodeClip(`data:video/mp4;base64,${Buffer.alloc(clips.MAX_CLIP_BYTES + 1).toString('base64')}`));
});
test('regeneration UI has no hard-coded guitar or no-people instruction', () => {
  const source = fs.readFileSync(path.join(root, 'components/RegenerateImageButton.tsx'), 'utf8');
  assert.equal(/classical guitar|Rumi Guitars|FE14|No people/.test(source), false);
});
test('regeneration rejects another tenant before making image-provider request', async () => {
  let calls = 0;
  class OpenAI { constructor() { calls++; } }
  const route = load('app/api/creative/generate-image/route.ts', { 'next/server': response, openai: OpenAI, '@/lib/auth/context': { tenantContext: async () => ({isSuperAdmin:true, organizationId: 'own-org' }) }, '@/lib/prisma': { prisma: { contentItem: { findFirst: async q => { assert.equal(q.where.campaign.brand.organizationId, 'own-org'); return null; } } } } });
  const result = await route.POST({ json: async () => ({ requestId:'12345678-1234-4234-8234-123456789abc', campaignId: 'other-campaign', contentItemId: 'other-item', prompt: 'Generate a fresh subject.' }) });
  assert.equal(result.status, 404); assert.equal(calls, 0);
});

test('video selection enforces ownership and resets approval; scheduled posts cannot change', async () => {
  let selected, active = false;
  const tx = {
    contentItem: { findFirst: async q => { assert.equal(q.where.campaign.brand.organizationId, 'own'); return { id: 'post', campaignId: 'campaign', status: 'approved' }; }, update: async q => { selected = q.data; } },
    mediaAsset: { findFirst: async q => { assert.equal(q.where.organizationId, 'own'); assert.equal(q.where.contentItemId, 'post'); return { id: 'clip', url: 'data:video/mp4;base64,abc' }; } },
    publishJob: { findFirst: async () => active ? { id: 'scheduled' } : null },
  };
  const route = load('app/api/video/select/route.ts', { 'next/server': response, '@/lib/auth/context': { tenantContext: async () => ({isSuperAdmin:true, organizationId: 'own', role: 'owner' }) }, '@/lib/prisma': { prisma: { $transaction: async fn => fn(tx) } } });
  const req = { json: async () => ({ contentItemId: 'post', assetId: 'clip' }) };
  assert.equal((await route.POST(req)).status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(selected)), { mediaUrl: '/api/video/media/clip', status: 'draft' });
  selected = null; active = true;
  assert.equal((await route.POST(req)).status, 409); assert.equal(selected, null);
  tx.mediaAsset.findFirst = async () => null;
  assert.equal((await route.POST(req)).status, 404);
});
test('Facebook videos keep their tenant boundary and reuse a confirmed upload', async () => {
  let state, calls = 0;
  const prisma = { mediaAsset: { findFirst: async q => { assert.equal(q.where.organizationId, 'own'); assert.equal(q.where.contentItemId, 'post'); return { id: 'clip', url: 'data:video/mp4;base64,abc' }; } }, job: { findFirst: async () => state, create: async q => { state = q.data; }, update: async q => { state = { ...state, ...q.data }; } } };
  const mod = load('lib/publishing/facebook-video.ts', { '@/lib/prisma': { prisma }, '@/lib/video/media': { videoBytes: async () => ({ bytes: Buffer.from('clip'), contentType: 'video/mp4' }) }, __fetch: async (url, init) => { if(String(url).includes('graph.facebook.com'))return new Response(JSON.stringify({status:{video_status:'ready'}})); calls++; assert.match(url, /graph-video.facebook.com/); assert.equal(init.body.get('description'), 'Caption'); assert.equal(init.body.get('source').type, 'video/mp4'); return new Response(JSON.stringify({ id: '123' }), { status: 200 }); } });
  const args = { pageId: 'page', pageAccessToken: 'test', caption: 'Caption', assetId: 'clip', organizationId: 'own', contentItemId: 'post', publishJobId: 'publish' };
  assert.equal((await mod.publishFacebookVideo(args)).externalId, '123');
  assert.equal((await mod.publishFacebookVideo(args)).externalId, '123'); assert.equal(calls, 1);
  prisma.mediaAsset.findFirst = async () => null;
  assert.equal((await mod.publishFacebookVideo(args)).ok, false); assert.equal(calls, 1);
});
test('interrupted Facebook video upload is never automatically submitted again', async () => {
  let state, calls = 0;
  const prisma = { mediaAsset: { findFirst: async () => ({ id: 'clip', url: 'data:video/mp4;base64,abc' }) }, job: { findFirst: async () => state, create: async q => { state = q.data; } } };
  const mod = load('lib/publishing/facebook-video.ts', { '@/lib/prisma': { prisma }, '@/lib/video/media': { videoBytes: async () => ({ bytes: Buffer.from('clip'), contentType: 'video/mp4' }) }, __fetch: async () => { calls++; throw new Error('connection interrupted'); } });
  const args = { pageId: 'page', pageAccessToken: 'test', caption: '', assetId: 'clip', organizationId: 'own', contentItemId: 'post', publishJobId: 'publish' };
  assert.equal((await mod.publishFacebookVideo(args)).retryable, false);
  assert.equal((await mod.publishFacebookVideo(args)).retryable, false); assert.equal(calls, 1);
});
test('video URL routing cannot treat an external host as our private campaign clip', () => {
  const mod = load('lib/publishing/facebook-video.ts', { '@/lib/prisma': { prisma: {} }, '@/lib/video/media': {} });
  assert.equal(mod.campaignVideoId('/api/video/media/clip'), 'clip');
  assert.equal(mod.campaignVideoId('https://other.example/api/video/media/clip'), null);
});

test('scheduled video uses the selected clip and is claimed once before publishing', async () => {
  let calls = 0, claimed = true, updated, itemStatus = "scheduled";
  const job = { id: 'publish', organizationId: 'own', contentItemId: 'post', socialConnectionId: 'connection', platform: 'facebook', status: 'scheduled', attempts: 0 };
  const prisma = {
    publishJob: { findFirst: async () => job, updateMany: async () => ({ count: claimed ? 1 : 0 }), update: async q => { updated = q.data; } },
    socialConnection: { findUnique: async () => ({ organizationId: 'own', encryptedToken: 'test', externalId: 'page' }) },
    contentItem: { findUnique: async () => ({ id: 'post', status: itemStatus, caption: 'Caption', mediaUrl: '/api/video/media/clip' }), update: async () => ({}) },
    publishAttempt: { create: async () => ({}) },
  };
  const mod = load('lib/publishing/process-due-job.ts', { '@/lib/prisma': { prisma }, '@/lib/publishing/providers': { publishToProvider: async args => { calls++; assert.equal(args.mediaUrl, '/api/video/media/clip'); assert.equal(args.organizationId, 'own'); assert.equal(args.publishJobId, 'publish'); return { ok: true, externalId: 'fb-video' }; } } });
  assert.equal((await mod.processDuePublishJob()).status, 'published'); assert.equal(updated.externalPostId, 'fb-video');
  itemStatus = 'published'; // The first destination succeeded; the second must still publish.
  assert.equal((await mod.processDuePublishJob()).status, 'published'); assert.equal(calls, 2);
  itemStatus = 'draft';
  assert.equal((await mod.processDuePublishJob()).status, 'failed'); assert.equal(calls, 2);
  claimed = false;
  assert.equal((await mod.processDuePublishJob()).status, 'idle'); assert.equal(calls, 2);
});

test('posting status returns confirmed per-account delivery and rejects foreign posts', async () => {
  let accessible=true, reads=0;
  const prisma={contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'own');return accessible?{id:'post'}:null;}},publishJob:{findMany:async q=>{reads++;assert.equal(q.where.organizationId,'own');assert.equal(q.where.contentItemId,'post');return [{id:'fb',socialConnectionId:'connection',platform:'facebook',status:'published',publishedAt:'2026-10-19T13:00:00Z'},{id:'ig',socialConnectionId:'connection',platform:'instagram',status:'failed',lastError:'Upload rejected'}];}},socialConnection:{findMany:async q=>{assert.equal(q.where.organizationId,'own');return [{id:'connection',accountName:'Rumi Guitars'}];}}};
  const api=load('app/api/publishing/status/route.ts',{'@/lib/prisma':{prisma},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'own'})},'@/lib/http/errors':{apiError:e=>{throw e;}},'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200,headers:options.headers})}}});
  const result=await api.GET(new Request('https://app.test/api/publishing/status?contentItemId=post'));
  assert.equal(result.body.jobs[0].status,'published');assert.equal(result.body.jobs[1].status,'failed');assert.equal(result.body.jobs[0].socialConnection.accountName,'Rumi Guitars');assert.equal(result.headers['Cache-Control'],'private, no-store');
  accessible=false;assert.equal((await api.GET(new Request('https://app.test/api/publishing/status?contentItemId=foreign'))).status,404);assert.equal(reads,1);
  assert.equal((await api.GET(new Request('https://app.test/api/publishing/status'))).status,400);
});


test('Facebook processing and encoding failure never count as a playable video or upload twice',async()=>{
 let state, uploads=0, remote='processing';
 const prisma={mediaAsset:{findFirst:async()=>({id:'clip',url:'/video'})},job:{findFirst:async()=>state,create:async q=>{state=q.data;},update:async q=>{state={...state,...q.data};}}};
 const mod=load('lib/publishing/facebook-video.ts',{'@/lib/prisma':{prisma},'@/lib/video/media':{videoBytes:async()=>({bytes:Buffer.from('clip'),contentType:'video/mp4'})},__fetch:async(url,init)=>{
   if(String(url).includes('graph-video.facebook.com')){uploads++;return new Response(JSON.stringify({id:'123'}));}
   assert.equal(init.headers.Authorization,'Bearer test');assert.equal(new URL(url).searchParams.get('fields'),'status');
   if(remote==='network')throw new Error('offline');
   return new Response(JSON.stringify({status:{video_status:remote}}));
 }});
 const args={pageId:'page',pageAccessToken:'test',caption:'Caption',assetId:'clip',organizationId:'own',contentItemId:'post',publishJobId:'publish'};
 let result=await mod.publishFacebookVideo(args);assert.equal(result.ok,false);assert.equal(result.pending,true);assert.equal(result.externalId,'123');
 remote='network';result=await mod.publishFacebookVideo(args);assert.equal(result.ok,false);assert.equal(result.pending,true);
 remote='error';result=await mod.publishFacebookVideo(args);assert.equal(result.ok,false);assert.equal(result.retryable,false);assert.match(result.error,/could not process/);
 remote='ready';assert.equal((await mod.publishFacebookVideo(args)).ok,true);assert.equal(uploads,1);
 state.createdAt=new Date(Date.now()-25*60*60*1000);remote='processing';assert.equal((await mod.publishFacebookVideo(args)).retryable,false);assert.equal(uploads,1);
});

test('worker defers a Facebook processing check without spending upload attempts',async()=>{
 let saved;
 const prisma={publishJob:{findFirst:async()=>({id:'job',organizationId:'own',socialConnectionId:'connection',contentItemId:'post',platform:'facebook',status:'retry',attempts:1}),updateMany:async()=>({count:1}),update:async q=>{saved=q.data;}},socialConnection:{findUnique:async()=>({organizationId:'own'})},contentItem:{findUnique:async()=>({id:'post',status:'scheduled',mediaUrl:'/api/video/media/clip'})},publishAttempt:{create:async()=>({})}};
 const mod=load('lib/publishing/process-due-job.ts',{'@/lib/prisma':{prisma},'@/lib/publishing/providers':{publishToProvider:async()=>({ok:false,pending:true,externalId:'123',error:'Processing'})}});
 assert.equal((await mod.processDuePublishJob()).status,'processing');assert.equal(saved.attempts,1);assert.equal(saved.externalPostId,'123');assert.equal(saved.status,'retry');assert.ok(saved.scheduledFor.getTime()>Date.now()+240000);
});


test('existing Facebook upload is rechecked read-only instead of blindly reported posted',async()=>{
 let remote={ok:false,pending:false,error:'Facebook could not process this video.'}, checks=0;
 const api=load('app/api/publishing/status/route.ts',{'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'own'})},'@/lib/http/errors':{apiError:e=>{throw e;}},'@/lib/security/crypto':{decryptSecret:()=>JSON.stringify({pageAccessToken:'secret'})},'@/lib/publishing/facebook-video':{campaignVideoId:()=> 'clip'},'@/lib/publishing/facebook-video-status':{facebookVideoStatus:async(id,token)=>{checks++;assert.equal(id,'123');assert.equal(token,'secret');return remote;}},'@/lib/prisma':{prisma:{contentItem:{findFirst:async()=>({id:'post',mediaUrl:'/api/video/media/clip'})},publishJob:{findMany:async()=>[{id:'job',platform:'facebook',externalPostId:'123',socialConnectionId:'connection',status:'published'}]},socialConnection:{findMany:async()=>[{id:'connection',accountName:'Master Mind',encryptedToken:'encrypted'}]}}}});
 const req=new Request('https://app.test/api/publishing/status?contentItemId=post');
 let result=await api.GET(req);assert.equal(result.body.jobs[0].status,'failed');assert.equal(JSON.stringify(result.body).includes('secret'),false);
 remote={ok:false,pending:true};result=await api.GET(req);assert.equal(result.body.jobs[0].status,'processing');
 remote={ok:true};result=await api.GET(req);assert.equal(result.body.jobs[0].status,'published');assert.equal(checks,3);
});

test('Facebook rejects an audio-only saved MP4 before claiming or submitting an upload',async()=>{
 let creates=0,uploads=0;
 const api=load('lib/publishing/facebook-video.ts',{
  '@/lib/prisma':{prisma:{mediaAsset:{findFirst:async()=>({id:'clip',url:'/api/video/media/clip'})},job:{findFirst:async()=>null,create:async()=>{creates++;}}}},
  '@/lib/video/media':{videoBytes:async()=>{throw Error('This MP4 contains audio only, with no video track.');}},
  __fetch:async()=>{uploads++;throw Error('must not upload');},
 });
 const result=await api.publishFacebookVideo({pageId:'page',pageAccessToken:'token',caption:'Caption',assetId:'clip',organizationId:'own',contentItemId:'post',publishJobId:'job'});
 assert.equal(result.ok,false);assert.equal(result.retryable,false);assert.match(result.error,/audio only|saved video could not be verified/);assert.equal(creates,0);assert.equal(uploads,0);
});


test('seven-day service images carry seven distinct fictional casting directions into final image prompts',()=>{
 const businessContext={businessType:'service',description:'Self-hypnosis education and stress management'};const history=[],slots=[];
 for(let i=0;i<7;i++){
  const concept=plan.buildVisualConcept({businessContext,variationIndex:i,recentConcepts:history});
  const prompt=director.buildVisualDirection({brand:{name:'Master Mind'},businessContext,visualConcept:concept,recentConcepts:history,visualDirection:'A woman relaxing on a sofa.'});
  assert.match(prompt,new RegExp('campaign casting slot '+(i+1)));assert.ok(prompt.includes(plan.campaignCasting[i]));assert.match(prompt,/Do not reuse the same model/);assert.match(prompt,/specific recurring spokesperson/);slots.push(concept.direction.split('PEOPLE VARIETY')[1]);history.push(concept);
 }
 assert.equal(new Set(slots).size,7);assert.equal(plan.campaignCasting.length,7);
});
test('casting is deterministic for retries and does not force people into object compositions',()=>{
 assert.equal(plan.campaignCastingDirection(3),plan.campaignCastingDirection(3));assert.match(plan.campaignCastingDirection(0),/do not add a person/);assert.match(plan.campaignCastingDirection(0),/preserve that identity instead/);assert.match(plan.campaignCastingDirection(0),/not evidence/);
});

test('bounded brand history preserves distinct saved casting before long original directions',async()=>{
 const saved=Array.from({length:13},(_,i)=>({payload:{visualConcept:plan.buildVisualConcept({businessContext:{businessType:'service'},variationIndex:i}),originalDirection:'Original '.repeat(150)}}));
 const history=load('lib/ai/visual-history.ts',{'@/lib/prisma':{prisma:{campaign:{findMany:async q=>{assert.equal(q.where.brand.organizationId,'own');return[{id:'campaign'}];}},job:{findMany:async q=>{assert.equal(q.take,12);assert.equal(q.where.organizationId,'own');return saved.slice(-12).reverse();}}}}});
 const recent=await history.recentBrandConcepts('own','brand');assert.equal(recent.length,12);
 recent.forEach((item,i)=>{assert.match(item.direction,new RegExp('campaign casting slot '+((i+1)%7+1)));assert.ok(item.direction.length<=600);});
});

test('seven concurrent post regenerations retain planned casting beyond twelve prior images and tenant scopes',async()=>{
 const prompts=[];const history=load('lib/ai/visual-history.ts',{'@/lib/prisma':{prisma:{}}});
 const concepts=Array.from({length:7},(_,i)=>plan.buildVisualConcept({businessContext:{businessType:'service'},variationIndex:i}));
 let legacyMode=false; const postIds=Array.from({length:7},(_,i)=>'legacy-'+(i*7));
 const prisma={publishJob:{findFirst:async()=>null},contentItem:{findMany:async q=>{assert.equal(q.where.campaign.brand.organizationId,'own');assert.equal(q.where.campaignId,'campaign');assert.equal(q.orderBy[0].createdAt,'asc');assert.equal(q.orderBy[1].id,'asc');return postIds.map(id=>({id}));},findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'own');return{id:q.where.id,type:'post',headline:'Stress management',campaign:{goal:'Education',brand:{id:'brand',name:'Master Mind',description:'Self-hypnosis education'}}};}},onboardingState:{findUnique:async()=>({businessType:'service'})},job:{findFirst:async q=>{assert.equal(q.where.organizationId,'own');const id=q.where.payload.equals;if(legacyMode)return{payload:{visualConcept:{subjectCategory:'human'}}};return{payload:{visualConcept:concepts[Number(id.slice(-1))]}};},create:async()=>({})}};
 const api=load('app/api/creative/generate-image/route.ts',{'next/server':response,'@/lib/prisma':{prisma},'@/lib/auth/context':{tenantContext:async()=>({isSuperAdmin:true,organizationId:'own',role:'admin'})},'@/lib/ai/visual-history':{...history,recentBrandConcepts:async()=>Array.from({length:12},()=>({subjectCategory:'human',direction:'Previous scene'}))},'@/lib/ai/image-provider':{generateImage:async input=>{prompts.push(input);return{base64:'test',provider:'mock',model:'mock'};},ImagePendingError:class extends Error{}},'@/lib/ai/reviewed-photo':{selectReviewedPhoto:async()=>({asset:{id:'asset',url:'saved'},selected:true,review:{status:'passed'}})}});
 const results=await Promise.all(concepts.map((_,i)=>api.POST(new Request('https://app.test/api/creative/generate-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:'00000000-0000-4000-8000-00000000000'+i,campaignId:'campaign',contentItemId:'post'+i,prompt:'Create a useful scene',format:'portrait'})}))));
 assert.ok(results.every(result=>result.status===200));assert.equal(prompts.length,7);
 prompts.forEach((input,i)=>{assert.match(input.prompt,new RegExp('campaign casting slot '+(i+1)));assert.match(input.requestId,new RegExp('manual:post'+i+':'));assert.equal(input.requestDescription,'Create a useful scene');});
 assert.equal(new Set(prompts.map(input=>input.prompt.match(/campaign casting slot (\d+)/)[1])).size,7);
 legacyMode=true;prompts.length=0;
 await Promise.all(postIds.map((id,i)=>api.POST(new Request('https://app.test/api/creative/generate-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:'00000000-0000-4000-8000-00000000000'+i,campaignId:'campaign',contentItemId:id,prompt:'Create a useful scene',format:'portrait'})}))));
 assert.equal(prompts.length,7);assert.equal(new Set(prompts.map(input=>input.prompt.match(/campaign casting slot (\d+)/)[1])).size,7);
 assert.equal(history.regenerationVariationIndex('post',{subjectCategory:'human'},-1),history.regenerationVariationIndex('post'));
 const legacy=Array.from({length:7},(_,i)=>history.regenerationVariationIndex('post'+i));assert.equal(new Set(legacy.map(index=>index%7)).size,7);assert.equal(history.regenerationVariationIndex('post0'),history.regenerationVariationIndex('post0'));
});

test('successive image slots change composition and preserve their assigned typography position',()=>{
 const compositions=[];
 for(let i=0;i<8;i++){
  const textPosition=['top','left','right'][i%3];
  const prompt=director.buildVisualDirection({brand:{name:'Client'},variationIndex:i,textPosition,businessContext:{businessType:'service'}});
  compositions.push(prompt.match(/COMPOSITION\nUse ([^\n]+)/)[1]);
  assert.ok(prompt.includes(`typography space at the ${textPosition}`));
 }
 assert.equal(new Set(compositions).size,8,'A campaign must not repeat one composition for its first eight images');
});

test('history preserves actual actions and settings alongside casting, even with long boilerplate',async()=>{
 const concept=plan.buildVisualConcept({businessContext:{businessType:'service'},variationIndex:4});
 const originalDirection='Two adults compare notes while standing beside a community notice board outdoors. '+ 'Extra scene details. '.repeat(100);
 const history=load('lib/ai/visual-history.ts',{'@/lib/prisma':{prisma:{campaign:{findMany:async()=>[{id:'campaign'}]},job:{findMany:async()=>[{payload:{visualConcept:concept,originalDirection}}]}}}});
 const recent=await history.recentBrandConcepts('org','brand');
 assert.match(recent[0].direction,/compare notes/);assert.match(recent[0].direction,/notice board outdoors/);
 assert.match(recent[0].direction,/campaign casting slot 5/);assert.ok(recent[0].direction.length<=600);
 const prompt=director.buildVisualDirection({brand:{name:'Client'},recentConcepts:recent});
 assert.match(prompt,/compare notes/);assert.match(prompt,/notice board outdoors/);
});

test('regeneration retains full scene sequence beyond seven casting slots',()=>{
 const history=load('lib/ai/visual-history.ts',{'@/lib/prisma':{prisma:{}}});
 const concept=plan.buildVisualConcept({businessContext:{businessType:'service'},variationIndex:19});
 assert.equal(history.regenerationVariationIndex('post',concept,0),19);
 const legacy={subjectCategory:'human',direction:plan.campaignCastingDirection(19)};
 assert.equal(history.regenerationVariationIndex('post',legacy,19),19);
});

test('campaign writing advances visual history for every requested slot, including multiple drafts on one day',async()=>{
 let prompt;const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='mock-only';
 const api=load('lib/ai/campaign.ts',{openai:class {responses={create:async input=>{prompt=input.input;return{output_text:'{"posts":[]}'}}}}});
 const contentPlan=Array.from({length:14},(_,i)=>({planKey:'slot-'+i,day:Math.floor(i/2)+1,type:'post',extra:false}));
 try{await api.generateCampaign({brand:{name:'Client'},brief:'A useful campaign for the client',goal:'education',days:7,businessContext:{businessType:'service'},contentPlan,recentConcepts:[{subjectCategory:'human'},{subjectCategory:'lifestyle'}]});}
 finally{if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
 const categories=Array.from(prompt.matchAll(/^Slot slot-\d+, Day \d+: (\w+) —/gm),match=>match[1]);
 assert.equal(categories.length,14);assert.ok(categories.every((category,i)=>i===0||category!==categories[i-1]));
 assert.equal(new Set(categories).size,5);assert.match(prompt,/primary subject, observable action, specific setting, and camera distance/);
});
