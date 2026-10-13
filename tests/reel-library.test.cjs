const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps){const module={exports:{}};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInNewContext(js,{module,exports:module.exports,require:n=>n in deps?deps[n]:require(n),URL,Buffer,process,Uint8Array});return module.exports;}
const response={NextResponse:class extends Response {static json(body,options){return {body,status:options?.status||200,headers:options?.headers};}}};
function fixture(){
 const state={org:'own',missing:false,queries:[],assets:Array.from({length:25},(_,i)=>({id:`image${i}`,campaignId:'past',contentItemId:'post',kind:'ai_image',metadata:null}))};
 const prisma={campaign:{findFirst:async q=>{assert.equal(q.where.brand.organizationId,state.org);return state.missing?null:{brandId:'hypnosis',brand:{name:'Master Mind'}};},findMany:async q=>{assert.equal(q.where.brandId,'hypnosis');assert.equal(q.where.brand.organizationId,state.org);return [{id:'current',title:'Today'},{id:'past',title:'Relaxation week'}];}},contentItem:{findMany:async q=>{state.queries.push(q);assert.deepEqual(Array.from(q.where.campaignId.in),['current','past']);return [{id:'post',headline:'Relaxation'}];}},mediaAsset:{findMany:async q=>{state.queries.push(q);assert.equal(q.where.organizationId,state.org);assert.deepEqual(Array.from(q.where.campaignId.in),['current','past']);assert.equal(q.where.status,'ready');assert.deepEqual(Array.from(q.where.kind.in),['ai_image','product_photo','reel_scene_image']);assert.equal(q.where.url.not,null);return state.assets;}}};
 const api=load('app/api/reels/library/route.ts',{'next/server':response,'@/lib/auth/context':{tenantContext:async()=>({organizationId:state.org})},'@/lib/prisma':{prisma},'@/lib/http/errors':{apiError:e=>({status:500,body:{error:e.message}})}});
 return {api,state,request:(extra='')=>new Request(`https://app.test/api/reels/library?organizationId=own&campaignId=current${extra}`)};
}
test('past photo library is restricted to current business, pages results and returns proxy URLs without raw files',async()=>{
 const f=fixture();const result=await f.api.GET(f.request());assert.equal(result.status,200);assert.equal(result.body.sources.length,24);assert.equal(result.body.hasMore,true);assert.equal(result.headers['Cache-Control'],'private, no-store');
 const photo=result.body.sources[0];assert.equal(photo.libraryBrandId,'hypnosis');assert.equal(photo.contentItemId,'post');assert.equal(photo.label,'Relaxation');assert.equal(photo.campaignTitle,'Relaxation week');assert.match(photo.src,/campaignId=current/);assert.match(photo.thumbnail,/thumbnail=1/);assert.equal(photo.url,undefined);
 await f.api.GET(f.request('&page=2'));assert.equal(f.state.queries.at(-1).skip,24);
});
test('search matches saved photo prompts, post topics and campaign titles inside the business',async()=>{
 const f=fixture();await f.api.GET(f.request('&q=relaxation'));const q=f.state.queries.at(-1);assert.equal(q.where.OR[0].prompt.contains,'relaxation');assert.equal(q.where.OR[0].prompt.mode,'insensitive');assert.deepEqual(Array.from(q.where.OR[1].contentItemId.in),['post']);assert.deepEqual(Array.from(q.where.OR[2].campaignId.in),['past']);
});
test('stale workspace, inaccessible campaign and invalid pagination never load assets',async()=>{
 const f=fixture();f.state.org='other';assert.equal((await f.api.GET(f.request())).status,409);assert.equal(f.state.queries.length,0);f.state.org='own';f.state.missing=true;assert.equal((await f.api.GET(f.request())).status,404);f.state.missing=false;
 for(const extra of ['&page=0','&page=-1','&page=1.5','&page=1001','&page=no','&q='+ 'x'.repeat(121)])assert.equal((await f.api.GET(f.request(extra))).status,400);
 assert.equal(f.state.queries.length,0);
});
test('saved reused photos survive draft restoration only within the same brand; selection keeps scene timing and text',()=>{
 const lib=load('lib/reels/source-library.ts',{});
 const source={id:'past',src:'/reused',kind:'image',contentItemId:'past-post',libraryBrandId:'hypnosis'};
 const other={...source,id:'other',src:'/other',libraryBrandId:'guitars'};
 const draft={sources:[source,other],project:{scenes:[]}};
 const restored=lib.restoreLibrary(draft,new Map(),'current-post','hypnosis');assert.equal(restored.length,1);assert.equal(restored[0].contentItemId,'past-post');assert.equal(restored[0].src,'/reused');assert.equal(lib.restoreLibrary(draft,new Map(),'current-post').length,0);
 const project={scenes:[{id:'scene1',src:'/old',kind:'image',seconds:3,headline:'Keep this',detail:'Caption',direction:'A planned shot'},{id:'scene2',src:'/second',kind:'image',seconds:4}],closingSeconds:0};
 const replaced=lib.replaceScenePhoto(project,'scene1',source);assert.equal(replaced.scenes[0].src,'/reused');assert.equal(replaced.scenes[0].seconds,3);assert.equal(replaced.scenes[0].headline,'Keep this');assert.equal(replaced.scenes[0].direction,'A planned shot');assert.equal(replaced.scenes[1].src,'/second');assert.equal(project.scenes[0].src,'/old');
});
test('library media proxy enforces brand scope and uses a smaller thumbnail without changing export resolution',async()=>{
 let size,missing=false,assetCalls=0;
 const pipeline={rotate(){return this;},resize(w,h){size=w;assert.equal(w,h);return this;},png(){return this;},async toBuffer(){return Buffer.from('photo');}};
 const api=load('app/api/reels/media/route.ts',{'next/server':response,'@/lib/auth/context':{tenantContext:async()=>({organizationId:'own'})},'@/lib/prisma':{prisma:{campaign:{findFirst:async()=>missing?null:{brandId:'hypnosis'},findMany:async q=>{assert.equal(q.where.brandId,'hypnosis');return [{id:'past'}];}},mediaAsset:{findFirst:async q=>{assetCalls++;assert.equal(q.where.organizationId,'own');assert.deepEqual(Array.from(q.where.campaignId.in),['past']);return {url:'data:image/png;base64,aW1hZ2U='};}}}},'@/lib/http/errors':{apiError:e=>{throw e;}},'@/lib/reels/public-fetch':{fetchPublicBytes:()=>{throw Error('no network expected');}},sharp:()=>pipeline});
 const url='https://app.test/api/reels/media?assetId=saved&campaignId=current';
 assert.equal((await api.GET(new Request(url+'&thumbnail=1'))).status,200);assert.equal(size,256);
 await api.GET(new Request(url));assert.equal(size,1920);
 missing=true;assert.equal((await api.GET(new Request(url))).status,404);assert.equal(assetCalls,2);
});
