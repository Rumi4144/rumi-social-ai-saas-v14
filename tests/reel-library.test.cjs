const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
function load(file,deps={},cache=new Map()){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;vm.runInNewContext(js,{module,exports:module.exports,require:n=>n in deps?deps[n]:n.startsWith('@/')||n.startsWith('.')?load((n.startsWith('@/')?n.slice(2):path.resolve(path.dirname(file),n))+'.ts',deps,cache):require(n),URL,Buffer,process,Uint8Array});return module.exports;}
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
test('a third photo can replace a repeat in a full reel while retaining every caption and scene length',()=>{
 const lib=load('lib/reels/source-library.ts');
 const project={scenes:['/a','/a','/a','/b','/b','/b'].map((src,i)=>({id:'scene-'+i,src,kind:'image',seconds:i+1,headline:'Title '+i,detail:'Caption '+i,direction:'Shot '+i})),closingSeconds:3};
 const source={id:'third',src:'/c',kind:'image'};
 assert.equal(lib.hasRoomForReelSource(project),true);
 const selected=lib.selectReelSource(project,source,()=>{throw Error('Must reuse an existing scene');});
 assert.equal(selected.scenes.length,6);assert.equal(new Set(selected.scenes.map(s=>s.src)).size,3);
 selected.scenes.forEach((scene,i)=>{const {src,...rest}=scene;const {src:old,...previous}=project.scenes[i];assert.deepEqual(rest,previous);});
 assert.equal(project.scenes[5].src,'/b');assert.equal(selected.scenes[5].src,'/c');
 assert.equal(lib.selectReelSource(selected,source,()=>{throw Error('Already selected');}),selected);
});
test('photo selection appends once and never removes a distinct photo when all six slots are full',()=>{
 const lib=load('lib/reels/source-library.ts');
 let project={scenes:[],closingSeconds:0};
 for(let i=0;i<6;i++)project=lib.selectReelSource(project,{id:String(i),src:'/photo-'+i,kind:'image'},()=>String(i));
 assert.equal(project.scenes.length,6);assert.equal(lib.hasRoomForReelSource(project),false);
 assert.equal(lib.selectReelSource(project,{id:'seventh',src:'/photo-7',kind:'image'},()=> '7'),project);
 const fewer={...project,scenes:project.scenes.slice(1)};assert.equal(lib.hasRoomForReelSource(fewer),true);
 assert.equal(lib.selectReelSource(fewer,{id:'seventh',src:'/photo-7',kind:'image'},()=> '7').scenes.length,6);
});
test('automatic photo selection creates three distinct scenes from repeated selections and leaves the library untouched',()=>{
 const lib=load('lib/reels/source-library.ts');
 const sources=['a','b','c','d'].map(id=>({id,src:'/'+id,kind:'image'}));
 const project={brand:'Rumi',cta:'Explore',closingSeconds:0,scenes:['a','a','b','b','a','b'].map((id,i)=>({id:'scene-'+i,src:'/'+id,kind:'image',headline:'Headline '+i,detail:'Caption '+i,seconds:2}))};
 let serial=0;const result=lib.selectThreeReelPhotos(project,sources,()=> 'new-'+serial++);
 assert.deepEqual(Array.from(result.scenes,s=>s.src),['/a','/b','/c']);assert.deepEqual(Array.from(result.scenes,s=>s.seconds),[4,4,4]);assert.equal(result.closingSeconds,3);
 assert.equal(result.scenes[0].headline,'Headline 0');assert.equal(result.scenes[1].detail,'Caption 2');assert.equal(new Set(result.scenes.map(s=>s.id)).size,3);assert.equal(project.scenes.length,6);assert.equal(sources.length,4);
});
test('automatic selection uses fewer available photos without repeats, excludes clips and unverified new product photos',()=>{
 const lib=load('lib/reels/source-library.ts');
 const empty={scenes:[],closingSeconds:3,productSubject:'Exact Guitar'};
 const sources=[{id:'wrong',src:'/wrong',kind:'image'},{id:'a',src:'/a',kind:'image',productVerified:true},{id:'duplicate',src:'/a',kind:'image',productVerified:true},{id:'b',src:'/b',kind:'image',productVerified:true},{id:'video',src:'/clip',kind:'video',productVerified:true}];
 const result=lib.selectThreeReelPhotos(empty,sources,()=>Math.random().toString());
 assert.deepEqual(Array.from(result.scenes,s=>s.src),['/a','/b']);assert.deepEqual(Array.from(result.scenes,s=>s.seconds),[6,6]);
 assert.equal(lib.selectThreeReelPhotos(empty,[],()=> 'none'),empty);
 const clip={...empty,scenes:[{id:'clip',src:'/clip',kind:'video',seconds:15,headline:'Presenter',detail:''}]};
 assert.equal(lib.selectThreeReelPhotos(clip,[sources[4]],()=> 'none'),clip);
});
test('automatic selection recognizes two saved URLs or resized versions of the same picture',()=>{
 const lib=load('lib/reels/source-library.ts');
 const sources=['/api/reels/media?assetId=a','/api/reels/media?campaignId=old&assetId=a&thumbnail=1','https://photos.example/b.jpg?w=300','https://photos.example/b.jpg?w=1200','/third.jpg'].map((src,i)=>({id:String(i),src,kind:'image'}));
 const result=lib.selectThreeReelPhotos({scenes:[],closingSeconds:3},sources,()=>Math.random().toString());
 assert.deepEqual(Array.from(result.scenes,s=>s.src),[sources[0].src,sources[2].src,sources[4].src]);
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

test('library marks flagged photos for manual review and automatic three-photo selection skips them',async()=>{
 const f=fixture();f.state.assets[0].metadata={photoReview:{status:'failed'}};f.state.assets[1].metadata={photoReview:{status:'passed'}};
 const response=await f.api.GET(f.request());assert.equal(response.body.sources[0].reviewRequired,true);assert.equal(response.body.sources[1].reviewRequired,false);
 const lib=load('lib/reels/source-library.ts');const project={scenes:[],closingSeconds:3};
 const chosen=lib.selectThreeReelPhotos(project,response.body.sources,()=>Math.random().toString());assert.ok(chosen.scenes.every(scene=>scene.src!==response.body.sources[0].src));
});

test('saved clip links are restricted to private Rumi video endpoints and strip download parameters',()=>{
 const {savedClipPath}=load('lib/reels/source-library.ts');
 assert.equal(savedClipPath('https://app.test/api/video/file?jobId=abc-123&download=1','https://app.test'),'/api/video/file?jobId=abc-123');
 assert.equal(savedClipPath('/api/ai-lab/file?jobId=veo1','https://app.test'),'/api/ai-lab/file?jobId=veo1');
 assert.equal(savedClipPath('/api/video/media/saved1?download=1','https://app.test'),'/api/video/media/saved1');
 for(const url of ['https://evil.test/api/video/file?jobId=x','https://a:b@app.test/api/video/file?jobId=x','/api/video/file','/api/video/file?jobId=../secret','/api/admin','javascript:alert(1)','/api/reels/media?assetId=x'])assert.throws(()=>savedClipPath(url,'https://app.test'));
});
