const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={},cache=new Map()){
 file=path.resolve(root,file);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const req=name=>{if(name in mocks)return mocks[name];if(name.startsWith('@/')||name.startsWith('.')){const target=name.startsWith('@/')?path.join(root,name.slice(2)):path.resolve(path.dirname(file),name);const alias='@/'+path.relative(root,target).replace(/\\/g,'/');if(alias in mocks)return mocks[alias];return load(target.endsWith('.ts')?target:target+'.ts',mocks,cache);}return require(name);};
 vm.runInNewContext(js,{module,exports:module.exports,require:req,process,Buffer,URL,console,Request,Response,AbortSignal,setTimeout,clearTimeout},{filename:file});return module.exports;
}
const plain=x=>JSON.parse(JSON.stringify(x));
const {productReelShots,productReelProject}=load('lib/reels/product-video-plan.ts');
const photo={id:'photo-a',url:'https://shop.example/photo.jpg'};
const product={name:'Martinez MF-17',sourceUrl:'https://shop.example/product/martinez-mf-17',imageUrl:photo.url};
const brand={id:'brand',name:'Rumi Guitars',websiteUrl:'https://shop.example',products:[product]};
const post={id:'post',campaignId:'campaign',headline:'Martinez MF-17',caption:'Discover this guitar.',campaign:{brand}};
const reference=(id=photo.id,extra={})=>({id,organizationId:'org',campaignId:'campaign',contentItemId:'post',kind:'product_photo',status:'ready',url:photo.url,metadata:{productName:product.name,sourceUrl:product.sourceUrl,sourceEvidence:{title:product.name,sourceUrl:product.sourceUrl,imageUrl:photo.url}},...extra});
const planInput={campaignId:'campaign',contentItemId:'post',sourceUrl:product.sourceUrl,productName:product.name,brand:{name:'Rumi Guitars',website:'https://shop.example',color:'#123456',accent:'#abcdef'},shots:productReelShots(product.name,[photo])};
const requestId='10000000-0000-4000-8000-000000000001';
const req=body=>new Request('https://rumi.test/api/reels/product-video',{method:'POST',body:JSON.stringify({requestId,campaignId:'campaign',contentItemId:'post',...body})});
function fixture({credits=200,subscriptionStatus='active',assets=[reference()],ctx={organizationId:'org',role:'owner'},providerError,fetchError,configured=true}={}){
 const records=new Map(),ledger=[],calls=[];let balance=credits,tail=Promise.resolve();
 const matches=(row,w)=>Object.entries(w).every(([k,v])=>{if(k==='AND')return v.every(part=>matches(row,part));if(k==='payload')return row.payload[v.path[0]]===v.equals;if(v&&typeof v==='object'&&!Array.isArray(v))return v.in?v.in.includes(row[k]):v.lt?row[k]<v.lt:false;return row[k]===v;});
 const db={
 job:{findFirst:async({where})=>plain([...records.values()].filter(r=>matches(r,where)).at(-1)||null),findUniqueOrThrow:async({where})=>{const row=records.get(where.id);if(!row)throw Error('missing');return plain(row);},
 findMany:async({where})=>plain([...records.values()].filter(r=>matches(r,where))),
 create:async({data})=>{if(records.has(data.id))throw Object.assign(Error('duplicate'),{code:'P2002'});const row={progress:0,error:null,result:null,...data};records.set(data.id,plain(row));return plain(row);},
 updateMany:async({where,data})=>{let count=0;for(const [id,row]of records)if(matches(row,where)){records.set(id,{...row,...plain(data)});count++;}return {count};},update:async({where,data})=>{const row={...records.get(where.id),...plain(data)};records.set(where.id,row);return plain(row);}},
 contentItem:{findFirst:async({where})=>where.id==='post'&&where.campaignId==='campaign'&&where.campaign.brand.organizationId==='org'?post:null},
 mediaAsset:{findMany:async({where})=>plain(assets.filter(a=>matches(a,where)))},
 subscription:{updateMany:async({where,data})=>{if(balance<where.credits.gte||(where.status&&!where.status.in.includes(subscriptionStatus)))return {count:0};balance-=data.credits.decrement;return {count:1};},findUniqueOrThrow:async()=>({credits:balance}),update:async({data})=>{balance+=data.credits.increment;return {credits:balance};}},
 creditLedger:{create:async({data})=>{ledger.push(plain(data));return data;}}
 };
 db.$transaction=fn=>{const run=tail.then(async()=>{const snapshot=plain([...records]),oldBalance=balance,oldLength=ledger.length;try{return await fn(db);}catch(e){records.clear();snapshot.forEach(([id,row])=>records.set(id,row));balance=oldBalance;ledger.length=oldLength;throw e;}});tail=run.catch(()=>{});return run;};
 class RunwayError extends Error{constructor(status,message){super(message);this.status=status;}}
 const mocks={'@/lib/prisma':{prisma:db},'@/lib/auth/context':{tenantContext:async()=>ctx},'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},'@/lib/reels/public-fetch':{fetchPublicBytes:async()=>{if(fetchError)throw Error('private network address');return {bytes:Buffer.from('fixture image'),contentType:'image/jpeg'};}},'@/lib/video/runway':{runwayConfigured:()=>configured,runwayModel:()=> 'gen4.5',RunwayError,createVideoTask:async input=>{calls.push(input);if(providerError==='unknown')throw Error('timeout');if(providerError==='rejected')throw new RunwayError(400,'Rejected image');return {id:'task-'+calls.length};}},'@/lib/video/jobs':{refreshVideo:async job=>job,failVideo:async(job,error)=>{await db.$transaction(async tx=>{const claim=await tx.job.updateMany({where:{id:job.id,status:{in:['starting','running','uncertain']}},data:{status:'failed',error,progress:100}});if(!claim.count)return;const cost=job.payload.cost;const sub=await tx.subscription.update({data:{credits:{increment:cost}}});await tx.creditLedger.create({data:{delta:cost,balanceAfter:sub.credits,referenceId:job.id}});});}}};
 return {api:load('app/api/reels/product-video/route.ts',mocks),records,ledger,calls,balance:()=>balance};
}
const prepare=async f=>{const response=await f.api.POST(req({action:'plan',assetIds:['photo-a']}));assert.equal(response.status,200,JSON.stringify(response.body));return response.body.job;};
const start=f=>f.api.POST(req({action:'start',consent:true,expectedCost:120}));
test('one website photo produces three genuinely different motion briefs, with no invented demonstrations',()=>{
 const shots=productReelShots('A new product',[photo]);assert.equal(shots.length,3);assert.equal(new Set(shots.map(s=>s.prompt)).size,3);assert.ok(shots.every(s=>s.assetId===photo.id));
 assert.ok(shots.every(s=>/continuous camera motion|continuous, smooth camera/.test(s.prompt)&&/Do not add people, hands, demonstrations/.test(s.prompt)));
 const project=productReelProject(planInput,['video-a','video-b','video-c']);assert.equal(project.project.style,'product-film');assert.equal(project.project.closingSeconds,0);assert.equal(project.project.endingOverlay,true);assert.equal(project.project.scenes.reduce((n,s)=>n+s.seconds,0),15);assert.ok(project.project.scenes.every(s=>s.kind==='video'));assert.equal(project.musicStyle,'classical');
 assert.throws(()=>productReelProject(planInput,['a','a','c']),/three moving scenes/);assert.throws(()=>productReelShots('product',[]),/website photo/);
});
test('other products use their own gallery views and resized duplicates never displace distinct photos',()=>{
 const photos=[{id:'front-small',url:'https://shop.example/chair-front-300x300.jpg'},{id:'front-large',url:'https://shop.example/chair-front.jpg'},{id:'back',url:'https://shop.example/chair-back.jpg'},{id:'detail',url:'https://shop.example/chair-detail.jpg'}];
 const shots=productReelShots('Oak Dining Chair',photos);
 assert.deepEqual(Array.from(shots,s=>s.assetId),['front-small','back','detail']);
 assert.ok(shots.every(s=>s.prompt.includes('Oak Dining Chair')&&!/Martinez|guitar/i.test(s.prompt)));
 assert.equal(shots[0].caption,'Oak Dining Chair');
});
test('plan is free, source-bound and replayable without paid requests',async()=>{
 const f=fixture();const job=await prepare(f);assert.equal(job.status,'draft');assert.equal(job.cost,120);assert.equal(job.shots.length,3);assert.equal(f.calls.length,0);assert.equal(f.balance(),200);
 await prepare(f);assert.equal(f.records.size,1);assert.equal(f.ledger.length,0);
 const response=await f.api.POST(req({action:'start',consent:false,expectedCost:120}));assert.equal(response.status,400);assert.equal(f.calls.length,0);
 assert.equal((await f.api.POST(req({action:'start',consent:true,expectedCost:40}))).status,400);
});
test('foreign assets, unrelated products and mixed product pages stop before reserving credits',async()=>{
 for(const patch of [{organizationId:'foreign'},{contentItemId:'other'},{kind:'ai_image'},{metadata:{productName:'Different product',sourceUrl:'https://shop.example/product/other'}}]){
 const f=fixture({assets:[reference('photo-a',patch)]});assert.equal((await f.api.POST(req({action:'plan',assetIds:['photo-a']}))).status,400);assert.equal(f.balance(),200);assert.equal(f.calls.length,0);
 }
 const f=fixture({assets:[reference(),reference('b',{metadata:{productName:product.name,sourceUrl:'https://shop.example/product/another'}})]});assert.equal((await f.api.POST(req({action:'plan',assetIds:['photo-a','b']}))).status,400);
 const viewer=fixture({ctx:{organizationId:'org',role:'viewer'}});assert.equal((await viewer.api.POST(req({action:'plan',assetIds:['photo-a']}))).status,403);
});
test('concurrent start reserves once and sends exactly three paid requests; GET and retries never regenerate',async()=>{
 const f=fixture();await prepare(f);const [a,b]=await Promise.all([start(f),start(f)]);assert.equal(a.status,202);assert.equal(b.status,202);assert.equal(f.balance(),80);assert.equal(f.calls.length,3);assert.equal(f.ledger.length,1);assert.equal(f.ledger[0].delta,-120);
 await start(f);await f.api.GET(new Request('https://rumi.test/api/reels/product-video?jobId='+requestId));assert.equal(f.calls.length,3);assert.equal(f.balance(),80);
 assert.ok(f.calls.every(c=>c.imageUrl.startsWith('data:image/jpeg;base64,')&&c.duration===5));
});
test('insufficient credits rolls back the parent claim and creates no child or provider task',async()=>{
 const f=fixture({credits:119});await prepare(f);assert.equal((await start(f)).status,402);assert.equal(f.records.get(requestId).status,'draft');assert.equal(f.records.size,1);assert.equal(f.calls.length,0);assert.equal(f.balance(),119);
});
test('ended or unpaid plans cannot start new AI scenes despite an unused balance',async()=>{
 for(const subscriptionStatus of ['canceled','past_due','incomplete_expired']){const f=fixture({subscriptionStatus});await prepare(f);const response=await start(f);assert.equal(response.status,402);assert.equal(f.records.get(requestId).status,'draft');assert.equal(f.calls.length,0);assert.equal(f.balance(),200);}
});
test('ambiguous provider timeouts keep the original request reserved and never resubmit it',async()=>{
 const f=fixture({providerError:'unknown'});await prepare(f);const response=await start(f);assert.equal(response.body.job.status,'attention');assert.ok(response.body.job.shots.every(s=>s.status==='uncertain'));assert.equal(f.calls.length,3);assert.equal(f.balance(),80);
 await start(f);assert.equal(f.calls.length,3);assert.equal(f.ledger.length,1);
});
test('known provider rejection and inaccessible reference images refund exactly the failed scenes',async()=>{
 for(const options of [{providerError:'rejected'},{fetchError:true}]){const f=fixture(options);await prepare(f);const response=await start(f);assert.equal(response.body.job.status,'partial');assert.equal(f.balance(),200);assert.equal(f.ledger.length,4);assert.equal(f.ledger.reduce((n,x)=>n+x.delta,0),0);await start(f);assert.equal(f.balance(),200);assert.equal(f.ledger.length,4);}
});
test('completed scene order and exact product survive reload; a partial reel cannot masquerade as complete',async()=>{
 const f=fixture();await prepare(f);await start(f);const ids=f.records.get(requestId).result.sceneIds;
 for(const id of ids.slice(0,2))f.records.get(id).status='succeeded';
 let response=await f.api.GET(new Request('https://rumi.test/api/reels/product-video?jobId='+requestId));assert.equal(response.body.job.project,undefined);
 f.records.get(ids[2]).status='succeeded';response=await f.api.GET(new Request('https://rumi.test/api/reels/product-video?campaignId=campaign&contentItemId=post'));
 assert.equal(response.body.job.status,'ready');assert.equal(response.body.job.project.productSubject,'Martinez MF-17');assert.deepEqual(Array.from(response.body.job.sources,s=>s.id),ids);assert.ok(response.body.job.project.scenes.every(s=>s.kind==='video'));assert.equal(f.calls.length,3);
});
test('workspace and request/post identity guard persisted plans and status reads',async()=>{
 const f=fixture();await prepare(f);assert.equal((await f.api.POST(req({action:'start',contentItemId:'other',consent:true,expectedCost:120}))).status,409);assert.equal(f.calls.length,0);
 const foreign=fixture({ctx:{organizationId:'foreign',role:'owner'}});foreign.records.set(requestId,plain(f.records.get(requestId)));assert.equal((await foreign.api.GET(new Request('https://rumi.test/api/reels/product-video?jobId='+requestId))).body.job,null);
});
