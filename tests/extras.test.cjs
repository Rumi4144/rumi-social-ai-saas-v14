const test=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/weekly-load.cjs');
class WeeklyError extends Error{constructor(m,status=400){super(m);this.status=status;}}
class LabProviderError extends Error{constructor(definitive){super('provider');this.definitive=definitive;}}
const ctx={organizationId:'org',userId:'user',role:'owner'},uuid='11111111-1111-4111-8111-111111111111';
const input={requestId:uuid,brandId:'brand',kind:'ad',brief:'Make music every day',expectedCredits:3};
function fixture(){
 let state={credits:100,subStatus:'active',jobs:[],campaigns:[],items:[],assets:[],ledger:[],products:[],photos:[]},tail=Promise.resolve();
 const match=(r,w)=>Object.entries(w||{}).every(([k,v])=>k==='payload'?v.path.reduce((a,b)=>a?.[b],r.payload)===v.equals:k==='campaign'?v.brand.organizationId==='org':v&&typeof v==='object'&&!(v instanceof Date)?'in'in v?v.in.includes(r[k]):'lt'in v?r[k]<v.lt:'gte'in v?r[k]>=v.gte:JSON.stringify(r[k])===JSON.stringify(v):r[k]===v);
 const rows=(key,q)=>state[key].filter(r=>match(r,q.where));
 const create=(key,data)=>{assert.ok(!state[key].some(r=>r.id===data.id&&data.id));const r={id:key+state[key].length,organizationId:'org',status:'queued',result:null,error:null,createdAt:new Date(),updatedAt:new Date(),...data};state[key].push(r);return r;};
 const table=key=>({findFirst:async q=>rows(key,q)[0]||null,findUnique:async q=>rows(key,q)[0]||null,findUniqueOrThrow:async q=>{const r=rows(key,q)[0];assert.ok(r);return r;},findMany:async q=>rows(key,q),create:async q=>create(key,q.data),update:async q=>{const r=rows(key,q)[0];assert.ok(r);Object.assign(r,q.data,{updatedAt:new Date()});return r;},updateMany:async q=>{const rs=rows(key,q);rs.forEach(r=>Object.assign(r,q.data,{updatedAt:new Date()}));return{count:rs.length};},upsert:async q=>rows(key,q)[0]||create(key,q.create)});
 const db={$queryRaw:async()=>[],job:table('jobs'),campaign:table('campaigns'),contentItem:table('items'),mediaAsset:table('assets'),creditLedger:table('ledger'),
  brand:{findFirst:async q=>q.where.organizationId==='org'&&q.where.id==='brand'?{id:'brand',name:'Rumi Guitars',voice:'warm and editorial',positioning:'thoughtful craft',visualRules:'earthy, calm, spacious',primaryColor:'#302820',secondaryColor:'#eee7dc',products:state.products,websiteUrl:'https://brand.test'}:null},socialConnection:{findMany:async()=>[]},
  subscription:{findUnique:async()=>({credits:state.credits,status:state.subStatus,plan:'starter'}),findUniqueOrThrow:async()=>({credits:state.credits}),updateMany:async q=>{if(q.where.organizationId!=='org'||state.credits<q.where.credits.gte||!q.where.status.in.includes(state.subStatus))return{count:0};state.credits-=q.data.credits.decrement;return{count:1};},update:async q=>{state.credits+=q.data.credits.increment;return{credits:state.credits};}},
 };
 db.$transaction=fn=>{const result=tail.then(async()=>{const old=structuredClone(state);try{return await fn(db);}catch(e){state=old;throw e;}});tail=result.catch(()=>{});return result;};
 const provider={submits:[],mode:'ok',speechPrice:.02,videoPrice:.5,refresh:true};
 const mocks={'@/lib/prisma':{prisma:db},'@/lib/weekly/service':{WeeklyError,brandSources:async()=>state.photos},'@/lib/ai-lab/providers':{LabProviderError,labQuote:async v=>v.model==='speech'?provider.speechPrice:provider.videoPrice,labSubmit:async(v,media)=>{provider.submits.push({v,media});if(provider.mode==='unknown')throw new LabProviderError(false);if(provider.mode==='failed')throw new LabProviderError(true);return{taskId:'provider-'+v.model};}},'@/lib/ai-lab/jobs':{labRefresh:async job=>{if(job.status==='running'&&provider.refresh){job.status='succeeded';if(job.id.endsWith('-speech'))create('assets',{id:job.id,kind:'ai_lab_input',status:'ready',url:'https://provider.test/audio.mp3'});else create('assets',{id:job.id,kind:'campaign_video',status:'ready',campaignId:job.payload.campaignId,contentItemId:job.payload.contentItemId,url:'/saved',metadata:{contentType:'video/mp4'}});}return job;}}};
 const service=load('lib/extras/service.ts',mocks),presenter=load('lib/extras/presenter.ts',mocks);
 return{db,service,presenter,state:()=>state,provider,mocks};
}
const old={};for(const k of ['OPENAI_API_KEY','BLOB_READ_WRITE_TOKEN','WORKER_SECRET','WAVESPEED_API_KEY']){old[k]=process.env[k];process.env[k]='test-only';}
test.after(()=>{for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});

test('extra ad is one branded draft, one debit and independent of the weekly allowance',async()=>{
 const f=fixture(),r=await f.service.prepareExtra(ctx,input),s=f.state();assert.equal(s.credits,97);assert.equal(s.ledger.length,1);assert.equal(s.ledger[0].reason,'extra_ad');
 assert.equal(s.jobs.filter(j=>j.type==='WEEKLY_PACK').length,0);const parent=s.jobs.find(j=>j.id===r.id),job=s.jobs.find(j=>j.type==='CREATE_EVERYTHING');
 assert.equal(parent.payload.slots.length,1);assert.equal(parent.payload.packCredits,3);assert.equal(job.payload.contentPlan.length,1);assert.equal(job.payload.days,1);assert.equal(job.payload.extraCreationId,r.id);assert.equal(job.payload.weeklySlots[0].layout,'quiet-luxury');assert.equal(job.payload.weeklySlots[0].photoSource,'ai');assert.equal(job.payload.photoSource,'ai');assert.match(job.payload.brief,/derive the visual concept.*voice/s);assert.match(job.payload.brief,/Do not render text or logos into the image/);assert.equal(job.payload.brandContext.voice,'warm and editorial');assert.equal(job.payload.brandContext.approvalRequired,true);
});
test('double clicks and concurrent tabs cannot debit the same extra twice',async()=>{
 const f=fixture();const[a,b]=await Promise.all([f.service.prepareExtra(ctx,input),f.service.prepareExtra(ctx,input)]);assert.equal(a.id,b.id);assert.equal(f.state().credits,97);assert.equal(f.state().ledger.length,1);
 await assert.rejects(f.service.prepareExtra(ctx,{...input,brief:'Changed request'}),/already belongs/);
});
test('different requests compete atomically for the same monthly balance',async()=>{
 const f=fixture();f.state().credits=3;
 const rs=await Promise.allSettled([f.service.prepareExtra(ctx,input),f.service.prepareExtra(ctx,{...input,requestId:'22222222-2222-4222-8222-222222222222'})]);assert.equal(rs.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state().credits,0);assert.equal(f.state().campaigns.length,1);
});
test('server rejects viewer, foreign brand, inactive plan, wrong cost and insufficient balance before creating paid work',async()=>{
 for(const mode of ['viewer','foreign','inactive','cost','balance']){const f=fixture();if(mode==='inactive')f.state().subStatus='canceled';if(mode==='balance')f.state().credits=2;
 await assert.rejects(f.service.prepareExtra(mode==='viewer'?{...ctx,role:'viewer'}:ctx,{...input,...(mode==='foreign'?{brandId:'other'}:{}),...(mode==='cost'?{expectedCredits:1}:{})}));assert.equal(f.state().ledger.length,0);assert.equal(f.state().jobs.length,0);}
});
test('a reel requires the full seven credits, reserves preparation once, and queues three scene planning through the worker',async()=>{
 const f=fixture();f.state().credits=6;await assert.rejects(f.service.prepareExtra(ctx,{...input,kind:'reel',expectedCredits:7}),/7 available/);f.state().credits=7;
 const r=await f.service.prepareExtra(ctx,{...input,kind:'reel',expectedCredits:7});assert.equal(f.state().credits,4);const p=f.state().jobs.find(j=>j.id===r.id).payload;assert.equal(p.completionCredits,4);assert.equal(p.slots[0].kind,'motion_reel');assert.equal(p.slots[0].reelPhotoSource,'ai');
});
test('product identities are scoped to the selected brand and reels require distinct original photos',async()=>{
 const f=fixture();await assert.rejects(f.service.prepareExtra(ctx,{...input,productId:'foreign'}),/saved product/);
 f.state().products=[{id:'product',name:'Actual guitar',description:'Hand-finished acoustic guitar',imageUrl:'https://brand.test/one.jpg',sourceUrl:'https://brand.test/product'}];f.state().photos=[{productName:'Actual guitar',imageUrl:'https://brand.test/one.jpg',sourceUrl:'https://brand.test/product'}];
 await assert.rejects(f.service.prepareExtra(ctx,{...input,productId:'product',kind:'reel',expectedCredits:7}),/three saved photos/);assert.equal(f.state().credits,100);
 const r=await f.service.prepareExtra(ctx,{...input,productId:'product'});const p=f.state().jobs.find(j=>j.type==='CREATE_EVERYTHING').payload;assert.equal(p.weeklySlots[0].productName,'Actual guitar');assert.equal(p.weeklySlots[0].sourceImageUrl,undefined);assert.equal(p.photoSource,'ai');assert.equal(p.weeklySources.length,0);assert.match(p.brief,/Hand-finished acoustic guitar/);
});
test('an ad can feature a product with no photo and uses only its supplied facts for an original brand-led scene',async()=>{
 const f=fixture();f.state().products=[{id:'no-photo',name:'Studio Lessons',description:'One-to-one beginner guitar lessons',imageUrl:null,sourceUrl:null}];
 const r=await f.service.prepareExtra(ctx,{...input,productId:'no-photo'}),p=f.state().jobs.find(j=>j.type==='CREATE_EVERYTHING').payload;
 assert.equal(p.photoSource,'ai');assert.equal(p.weeklySlots[0].photoSource,'ai');assert.equal(p.weeklySlots[0].productName,'Studio Lessons');
 assert.match(p.brief,/One-to-one beginner guitar lessons/);assert.match(p.brief,/do not pretend to reproduce its exact physical appearance/i);
});
const presenterInput={...input,kind:'presenter',presenter:'alex',brief:'Welcome to our guitar collection. Find a little inspiration today.',expectedCredits:30};
test('presenter resumes saved voice/video tasks and selects a private MP4 draft without approving or posting',async()=>{
 const f=fixture(),{id}=await f.service.prepareExtra(ctx,presenterInput);assert.equal(f.state().credits,70);f.state().items[0].mediaUrl=null;
 await Promise.all([f.presenter.advancePresenter('org',id),f.presenter.advancePresenter('org',id)]);await f.presenter.advancePresenter('org',id);
 assert.equal(f.provider.submits.length,2);assert.equal(f.provider.submits[0].v.prompt,presenterInput.brief);assert.match(f.provider.submits[1].media.image,/^https:\/\/rumisocialai.com\/presenters\/extra-alex.png$/);
 assert.equal(f.state().items[0].status,'draft');assert.equal(f.state().items[0].mediaUrl,`/api/video/media/${id}-video`);assert.equal(f.state().jobs.find(j=>j.id===id).status,'succeeded');assert.equal(f.state().credits,70);
 await f.presenter.advancePresenter('org',id);assert.equal(f.provider.submits.length,2);
});
test('definitive presenter failure refunds once; foreign workspaces cannot run the task',async()=>{
 const f=fixture(),{id}=await f.service.prepareExtra(ctx,presenterInput);await assert.rejects(f.presenter.advancePresenter('foreign',id),/not found/);assert.equal(f.provider.submits.length,0);f.provider.mode='failed';
 await f.presenter.advancePresenter('org',id);await f.presenter.advancePresenter('org',id);assert.equal(f.state().credits,100);assert.equal(f.state().ledger.filter(l=>l.reason==='extra_presenter_refund').length,1);assert.equal(f.provider.submits.length,1);
});
test('ambiguous paid request is never resubmitted or silently refunded',async()=>{
 const f=fixture(),{id}=await f.service.prepareExtra(ctx,presenterInput);f.provider.mode='unknown';
 for(let n=0;n<3;n++)await f.presenter.advancePresenter('org',id);assert.equal(f.provider.submits.length,1);assert.equal(f.state().credits,70);assert.equal(f.state().jobs.find(j=>j.id===id).status,'attention');
});
test('an over-budget provider quote stops before video submission and restores the customer credits',async()=>{
 const f=fixture(),{id}=await f.service.prepareExtra(ctx,presenterInput);f.provider.videoPrice=1.01;
 await f.presenter.advancePresenter('org',id);assert.equal(f.provider.submits.length,1);assert.equal(f.provider.submits[0].v.model,'speech');assert.equal(f.state().credits,100);
});
test('route validates script bounds and same-origin mutation; user-supplied job types and prices cannot bypass the catalog',async()=>{
 const f=fixture(),calls=[];const api=load('app/api/extras/route.ts', {...f.mocks,'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/lib/auth/context':{tenantContext:async()=>ctx},'@/lib/extras/service':{prepareExtra:async(_,v)=>{calls.push(v);return{};}},'@/lib/http/errors':{apiError:()=>({status:500})}});
 const req=(body,origin='https://app.test')=>({url:'https://app.test/api/extras',headers:{get:()=>origin},json:async()=>body});
 for(const body of [{action:'create',...presenterInput,brief:'x'.repeat(181)},{action:'create',...presenterInput,brief:'a '.repeat(36)},{action:'create',...input,organizationId:'foreign'},{action:'create',...input,kind:'premium'}])assert.equal((await api.POST(req(body))).status,400);
 assert.equal((await api.POST(req({action:'create',...input},'https://foreign.test'))).status,403);assert.equal(calls.length,0);
 assert.equal((await api.POST(req({action:'create',...input}))).status,200);assert.equal(calls.length,1);
});

test('expired Admin access blocks new extras without spending saved credits', async()=>{
 const f=fixture(),before=f.state().credits;
 f.state().jobs.push({id:'admin-creation-access:org',organizationId:'org',type:'ADMIN_CREATION_ACCESS',status:'completed',payload:{duration:'week',startsAt:'2020-01-01T00:00:00Z',expiresAt:'2020-01-08T00:00:00Z'}});
 await assert.rejects(f.service.prepareExtra(ctx,input),/access has ended/);
 assert.equal(f.state().credits,before);assert.equal(f.state().campaigns.length,0);
});
