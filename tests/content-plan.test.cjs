const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps={}) {
 const module={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,require:n=>n in deps?deps[n]:n === "@/lib/campaign/setup-photos" ? load("lib/campaign/setup-photos.ts") : require(n),Date,Intl,Map,Set,process});
 return module.exports;
}
const plan=load('lib/campaign/content-plan.ts');
const mix=['post','reel_post','presenter_post'];
const calendar=(days,start='2026-11-01')=>Array.from({length:days},(_,i)=>({day:i+1,date:plan.campaignDate(start,i+1).toISOString().slice(0,10),platforms:['facebook'],contentType:plan.contentTypeForDay(i+1,mix)}));
test('campaign summary distinguishes seven dates from fifteen drafts and shows missing formats honestly',()=>{
 const summary=load('lib/campaign/summary.ts',{'./content-plan':plan});
 const rows=calendar(7),items=Array.from({length:15},(_,i)=>({type:i===14?'holiday_post':i<4?'reel_post':'post',scheduledFor:new Date(rows[i%7].date+'T12:00:00Z')}));
 const result=summary.campaignSummary({days:7,dailyPlan:rows},items);
 assert.equal(result.days,7);assert.equal(result.total,15);assert.equal(result.start,'2026-11-01');assert.equal(result.end,'2026-11-07');assert.equal(result.extras,1);assert.equal(result.formats.find(f=>f.label==='Reel').count,4);
 assert.equal(summary.campaignSummary({days:15},items.filter(i=>i.type==='post')).formats.find(f=>f.label==='Reel').count,0);
});
test('October federal holiday is suggested on its actual date',()=>{
 assert.equal(plan.specialDayForDate(new Date('2026-10-12T12:00:00Z')),'Columbus Day');
 assert.equal(plan.specialDayForDate(new Date('2027-10-11T12:00:00Z')),'Columbus Day');
});
test('topics rotate through regular drafts and never replace special occasions',()=>{
 const slots=plan.buildContentPlan(calendar(7),7,[{date:'2026-11-04',label:'Kindness event'}]);
 const result=plan.applyCampaignTopics(slots,['Relaxation','Confidence','Habits']);
 assert.equal(result[0].topics[0],'Relaxation');assert.equal(result[1].topics[0],'Confidence');assert.equal(result[3].topics[0],'Relaxation');assert.equal(result.at(-1).topics,undefined);
 const one=plan.applyCampaignTopics(slots.slice(0,1),['Relaxation','Confidence']);assert.equal(one[0].topics.length,1);assert.equal(one[0].topics[0],'Relaxation');
 assert.throws(()=>plan.applyCampaignTopics(slots,['Confidence','confidence']));
});
test('AI instructions preserve exact requested slots without extra platform entries or bonus Stories',async()=>{
 let request;
 const ai=load('lib/ai/campaign.ts',{
  openai:{default:class {responses={create:async value=>{request=value;return {output_text:'{"posts":[]}'}}}}},
  './visual-plan':{buildVisualConcept:()=>({subjectCategory:'human',direction:'Relevant workspace scene'})},
 });
 const rows=calendar(7),slots=plan.buildQuantityContentPlan(rows,7,{post:0,reel_post:7,story_post:7,presenter_post:0});
 const previous=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='mock-only';
 try {await ai.generateCampaign({brief:'A week of mindful change',goal:'education',days:7,brand:{name:'Master Mind Advanced Hypnosis'},dailyPlan:rows,contentPlan:slots});}
 finally {if(previous===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=previous;}
 assert.match(request.input,/Return exactly 14 objects in posts/);
 assert.match(request.input,/return an empty auxiliary stories array/);
 assert.match(request.input,/Do not create extra platform-specific entries or change the requested quantities/);
 assert.doesNotMatch(request.input,/Write each platform post natively/);
 assert.doesNotMatch(request.input,/Rumi Guitars/);
});
test('typed quantities preserve exact counts, zero exclusions, same-day drafts, and holiday extras',()=>{
 const quantities={post:2,reel_post:4,story_post:7,presenter_post:1};
 const slots=plan.buildQuantityContentPlan(calendar(7),7,quantities,[{date:'2026-11-04',label:'Custom event'}]);
 assert.equal(slots.length,15);
 for(const [type,count] of Object.entries(quantities)) assert.equal(slots.filter(s=>s.type===type).length,count);
 assert.equal(new Set(slots.filter(s=>s.type==='story_post').map(s=>s.day)).size,7);
 assert.equal(new Set(slots.map(s=>s.planKey)).size,15);
 const reels=plan.buildQuantityContentPlan(calendar(7),7,{post:0,reel_post:7,story_post:0,presenter_post:0});
 assert.equal(reels.length,7);assert.ok(reels.every(s=>s.type==='reel_post'));
 assert.equal(new Set(reels.map(s=>s.day)).size,7);
 assert.throws(()=>plan.buildQuantityContentPlan(calendar(7),7,{post:0,reel_post:0,story_post:0,presenter_post:0}));
 assert.throws(()=>plan.buildQuantityContentPlan(calendar(7),7,{post:30,reel_post:30,story_post:1,presenter_post:0}));
 assert.throws(()=>plan.buildQuantityContentPlan(calendar(7),7,{post:1.5,reel_post:0,story_post:0,presenter_post:0}));
});
for(const days of [7,15,30]) test(`${days} days preserves mixed daily slots and adds occasions separately`,()=>{
 const rows=calendar(days),extras=[{date:rows[3].date,label:'My special day'}];
 const slots=plan.buildContentPlan(rows,days,extras);
 assert.equal(slots.length,days+1);assert.equal(slots[0].type,'post');assert.equal(slots[1].type,'reel_post');assert.equal(slots[2].type,'presenter_post');
 assert.equal(slots.at(-1).day,4);assert.equal(slots.at(-1).type,'holiday_post');assert.equal(slots[3].extra,false);
});
test('worker saves daily mixed drafts and extras without media jobs, and validates before replacement',async()=>{
 const previous=process.env.WORKER_SECRET;process.env.WORKER_SECRET='planner-test';
 try {
  const rows=calendar(7);rows[1].platforms=[];
  const slots=plan.buildContentPlan(rows,7,[{date:rows[3].date,label:'Kindness event'}]);
  slots.push({...slots[1],planKey:'story-1',type:'story_post'});
  let invalid=false,transactions=0,result;const items=[],media=[],attached=[];
  const pack=()=>({title:'Master Mind campaign',posts:slots.map(s=>({planKey:s.planKey,day:s.day,type:'post',platforms:['youtube'],headline:s.planKey,caption:'Workspace content',visualDirection:'Scene and spoken plan'})),stories:[{frame:1,text:'Unrequested bonus',visualDirection:'Bonus'}],carousels:[],reel:{hook:'Hook',voiceover:'Outline'}});
  const job={id:'job',organizationId:'master-mind',type:'CREATE_EVERYTHING',status:'queued',payload:{campaignId:'campaign',brief:'Mindful change',goal:'education',days:7,dailyPlan:rows,contentPlan:slots,photoSource:'none'}};
  const tx={mediaAsset:{findMany:async()=>[{id:'saved',kind:'ai_image',url:'saved-photo',provider:'openai'}],create:async q=>attached.push(q.data)},contentItem:{update:async q=>{assert.equal(q.data.mediaUrl,'saved-photo');},deleteMany:async()=>{},create:async q=>{items.push(q.data);return {id:'item-'+items.length};}},job:{create:async q=>media.push(q),update:async q=>{result=q.data;}},campaign:{findMany:async()=>[{id:"past"}],update:async()=>{}}};
  const api=load('app/api/jobs/run/route.ts',{
   'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},openai:class {},
   '@/lib/prisma':{prisma:{job:{findFirst:async()=>job,updateMany:async()=>({count:1}),update:async()=>{}},campaign:{findUnique:async q=>{assert.equal(q.where.brand.organizationId,'master-mind');return {id:'campaign',brandId:'brand',brand:{name:'Master Mind',description:'Hypnosis service'}};}},$transaction:async fn=>{transactions++;return fn(tx);}}},
   '@/lib/ai/occasion':load('lib/ai/occasion.ts'),'@/lib/campaign/content-plan':plan,'@/lib/ai/visual-history':{recentBrandConcepts:async()=>[]},
   '@/lib/ai/campaign':{generateCampaign:async()=>{const p=pack();if(invalid)p.posts[1].planKey=p.posts[0].planKey;return p;}},
   '@/lib/campaign/photo-matching':{matchingWebsitePhoto:()=>null,modelCodes:()=>[]},'@/lib/render/svg':{},'@/lib/render/raster':{},'@/lib/ai/visual-director':{},
   '@/lib/ai/visual-plan':{buildVisualConcept:()=>({subjectCategory:'human',direction:'Service scene'})},
  });
  const req={headers:{get:()=> 'planner-test'},json:async()=>({organizationId:'master-mind'})};
  assert.equal((await api.POST(req)).status,200);assert.equal(items.length,9);assert.equal(items[8].type,"story_post");assert.equal(media.length,0);assert.equal(items[1].type,'reel_post');assert.equal(items[1].platform,'');assert.equal(items[2].type,'presenter_post');assert.equal(items[7].type,'holiday_post');assert.equal(items[3].scheduledFor.getTime(),items[7].scheduledFor.getTime());assert.ok(items.every(i=>i.status==='draft'));assert.equal(result.result.posts[2].visualDirection,'Scene and spoken plan');
  invalid=true;assert.equal((await api.POST(req)).status,500);assert.equal(transactions,1);
  invalid=false;job.payload.photoSource="ai";assert.equal((await api.POST(req)).status,200);assert.equal(media.length,9);assert.equal(media.filter(j=>j.data.payload.format==="story").length,1);
  const extraJob=media.find(j=>j.data.payload.occasion);assert.equal(extraJob.data.payload.occasion,'Kindness event');assert.match(extraJob.data.payload.visualConcept.direction,/Kindness event/);
  media.length=0;job.payload.photoSource="website";job.payload.imageUrls=['https://business.example/product.jpg'];assert.equal((await api.POST(req)).status,200);assert.equal(media.length,0);assert.ok(result.result.photoWarnings.length>0);

  media.length=0;job.payload.photoSource="none";job.payload.campaignPhotoIds=['saved'];assert.equal((await api.POST(req)).status,200);assert.equal(media.length,0);assert.equal(attached.length,8);assert.ok(attached.every(a=>a.provider==='reuse'&&a.url==='saved-photo'));

 } finally {if(previous===undefined)delete process.env.WORKER_SECRET;else process.env.WORKER_SECRET=previous;}
});
for(const route of ['schedule','now']) test(`${route} refuses unfinished reel and presenter drafts before accessing publishing accounts`,async()=>{
 let type='reel_post';
 const api=load(`app/api/publishing/${route}/route.ts`,{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
  '@/lib/prisma':{prisma:{contentItem:{findFirst:async()=>({id:'draft',status:'approved',type,mediaUrl:null})},socialConnection:{findFirst:async()=>{throw Error('must not query provider');}}}},
  '@/lib/auth/context':{tenantContext:async()=>({organizationId:'master-mind'})},
  '@/lib/campaign/content-plan':plan,
  '@/lib/campaign/photo-matching':{verifyPhotoEvidence:()=>[]},'@/lib/publishing/google-business':{},'@/lib/publishing/idempotency':{},'@/lib/publishing/providers':{},
  '@/lib/publishing/facebook-video':{campaignVideoId:()=>null},
 });
 const req={json:async()=>({contentItemId:'draft',socialConnectionId:'account',socialConnectionIds:['account'],scheduledFor:'2027-01-01T12:00:00Z'})};
 for(type of ['reel_post','presenter_post','story_post']) {const result=await api.POST(req);assert.equal(result.status,400);assert.match(result.body.error,type === "story_post" ? /publish it manually/ : /Finish and select/);}
});
test('calendar dates survive daylight saving and year boundaries',()=>{
 assert.equal(plan.campaignDate('2026-10-31',3).toISOString().slice(0,10),'2026-11-02');
 assert.equal(plan.campaignDate('2026-12-31',2).toISOString().slice(0,10),'2027-01-01');
 assert.equal(plan.newYorkToday(new Date('2026-11-01T02:00:00Z')),'2026-10-31');
 assert.throws(()=>plan.campaignDate('2026-02-30',1));
});
test('wellness and kindness dates use the correct fixed and movable dates',()=>{
 for(const [date,label] of [['2026-11-13','World Kindness Day'],['2026-10-10','World Mental Health Day'],['2026-06-13','Global Wellness Day'],['2027-06-12','Global Wellness Day'],['2026-11-26','Thanksgiving'],['2026-12-21','World Meditation Day']]) assert.equal(plan.specialDayForDate(new Date(date+'T12:00:00Z')),label);
});
test('rejects incomplete, nonconsecutive, duplicate and out-of-range selections',()=>{
 const rows=calendar(7);
 assert.throws(()=>plan.buildContentPlan(rows.slice(1),7));
 assert.throws(()=>plan.buildContentPlan([...rows.slice(0,6),rows[0]],7));
 assert.throws(()=>plan.buildContentPlan(rows.map((r,i)=>i===6?{...r,date:'2026-11-09'}:r),7));
 assert.throws(()=>plan.buildContentPlan(rows,7,[{date:'2026-12-01',label:'Extra'}]));
 assert.throws(()=>plan.buildContentPlan(rows,7,[{date:rows[0].date,label:'Kindness'},{date:rows[0].date,label:'kindness'}]));
});
test('model must return exactly one matching entry per slot and cannot change content types',()=>{
 const slots=plan.buildContentPlan(calendar(7),7),posts=slots.map(s=>({planKey:s.planKey,day:s.day,type:'post'}));
 assert.equal(plan.applyContentPlan(posts,slots)[1].type,'reel_post');
 assert.throws(()=>plan.applyContentPlan(posts.slice(1),slots));
 assert.throws(()=>plan.applyContentPlan(posts.map((p,i)=>i===1?posts[0]:p),slots));
 assert.throws(()=>plan.applyContentPlan(posts.map((p,i)=>i===1?{...p,day:7}:p),slots));
 assert.equal(plan.applyContentPlan(posts),posts);
});
test('creation derives the plan in the current workspace without generating paid media',async()=>{
 const writes=[],credits=[];
 const api=load('app/api/campaigns/create-everything/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
  '@/lib/campaign/content-plan':plan,
  '@/lib/campaign/photo-matching':{verifyPhotoEvidence:()=>[]},
  '@/lib/auth/context':{tenantContext:async()=>({organizationId:'master-mind'})},
  '@/lib/services/credits':{spendCredits:async(...args)=>credits.push(args)},
  '@/lib/prisma':{prisma:{brand:{findFirst:async q=>{assert.equal(q.where.organizationId,'master-mind');return {id:'master-brand',name:'Master Mind'};}},onboardingState:{findUnique:async()=>null},campaign:{create:async q=>{writes.push(q);return {id:'campaign'};}},job:{create:async q=>{writes.push(q);return {id:'job'};}}}},
 });
 const rows=calendar(15);
 const result=await api.POST({json:async()=>({brief:'Mindful change for our audience',organizationId:'master-mind',days:15,photoSource:'none',dailyPlan:rows,extraSpecialDays:[{date:'2026-11-13',label:'World Kindness Day'}]})});
 assert.equal(result.status,202);assert.equal(writes[1].data.organizationId,'master-mind');assert.equal(writes[1].data.payload.contentPlan.length,16);assert.equal(writes[1].data.payload.photoSource,'none');assert.equal(credits[0][1],1);
 const before=writes.length;
 const stale=await api.POST({json:async()=>({brief:'Mindful change for our audience',organizationId:'guitars',days:15,photoSource:'none',dailyPlan:rows})});
 assert.equal(stale.status,409);assert.equal(writes.length,before);assert.equal(credits.length,1);
 const invalid=await api.POST({json:async()=>({brief:'Mindful change for our audience',days:15,photoSource:'none',dailyPlan:rows.slice(1)})});
 assert.equal(invalid.status,400);assert.equal(writes.length,before);assert.equal(credits.length,1);
 const quantities={post:0,reel_post:7,story_post:7,presenter_post:0};
 const typed=await api.POST({json:async()=>({brief:'Mindful change for our audience',days:7,photoSource:'none',dailyPlan:calendar(7),contentQuantities:quantities})});
 assert.equal(typed.status,202);const typedSlots=writes.at(-1).data.payload.contentPlan;
 assert.equal(typedSlots.filter(s=>s.type==='reel_post').length,7);assert.equal(typedSlots.filter(s=>s.type==='story_post').length,7);
});
