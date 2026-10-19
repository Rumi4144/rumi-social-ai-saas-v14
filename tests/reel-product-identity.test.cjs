const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');const root=path.resolve(__dirname,'..');
function load(file,mocks={},cache=new Map()){file=path.resolve(root,file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,Buffer,URL,process,console,require:n=>n in mocks?mocks[n]:n.startsWith('@/')||n.startsWith('.')?load((n.startsWith('@/')?n.slice(2):path.relative(root,path.resolve(path.dirname(file),n)))+'.ts',mocks,cache):require(n)});return module.exports;}
const brand={id:'guitars',name:'Rumi Guitars',website:'https://shop.example/',color:'#123456',accent:'#abcdef'};
const post={id:'ramirez',headline:'Meet the Ramirez Inspired A1 Guitar',caption:'Explore this classical guitar. Notice the wood grain.',type:'reel_post'};
const evidence=(name,slug)=>({imageUrl:'https://shop.example/'+slug+'.jpg',sourceUrl:'https://shop.example/product/'+slug+'/',title:name});
const asset=(id,ev,other={})=>({id,organizationId:'org',brandId:'guitars',campaignId:'camp',contentItemId:post.id,status:'ready',kind:'ai_image',url:'saved-photo:'+id,prompt:'Ramirez classical guitar wood grain',post,metadata:ev?{sourceEvidence:ev}:undefined,...other});
const correct=evidence('Ramirez Inspired A1 Guitar','ramirez-inspired-a1-guitar'),wrong=evidence('Martinez Performer MS-14R','martinez-ms-14r');
const helpers=load('lib/reels/product-identity.ts'),planner=load('lib/reels/auto-plan.ts');
test('Ramirez planner excludes attached, scene-specific and semantically similar wrong models',()=>{
 const result=planner.automaticReelPlan({organizationId:'org',campaignId:'camp',brand,post,assets:[asset('wrong',wrong),asset('unverified'),asset('same-code',evidence('Martinez A1','martinez-a1')),asset('exact-scene',wrong,{metadata:{sourceEvidence:wrong,sceneId:'ramirez-planned-1'}}),asset('right',correct)]});
 assert.deepEqual(Array.from(result.sources,s=>s.id),['right']);assert.equal(result.project.productSubject,post.headline);
 const missing=planner.automaticReelPlan({organizationId:'org',campaignId:'camp',brand,post,assets:[asset('wrong',wrong),asset('unverified')]});assert.equal(missing.sources.length,0);assert.match(missing.warnings.join(' '),/No verified photos match/);
});
test('canonical topic protects a product even when its creative headline does not name the model',()=>{
 const target={...post,headline:'A classical voice worth exploring',topics:['Ramirez Inspired A1 Guitar']};const result=planner.automaticReelPlan({organizationId:'org',campaignId:'camp',brand,post:target,assets:[asset('wrong',wrong),asset('right',correct,{contentItemId:'past'})]});
 assert.deepEqual(Array.from(result.sources,s=>s.id),['right']);assert.equal(result.project.productSubject,'Ramirez Inspired A1 Guitar');
 const jose='Jose Luis Romanillos inspired Guitar by Rumi';assert.ok(helpers.reelPhotoMatchesProduct(jose,{metadata:{sourceEvidence:evidence(jose,'jose-luis-romanillos-inspired-guitar-by-rumi')}}));assert.equal(helpers.reelPhotoMatchesProduct(jose,{metadata:{sourceEvidence:wrong}}),false);
});
test('generic service and collection posts retain semantic planning; prompts cannot verify named products',()=>{
 assert.equal(helpers.reelProductSubject({headline:'Notice your breathing'},{name:'Master Mind'}),undefined);assert.equal(helpers.reelProductSubject({headline:'Explore our classical guitars'},brand),undefined);
 assert.equal(helpers.reelPhotoMatchesProduct(post.headline,{url:'saved-photo:unknown',metadata:{label:post.headline,userSelected:true}}),false);
 assert.equal(helpers.reelPhotoMatchesProduct(post.headline,{metadata:{sourceUrl:correct.sourceUrl,label:'Product photo 1'}}),true);
});
const json=(body,opts={})=>({body,status:opts.status||200});
test('editor loading hides wrong photos and does not automatically select an older unverified reel',async()=>{
 const assets=[asset('wrong',wrong),asset('right',correct),{...asset('old-video'),kind:'campaign_video',provider:'reel-editor',metadata:{contentType:'video/mp4'}}];
 const api=load('app/api/reels/project/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'org'})},'@/lib/prisma':{prisma:{campaign:{findFirst:async()=>({id:'camp',title:'Campaign',brand,items:[post]})},mediaAsset:{findMany:async()=>assets},job:{findFirst:async()=>null}}}});
 const r=await api.GET({url:'https://app.example/api/reels/project?campaignId=camp&contentItemId=ramirez'});assert.equal(r.status,200);assert.equal(r.body.savedReels.length,0);assert.ok(!r.body.sources.some(s=>s.id==='wrong'));
 const context=load('lib/reels/post-context.ts').selectedPostProject(r.body,post.id);assert.ok(context.project.scenes.every(s=>s.src.includes('right')));assert.equal(context.post.productSubject,post.headline);
});
test('importing another product page is rejected before any image write',async()=>{
 let writes=0;const api=load('app/api/reels/photos/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'org',role:'owner'})},'@/lib/prisma':{prisma:{contentItem:{findFirst:async()=>({...post,campaign:{brand:{...brand,websiteUrl:brand.website,products:[]}}})},mediaAsset:{upsert:async()=>{writes++;}}}},'@/lib/reels/public-fetch':{fetchPublicBytes:async()=>({contentType:'text/html',bytes:Buffer.from('<h1>Martinez Performer MS-14R</h1><div class="woocommerce-product-gallery"><img src="/martinez.jpg"></div>')})}});
 const r=await api.POST({json:async()=>({campaignId:'camp',contentItemId:post.id,url:wrong.sourceUrl})});assert.equal(r.status,400);assert.equal(writes,0);assert.match(r.body.error,/does not match/);
});

test('older cached product drafts cannot restore unverified sources',()=>{
 const {matchingDraft}=load('lib/reels/post-context.ts');const old={contentItemId:post.id,project:{scenes:[{src:'wrong-photo'}]}};
 assert.equal(matchingDraft(old,post.id,post.headline),undefined);
 const current={contentItemId:post.id,project:{productSubject:post.headline}};assert.equal(matchingDraft(current,post.id,post.headline),current);assert.equal(matchingDraft(current,post.id,'Martinez MF-17'),undefined);
});
