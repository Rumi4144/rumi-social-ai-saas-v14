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
const {automaticReelPlan,automaticReelStyle} = load('lib/reels/auto-plan.ts');
const {reelDuration} = load('lib/reels/timeline.ts');
const brand={id:'mind-brand',name:'Master Mind Advanced Hypnosis',color:'#123456',accent:'#abcdef',website:'https://mind.example'};
const post={id:'post',type:'reel_post',headline:'Notice your breathing',caption:'Pause and notice your breathing. Stay curious. Find a quiet place.'};
const asset=(id,prompt,extra={})=>({id,organizationId:'mind',brandId:brand.id,campaignId:'past',kind:'ai_image',status:'ready',url:`https://photos.example/${id}.png`,prompt,...extra});
const plan=(assets,other={})=>automaticReelPlan({organizationId:'mind',campaignId:'current',brand,post,assets,...other});
test('semantic photo selection uses relevant past images and never another tenant or brand',()=>{
 const result=plan([asset('unrelated','A close photo of a guitar and steel strings'),asset('breath','A breathing exercise beside a window'),asset('curious','Curious reflective expression'),asset('quiet','A quiet place near trees'),asset('rumi','Notice your breathing',{brandId:'guitar-brand'}),asset('foreign','Notice your breathing',{organizationId:'rumi'})]);
 assert.equal(result.sources[0].id,'breath');assert.ok(result.sources.every(s=>!['rumi','foreign','unrelated'].includes(s.id)));
 assert.ok(result.sources.every(s=>s.libraryBrandId===brand.id));assert.ok(reelDuration(result.project)>=15 && reelDuration(result.project)<=30);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),JSON.parse(JSON.stringify(plan([asset('unrelated','A close photo of a guitar and steel strings'),asset('breath','A breathing exercise beside a window'),asset('curious','Curious reflective expression'),asset('quiet','A quiet place near trees'),asset('rumi','Notice your breathing',{brandId:'guitar-brand'}),asset('foreign','Notice your breathing',{organizationId:'rumi'})]))));
});
test('authoritative occasion excludes generic and wrong-holiday media even if owned',()=>{
 const holiday={...post,type:'holiday_post',headline:'Seasonal gratitude',caption:'A moment of peace',occasion:'Thanksgiving'};
 const result=plan([asset('owned','A calm desk and coffee',{contentItemId:'post'}),asset('christmas','Christmas table',{post:{...holiday,id:'other',occasion:'Christmas Day'}}),asset('thanks','Autumn harvest table',{post:{...holiday,id:'past',occasion:'Thanksgiving'}})],{post:holiday});
 assert.deepEqual(Array.from(result.sources,s=>s.id),['thanks']);assert.match(result.project.scenes[0].direction,/Thanksgiving/);
 const missing=plan([asset('owned','Christmas tree',{contentItemId:'post'})],{post:{...holiday,occasion:undefined}});assert.equal(missing.project.scenes.length,0);assert.match(missing.warnings.join(' '),/holiday slot/);
});
test('duplicate photo variants never pad scenes; missing media and gaps stay explicit',()=>{
 const result=plan([asset('a','Notice breathing',{url:'https://photos.example/same.png?w=500'}),asset('b','Notice breathing',{url:'https://photos.example/same.png?w=900'})]);
 assert.equal(result.project.scenes.length,1);assert.equal(reelDuration(result.project),15);assert.match(result.warnings.join(' '),/no image was repeated/);
 assert.equal(plan([]).project.scenes.length,0);assert.match(plan([]).warnings.join(' '),/before exporting/);
 assert.equal(plan([asset('pending','Breathing',{status:'queued'}),asset('video','Breathing',{kind:'campaign_video'})]).sources.length,0);
});
test('saved four-scene plan retains concise text, shot assignment, and timing',()=>{
 const visualDirection='Scene 1, 0–3 seconds: restless hands; text, "Notice your hands." Scene 2, 3–7 seconds: feet on floor; text, "Feel the floor." Scene 3, 7–11 seconds: breathing outdoors; text, "Notice your breath." Scene 4, 11–15 seconds: quiet window; text, "Stay curious." End card: "Explore more"';
 const result=plan([asset('hands','restless hands',{contentItemId:'post',metadata:{sceneId:'post-planned-1'}}),asset('feet','feet on floor'),asset('breath','breathing outdoors'),asset('window','quiet window')],{post:{...post,visualDirection}});
 assert.equal(result.project.scenes.length,4);assert.deepEqual(Array.from(result.project.scenes,s=>s.seconds),[3,4,4,4]);assert.equal(reelDuration(result.project),15);assert.equal(result.project.closingSeconds,0);assert.equal(result.project.scenes[0].headline,'Notice your hands.');assert.ok(result.project.scenes.every(s=>s.detail===''));assert.equal(result.sources[1].id,'feet');
});
test('readable captions omit medical guarantees or invented testimonials without modifying source post',()=>{
 const risky={...post,headline:'Guaranteed cure for anxiety',caption:'Our clients said they were cured. Learn about breathing.'};
 const before=JSON.stringify(risky);const result=plan([asset('a','breathing',{contentItemId:'post'})],{post:risky});
 assert.ok(result.project.scenes.every(s=>!/(cure|guarantee|clients said)/i.test(s.headline)));assert.equal(JSON.stringify(risky),before);assert.match(result.warnings.join(' '),/claims or testimonials/);
});
const json=(body,options={})=>({body,status:options.status||200});
function route(prisma,ctx={organizationId:'mind'}) {return load('app/api/reels/auto-plan/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>ctx},'@/lib/prisma':{prisma}});}
const request=(extra={})=>new Request('https://app.test/api/reels/auto-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({organizationId:'mind',campaignId:'current',contentItemId:'post',...extra})});
test('stale organization and invalid requests stop before reading posts or media',async()=>{
 const api=route({contentItem:{findFirst:()=>{throw Error('must not query')}}});
 assert.equal((await api.POST(request({organizationId:'rumi'}))).status,409);
 assert.equal((await api.POST(request({contentItemId:''}))).status,400);
 assert.equal((await api.POST(new Request('https://app.test',{method:'POST',body:'oops'}))).status,400);
});
test('post ownership and campaign membership are validated before media access',async()=>{
 let query;const api=route({contentItem:{findFirst:async q=>{query=q;return null}},mediaAsset:{findMany:()=>{throw Error('must not query')}}});
 assert.equal((await api.POST(request())).status,404);assert.equal(query.where.id,'post');assert.equal(query.where.campaignId,'current');assert.equal(query.where.campaign.brand.organizationId,'mind');
});
test('API gathers only same-brand ready photos and leaves original posts untouched',async()=>{
 let mediaQuery,jobQuery;const item={...post,campaignId:'current',campaign:{id:'current',title:'Calm moments',brand:{id:brand.id,name:brand.name}}};
 const api=route({$queryRaw:async q=>{assert.ok(q.values.includes('mind'));assert.ok(q.values.includes('breath'));assert.match(q.sql,/md5/);return [{id:'breath',url:'saved-photo:fingerprint'}]},contentItem:{findFirst:async()=>item,findMany:async()=>[item]},campaign:{findMany:async q=>{assert.equal(q.where.brandId,brand.id);assert.equal(q.where.brand.organizationId,'mind');return [{id:'current'},{id:'past'}]}},mediaAsset:{findMany:async q=>{mediaQuery=q;return [asset('breath','Notice breathing',{contentItemId:'post'})]}},job:{findMany:async q=>{jobQuery=q;return []}}});
 const result=await api.POST(request());assert.equal(result.status,200);assert.equal(mediaQuery.where.organizationId,'mind');assert.deepEqual(Array.from(mediaQuery.where.campaignId.in),['current','past']);assert.equal(mediaQuery.where.status,'ready');assert.equal(mediaQuery.select.url,undefined);assert.equal(jobQuery.where.organizationId,'mind');assert.equal(result.body.post.caption,post.caption);assert.equal(result.body.brand.id,brand.id);assert.equal(result.body.sources[0].id,'breath');
});

test('Rumi product drafts keep whole guitar photos visible and do not reuse hypnosis images',()=>{
 const guitarBrand={...brand,id:'guitar-brand',name:'Rumi Guitars'};const guitarPost={...post,id:'guitar-post',headline:'Explore our classical guitars',caption:'Discover the wood grain and craftsmanship.'};
 const result=plan([asset('mind','Classical guitars'),asset('guitar','Classical guitar wood grain',{brandId:guitarBrand.id})],{brand:guitarBrand,post:guitarPost});
 assert.equal(result.project.style,'showcase');assert.equal(result.sources[0].id,'guitar');assert.ok(result.sources.every(s=>s.libraryBrandId===guitarBrand.id));
});

test('draft failures identify the failed step without exposing database details',async()=>{
 const api=route({contentItem:{findFirst:async()=>{throw Object.assign(new Error('private database connection details'),{code:'P2022'});}}});
 const result=await api.POST(request());
 assert.equal(result.status,500);
 assert.match(result.body.error,/loading the selected post/);
 assert.match(result.body.error,/P2022/);
 assert.doesNotMatch(result.body.error,/private database/);
});

 test('separate photo caption and history failures retain a specific safe message',async()=>{
 const item={...post,campaignId:'current',campaign:{id:'current',title:'Calm moments',brand:{id:brand.id,name:brand.name}}};
 for(const [model,label] of [['mediaAsset','loading saved photo details'],['contentItem','loading saved captions'],['job','loading saved campaign history']]) {
 const db={contentItem:{findFirst:async()=>item,findMany:async()=>[]},campaign:{findMany:async()=>[{id:'current'}]},mediaAsset:{findMany:async()=>[]},job:{findMany:async()=>[]}};
 db[model].findMany=async()=>{throw new Error('private connection details')};
 const result=await route(db).POST(request());
 assert.equal(result.status,500);assert.ok(result.body.error.includes(label));assert.doesNotMatch(result.body.error,/private connection/);
 }
 });

test('stress reels exclude smoking and weight-loss photos despite shared stress and hypnosis wording',()=>{
 const stress={...post,headline:'Managing daily stress',caption:'Discover support for stress. Take the first step with Master Mind Advanced Hypnosis. Pause and breathe.'};
 const result=plan([
  asset('smoking','A stressed adult holding a cigarette',{post:{...post,headline:'Quit smoking',caption:'Take the first step. Stress support with hypnosis.'}}),
  asset('weight','An adult standing on bathroom scales',{post:{...post,headline:'Weight loss support',caption:'Discover support for stress and healthier habits.'}}),
  asset('generic','Professional hypnosis session and personal journey',{post:{...post,headline:'Book a consultation',caption:'Take the first step with Master Mind Advanced Hypnosis.'}}),
  asset('stress','An overwhelmed adult taking a quiet break to manage daily stress'),
 ],{post:stress});
 assert.deepEqual(Array.from(result.sources,s=>s.id),['stress']);
});
test('a wrongly attached smoking photo cannot override a stress scene plan',()=>{
 const stress={...post,headline:'Reduce stress',caption:'Take a quiet breathing break.'};
 const result=plan([asset('wrong','A cigarette beside a stressed adult',{contentItemId:'post',kind:'reel_scene_image',metadata:{sceneId:'post-planned-1'}}),asset('wrong-primary','Bathroom scales for weight loss',{contentItemId:'post'})],{post:stress});
 assert.equal(result.sources.length,0);assert.match(result.warnings.join(' '),/relevant ready photos/);
});
test('smoking and weight-loss reels can still use their own relevant photos',()=>{
 for(const [headline,prompt] of [['Quit smoking','Discarded cigarettes and tobacco'],['Weight loss support','Weight management with a bathroom scale']]) {
  const result=plan([asset('topic',prompt,{contentItemId:'post'})],{post:{...post,headline,caption:headline}});
  assert.equal(result.sources[0].id,'topic');
 }
});

test('brand appearance overrides industry defaults and new businesses receive fitting layouts',()=>{
 assert.equal(automaticReelStyle({...brand,name:'A new retailer',industry:'Retail'}),'showcase');
 assert.equal(automaticReelStyle({...brand,name:'Neighborhood Bakery',industry:'Restaurant'}),'bold');
 assert.equal(automaticReelStyle({...brand,name:'Wellness Studio',industry:'Wellness'}),'boutique');
 assert.equal(automaticReelStyle({...brand,name:'A new retailer',industry:'Retail',designStyle:'Luxury Editorial'}),'boutique');
 assert.equal(automaticReelStyle({...brand,designStyle:'Bold and vibrant'}),'bold');
 assert.equal(automaticReelStyle({...brand,designStyle:'Clean minimal'}),'minimal');
});

test('cinematic showcase preference works for any business without replacing explicit alternatives',()=>{
 for(const name of ['Rumi Guitars','Master Mind','Neighborhood Cafe'])assert.equal(automaticReelStyle({...brand,name,designStyle:'Cinematic Showcase'}),'showcase');
});
