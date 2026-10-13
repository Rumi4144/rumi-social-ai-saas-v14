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
const timeline = load('lib/reels/timeline.ts');
const screenshotPlan='Concise 15-second lifestyle reel. Scene 1, 0–3 seconds: close shot of restless hands beside a closed laptop; on-screen text, “When your thoughts feel busy...” Scene 2, 3–7 seconds: wider view as the person looks around; text, “Notice where you are.” Scene 3, 7–11 seconds: feet resting naturally on the floor; text, “Feel what supports you.” Scene 4, 11–15 seconds: relaxed profile near a window; text, “Stay curious, not forceful.” End card: “Learn more about Master Mind Advanced Hypnosis.”';
test('campaign scene plan opens four timed scenes with concise captions and a fifteen-second total',()=>{
 const context=load('lib/reels/post-context.ts');
 const data={brand:{name:'Master Mind',website:'https://mind.example',color:'#123456',accent:'#abcdef'},posts:[{id:'own',headline:'Post heading',caption:'A long full social caption',visualDirection:screenshotPlan}],sources:[{id:'foreign',src:'/foreign',kind:'image',contentItemId:'other'},{id:'photo',src:'/own',kind:'image',contentItemId:'own'}]};
 const result=context.selectedPostProject(data,'own').project;
 assert.equal(result.scenes.length,4);assert.deepEqual(Array.from(result.scenes,s=>s.seconds),[3,4,4,4]);assert.equal(timeline.reelDuration(result),15);
 assert.equal(result.scenes[0].headline,'When your thoughts feel busy...');assert.equal(result.scenes[0].detail,'');assert.match(result.scenes[0].direction,/restless hands/);
 assert.ok(result.scenes.every(s=>s.src==='/own'));assert.equal(result.closingSeconds,0);
 const last=timeline.frameAt(result,15);assert.equal(last.closing,false);assert.equal(last.progress,1);
});
test('scene parser rejects incomplete, overlapping and oversized plans rather than inventing timing',()=>{
 const parser=load('lib/reels/scene-plan.ts');
 assert.equal(parser.parseReelScenePlan('Scene 1, 0–3 seconds: hello. Scene 2, 2–7 seconds: overlap'),null);
 assert.equal(parser.parseReelScenePlan('Scene 2, 0–3 seconds: missing first'),null);
 assert.equal(parser.parseReelScenePlan('x'.repeat(17000)),null);
 assert.equal(parser.parseReelScenePlan('A regular photo direction'),null);
 assert.equal(parser.parseReelScenePlan('Scene 1, 0–3 seconds: photo; text, "Don\'t rush."').scenes[0].headline,"Don't rush.");
});
test('reel project reads the saved plan only for the active organization and matching post',async()=>{
 let query;
 const api=load('app/api/reels/project/route.ts',{
  'next/server':{NextResponse:{json:body=>body}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'master-mind'})},
  '@/lib/prisma':{prisma:{campaign:{findFirst:async()=>({id:'campaign',title:'Campaign',brand:{id:'brand',name:'Master Mind'},items:[{id:'own',type:'reel_post',headline:'Own',caption:'Caption'}]})},mediaAsset:{findMany:async()=>[]},job:{findFirst:async q=>{query=q;return {result:{posts:[{type:'reel_post',headline:'Own',caption:'Caption',visualDirection:screenshotPlan}]}};}}}},
 });
 const result=await api.GET(new Request('https://app.test/api/reels/project?campaignId=campaign&contentItemId=own'));
 assert.equal(query.where.organizationId,'master-mind');assert.equal(query.where.payload.equals,'campaign');assert.equal(result.posts[0].visualDirection,screenshotPlan);
});
test('reel crosses scene boundaries and closes after all scenes', () => {
  const project = { scenes: [{seconds:3},{seconds:5}], closingSeconds:3 };
  assert.equal(timeline.reelDuration(project),11);
  assert.equal(timeline.frameAt(project,2.99).index,0);
  assert.equal(timeline.frameAt(project,3).index,1);
  assert.equal(timeline.frameAt(project,8).closing,true);
  assert.equal(timeline.frameAt(project,20).progress,1);
});
test('long caption tokens wrap within the frame and truncate visibly', () => {
  const lines = timeline.wrappedLines('averyveryverylongword with more words here', 8, s=>s.length, 3);
  assert.equal(lines.length,3); assert.ok(lines.every(s=>s.length<=8)); assert.ok(lines[2].endsWith('…'));
  assert.equal(timeline.recorderMime(m=>m==='video/webm'),'video/webm');
  assert.equal(timeline.recorderMime(()=>false),null);
});
test('private reel paths cannot cross workspaces or posts', () => {
  const storage = load('lib/reels/storage.ts');
  const p='reels/org-a/post-a/12345678-1234-1234-1234-123456789abc.mp4';
  assert.equal(storage.privateReelPath(p,'org-a','post-a'),true);
  assert.equal(storage.privateReelPath(p,'org-b','post-a'),false);
  assert.equal(storage.privateReelPath(p,'org-a','post-b'),false);
  assert.equal(storage.privateReelPath(p.replace('12345678','../12345678'),'org-a','post-a'),false);
});
test('private video ranges return only requested bytes and reject invalid ranges', async () => {
  const api=load('lib/video/private-response.ts',{'@vercel/blob':{get:async()=>({statusCode:200,blob:{size:8},stream:new ReadableStream({start(c){c.enqueue(new Uint8Array([0,1,2,3]));c.enqueue(new Uint8Array([4,5,6,7]));c.close();}})})}});
  for (const [range, expected] of [['bytes=2-5',[2,3,4,5]],['bytes=-2',[6,7]],['bytes=5-',[5,6,7]]]) {
    const r=await api.privateVideoResponse(new Request('https://app.test/video',{headers:{range}}),'owned','video/mp4','reel.mp4');
    assert.equal(r.status,206);assert.deepEqual([...new Uint8Array(await r.arrayBuffer())],expected);
  }
  const r=await api.privateVideoResponse(new Request('https://app.test/video',{headers:{range:'bytes=99-'}}),'owned','video/mp4','reel.mp4');assert.equal(r.status,416);
});
test('reel upload signs ownership and completion stays in that campaign', async () => {
 let hooks, saved;
 const response={NextResponse:{json:body=>body}};
 const api=load('app/api/reels/upload/route.ts',{
  '@vercel/blob/client':{handleUpload:async h=>{hooks=h;return{};}},'next/server':response,
  '@/lib/auth/context':{tenantContext:async()=>({organizationId:'org-a',role:'owner'})},
  '@/lib/prisma':{prisma:{contentItem:{findFirst:async q=>q.where.campaign.brand.organizationId==='org-a'?{id:'post-a'}:null},mediaAsset:{upsert:async q=>{saved=q;}}}},
  '@/lib/http/errors':{apiError:e=>{throw e;}}
 });
 await api.POST({json:async()=>({})});
 const pathname='reels/org-a/post-a/12345678-1234-1234-1234-123456789abc.mp4';
 const payload=JSON.stringify({campaignId:'campaign-a',contentItemId:'post-a',title:'Demo',duration:9});
 await assert.rejects(hooks.onBeforeGenerateToken(pathname.replace('org-a','org-b'),payload));
 const token=await hooks.onBeforeGenerateToken(pathname,payload);
 await assert.rejects(hooks.onUploadCompleted({blob:{pathname:pathname.replace('org-a','org-b')},tokenPayload:token.tokenPayload}));
 await hooks.onUploadCompleted({blob:{pathname},tokenPayload:token.tokenPayload});
 assert.equal(saved.create.organizationId,'org-a');assert.equal(saved.create.contentItemId,'post-a');assert.equal(saved.create.metadata.publishMode,'review');
});
test('editor cannot load another workspace campaign or its images', async () => {
 let where;
 const api=load('app/api/reels/project/route.ts',{
  'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},
  '@/lib/auth/context':{tenantContext:async()=>({organizationId:'org-a'})},
  '@/lib/prisma':{prisma:{campaign:{findFirst:async q=>{where=q.where;return null;}},mediaAsset:{findMany:async()=>{throw Error('must not query assets');}}}},
  '@/lib/http/errors':{apiError:e=>{throw e;}}
 });
 const result=await api.GET(new Request('https://app.test/api/reels/project?campaignId=other-campaign'));
 assert.equal(result.status,404);assert.equal(where.brand.organizationId,'org-a');
});
test('weekly plan stays on seven calendar dates across daylight savings and rotates real sources',()=>{
 const week=load('lib/reels/week.ts');
 const project={brand:'Rumi',website:'https://example.test',style:'gallery',closingSeconds:3,scenes:[{id:'a',src:'/real-a',kind:'image',seconds:4,headline:'Actual A',detail:''},{id:'b',src:'/real-b',kind:'video',seconds:5,headline:'Actual B',detail:''}]};
 const days=week.makeWeek(project,'2026-10-31');assert.equal(days.length,7);assert.equal(days[6].date,'2026-11-06');assert.equal(new Set(days.map(d=>d.headline)).size,7);assert.equal(new Set(days.map(d=>d.project.style)).size,6);assert.equal(days[1].project.scenes[0].src,'/real-b');assert.ok(days.every(d=>d.project.scenes.every(s=>['/real-a','/real-b'].includes(s.src))));assert.throws(()=>week.weekDates('2026-02-30'));assert.throws(()=>week.makeWeek({...project,scenes:[]},'2026-10-04'));
});
test('weekly creation claims once, makes seven draft posts, and refuses foreign campaigns',async()=>{
 let claimed,created=0,scheduled=0;
 const tx={job:{findFirst:async()=>claimed,create:async q=>{claimed={payload:q.data.payload};},update:async q=>{claimed.result=q.data.result;}},contentItem:{create:async q=>{assert.equal(q.data.status,'draft');assert.equal(q.data.platform,'facebook');created++;return{id:`day-${created}`};}},publishJob:{create:async()=>scheduled++}};
 const api=load('app/api/reels/week/route.ts',{'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'org',role:'owner'})},'@/lib/prisma':{prisma:{campaign:{findFirst:async q=>q.where.id==='own'&&q.where.brand.organizationId==='org'?{id:'own'}:null},$transaction:async fn=>fn(tx)}},'@/lib/http/errors':{apiError:e=>{throw e;}}});
 const p={requestId:'12345678-1234-4234-8234-123456789abc',campaignId:'own',startDate:'2026-10-04',days:Array.from({length:7},(_,i)=>({headline:`Day ${i}`,caption:'Grounded'}))};
 const first=await api.POST({json:async()=>p});assert.equal(first.body.days.length,7);await api.POST({json:async()=>p});assert.equal(created,7);assert.equal(scheduled,0);const foreign=await api.POST({json:async()=>({...p,campaignId:'foreign'})});assert.equal(foreign.status,404);
});

test('collage and split layouts never repeat a source to fill panels', () => {
 const scenes=[{src:'/one'},{src:'/one'},{src:'/two'},{src:'/three'}];
 assert.deepEqual([...timeline.distinctSceneIndexes([{src:'/one'}],0)],[0]);
 assert.deepEqual([...timeline.distinctSceneIndexes(scenes,0)],[0,2,3]);
 assert.deepEqual([...timeline.distinctSceneIndexes(scenes,2,2)],[2,3]);
 assert.equal(timeline.REEL_STYLES.length,6);
});
test('gallery extraction ignores related products and deduplicates resized photos', () => {
 const photos=load('lib/reels/product-photos.ts');
 const html=`<div class="woocommerce-product-gallery gallery"><div><a href="/uploads/front.jpg"><img src="/uploads/front-300x300.jpg"></a></div><div><img data-large_image="/uploads/back.jpg" src="/uploads/back-100x100.jpg"></div></div><div class="related"><img src="/uploads/unrelated.jpg"></div>`;
 assert.deepEqual([...photos.extractProductPhotos(html,'https://shop.test/product/a')],['https://shop.test/uploads/front.jpg','https://shop.test/uploads/back.jpg']);
 assert.notEqual(photos.photoKey('https://cdn.test/image?id=front'),photos.photoKey('https://cdn.test/image?id=back'));
 assert.equal(photos.photoKey('https://cdn.test/front.jpg?w=300'),photos.photoKey('https://cdn.test/front.jpg?w=800'));
 assert.equal(photos.cleanPhotoUrl('http://localhost/file','https://shop.test'),null);
 assert.equal(photos.cleanPhotoUrl('https://user:pass@shop.test/file','https://shop.test'),null);
});
test('structured gallery selects the matching product and avoids unrelated images', () => {
 const photos=load('lib/reels/product-photos.ts');
 const data={'@graph':[{'@type':'Product',url:'https://shop.test/product/a',image:['/a.jpg',{'@type':'ImageObject',url:'/b.jpg'}]},{'@type':'Product',url:'https://shop.test/product/other',image:'/other.jpg'}]};
 assert.deepEqual([...photos.extractProductPhotos(`<script type="application/ld+json">${JSON.stringify(data)}</script>`,'https://shop.test/product/a')],['https://shop.test/a.jpg','https://shop.test/b.jpg']);
 assert.deepEqual([...photos.extractProductPhotos('<img src="/unrelated.jpg">','https://shop.test/product/a')],[]);
});
test('product inference uses selected post and brand, and asks when ambiguous', () => {
 const photos=load('lib/reels/product-photos.ts');
 const products=[{name:'Actual product',sourceUrl:'https://shop.test/product/a',imageUrl:null}];
 assert.equal(photos.productPageForPost({headline:'Actual product | Brand',caption:''},'https://shop.test',products),'https://shop.test/product/a');
 assert.equal(photos.productPageForPost({headline:'Campaign',caption:'https://another-business.test/product/a'},'https://shop.test',products),null);
 assert.equal(photos.productPageForPost({headline:'Campaign',caption:'https://shop.test/product/a https://shop.test/product/b'},'https://shop.test',products),null);
 assert.equal(photos.pageBelongsToBrand('https://shop.test.evil.test/product/a','https://shop.test',products),false);
});
test('photo library restoration keeps unused uploads and excludes another post', () => {
 const library=load('lib/reels/source-library.ts');
 const draft={sources:[{id:'a',src:'blob:old',kind:'image',contentItemId:'post-a'},{id:'b',src:'/foreign',kind:'image',contentItemId:'post-b'},{id:'c',src:'blob:missing',kind:'image',contentItemId:'post-a'}],project:{scenes:[]}};
 const result=library.restoreLibrary(draft,new Map([['blob:old','blob:new']]),'post-a');
 assert.equal(result.length,1);assert.equal(result[0].src,'blob:new');
 assert.equal(library.mergeSources(result,result).length,1);
});
test('product photos require post ownership, stay scoped, and import idempotently', async () => {
 let role='owner',found=true,fetches=0; const writes=[];
 const api=load('app/api/reels/photos/route.ts',{
  'next/server':{NextResponse:{json:(body,options={})=>({body,status:options.status||200})}},
  '@/lib/auth/context':{tenantContext:async()=>({organizationId:'org-a',role})},
  '@/lib/http/errors':{apiError:e=>({status:e.message==='FORBIDDEN'?403:500})},
  '@/lib/reels/public-fetch':{fetchPublicBytes:async()=>{fetches++;return{contentType:'text/html',bytes:Buffer.from('<div class="woocommerce-product-gallery"><img src="/a.jpg"><img src="/b.jpg"></div>')};}},
  '@/lib/prisma':{prisma:{contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'org-a');assert.equal(q.where.campaignId,'campaign-a');return found?{id:'post-a',headline:'A',caption:'https://shop.test/product/a',campaign:{brand:{websiteUrl:'https://shop.test',products:[]}}}:null;}},mediaAsset:{upsert:async q=>writes.push(q)}}}
 });
 const req=url=>({json:async()=>({campaignId:'campaign-a',contentItemId:'post-a',...(url?{url}:{})})});
 found=false;assert.equal((await api.POST(req())).status,404);assert.equal(fetches,0);
 found=true;role='viewer';assert.equal((await api.POST(req())).status,403);assert.equal(fetches,0);
 role='owner';assert.equal((await api.POST(req('https://other-business.test/product/a'))).status,400);assert.equal(fetches,0);
 const first=await api.POST(req());const again=await api.POST(req());
 assert.equal(first.body.sources.length,2);assert.equal(first.body.sources[0].id,again.body.sources[0].id);
 assert.ok(writes.every(q=>q.create.organizationId==='org-a'&&q.create.contentItemId==='post-a'&&q.create.campaignId==='campaign-a'&&q.create.kind==='product_photo'));
});
test('public photo fetch rejects private hosts before making a request', async () => {
 let requested=0;
 const api=load('lib/reels/public-fetch.ts',{'node:dns/promises':{lookup:async()=>[{address:'127.0.0.1',family:4}]},'node:https':{request:()=>{requested++;}}});
 await assert.rejects(api.fetchPublicBytes('https://private.test/product/a',1000));assert.equal(requested,0);
 for(const address of ['127.0.0.1','10.1.2.3','192.168.1.1','169.254.169.254','100.64.0.1','::1','::ffff:127.0.0.1','2001:db8::1']) assert.equal(api.publicAddress(address),false,address);
 assert.equal(api.publicAddress('8.8.8.8'),true);
});
test('product photo proxy enforces organization ownership', async () => {
 let where,downloads=0;
 class ResponseMock { constructor(body,options={}) { this.body=body;this.status=options.status||200; } }
 const api=load('app/api/reels/media/route.ts',{
  'next/server':{NextResponse:ResponseMock},
  '@/lib/auth/context':{tenantContext:async()=>({organizationId:'org-a'})},
  '@/lib/prisma':{prisma:{mediaAsset:{findFirst:async q=>{where=q.where;return null;}}}},
  '@/lib/reels/public-fetch':{fetchPublicBytes:async()=>{downloads++;}},
  '@/lib/http/errors':{apiError:e=>{throw e;}}
 });
 assert.equal((await api.GET(new Request('https://app.test/api/reels/media?assetId=foreign'))).status,404);
 assert.equal(where.organizationId,'org-a');assert.ok(where.kind.in.includes('product_photo'));assert.equal(downloads,0);
});
test('multiple uploads validate every file, preserve order and respect library and scene limits', () => {
 const library=load('lib/reels/source-library.ts');
 const files=[{name:'a.png',type:'image/png',size:50},{name:'bad',type:'text/html',size:10},{name:'b.jpg',type:'image/jpeg',size:50},{name:'too-big',type:'video/mp4',size:100000001},{name:'c.webp',type:'image/webp',size:80}];
 const selection=library.uploadSelection(files,28);
 assert.deepEqual([...selection.selected].map(f=>f.name),['a.png','b.jpg']);assert.equal(selection.invalid,2);assert.equal(selection.overflow,1);
 const project={scenes:Array.from({length:5},(_,i)=>({id:`existing-${i}`,src:`existing-${i}`}))};
 const result=library.appendScenes(project,[{id:'a',src:'new-a',kind:'image'},{id:'b',src:'new-b',kind:'image'}],()=> 'new-id');
 assert.equal(result.scenes.length,6);assert.equal(result.scenes[5].src,'new-a');assert.equal(project.scenes.length,5);
});

test('every music style produces distinct, finite audio with safe peaks and faded edges', () => {
 const music=load('lib/reels/music.ts'), fingerprints=new Set();
 for (const style of music.SYNTH_MUSIC_STYLES) {
  const samples=music.musicSamples(style.value,7,8000);
  assert.equal(samples.length,56000);assert.equal(Math.abs(samples[0]),0);assert.equal(Math.abs(samples.at(-1)),0);
  let peak=0,energy=0;
  for (const value of samples) {assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));energy+=value*value;}
  assert.ok(peak<=.801);assert.ok(Math.sqrt(energy/samples.length)>.02,`${style.value} should be audible`);
  fingerprints.add(require('node:crypto').createHash('sha256').update(Buffer.from(samples.buffer)).digest('hex'));
 }
 assert.equal(fingerprints.size,12);
 assert.throws(()=>music.musicSamples('jazz',Infinity));assert.throws(()=>music.musicSamples('jazz',181));
});
test('old audio drafts migrate while current choices and disabled music are respected', () => {
 const music=load('lib/reels/music.ts');
 assert.equal(music.musicSettings({music:true}).musicStyle,'ambient');
 const legacy=music.musicSettings({music:false,musicFile:{}});assert.equal(legacy.musicStyle,'custom');assert.equal(legacy.music,true);
 const current=music.musicSettings({music:false,musicStyle:'jazz',musicFile:{},musicVolume:60});
 assert.equal(current.music,false);assert.equal(current.musicStyle,'jazz');assert.equal(current.musicVolume,60);
 assert.equal(music.musicSettings({music:true,musicVolume:Infinity}).musicVolume,35);
 assert.equal(music.musicSettings({music:true,musicVolume:500}).musicVolume,100);
});
function musicContext() {
 const nodes=[], levels=[];
 const context={currentTime:10,state:'running',decoded:0,createBuffer:(_,length)=>({getChannelData:()=>new Float32Array(length)}),decodeAudioData:async()=>{context.decoded++;return{duration:1};},createBufferSource:()=>{const node={started:[],stops:[],disconnected:false,connect:other=>other,disconnect(){this.disconnected=true;},start(at){this.started.push(at);},stop(at){this.stops.push(at);}};nodes.push(node);return node;},createGain:()=>({connect:other=>other,disconnect(){},gain:{setValueAtTime(value,at){levels.push([value,at]);},linearRampToValueAtTime(value,at){levels.push([value,at]);}}})};
 return {context,nodes,levels};
}
test('Spanish Romance loads the bundled recording before playback and loops for long reels', async () => {
 const requests=[], controller=new AbortController();
 const music=load('lib/reels/music.ts',{__fetch:async (url,options)=>{requests.push([url,options.signal]);return new Response(new Uint8Array([1,2,3]));}});
 const {context,nodes}=musicContext();
 const begin=await music.prepareMusic(context,{}, {music:true,musicStyle:'classical'},180,controller.signal);
 assert.equal(requests[0][0],'/music/spanish-romance.mp3');assert.equal(requests[0][1],controller.signal);
 assert.equal(context.decoded,1);assert.equal(nodes.length,0);
 const stop=begin();assert.equal(nodes[0].loop,true);assert.equal(nodes[0].stops[0],190);stop();
 assert.ok(fs.statSync(path.join(root,'public/music/spanish-romance.mp3')).size>1000000);
});
test('missing Spanish Romance recording fails clearly instead of exporting silent music', async () => {
 const music=load('lib/reels/music.ts',{__fetch:async()=>new Response(null,{status:404})});
 const {context,nodes}=musicContext();
 await assert.rejects(music.prepareMusic(context,{}, {music:true,musicStyle:'classical'},7),/Could not load Spanish Romance/);
 assert.equal(context.decoded,0);assert.equal(nodes.length,0);
});
test('every recorded choice uses its own bundled file and survives draft restoration', async () => {
 const requests=[];
 const music=load('lib/reels/music.ts',{__fetch:async url=>{requests.push(url);return new Response(new Uint8Array([1,2,3]));}});
 const styles=Object.keys(music.RECORDED_MUSIC);
 assert.equal(styles.length,7);assert.equal(new Set(styles.map(style=>music.recordedMusic(style).file)).size,7);
 for (const style of styles) {
  const track=music.recordedMusic(style), {context,nodes}=musicContext();
  assert.equal(music.musicSettings({music:true,musicStyle:style}).musicStyle,style);
  const stop=await music.startMusic(context,{}, {music:true,musicStyle:style},12);
  assert.equal(requests.at(-1),track.file);assert.equal(context.decoded,1);assert.equal(nodes[0].loop,true);stop();
  assert.ok(fs.statSync(path.join(root,'public',track.file)).size>100000);
 }
 assert.equal(music.recordedMusic('jazz'),undefined);assert.equal(music.recordedMusic('custom'),undefined);
 assert.equal(music.recordedMusic('toString'),undefined);
});
test('cancelled recorded music decoding does not start playback', async () => {
 const controller=new AbortController();
 const music=load('lib/reels/music.ts',{__fetch:async()=>new Response(new Uint8Array([1,2,3]))});
 const {context,nodes}=musicContext();
 context.decodeAudioData=async()=>{controller.abort();return{};};
 await music.startMusic(context,{}, {music:true,musicStyle:'bach-aria'},12,controller.signal);
 assert.equal(nodes.length,0);
});
test('music prepares before recording, then starts at the selected volume and stops on cancellation', async () => {
 const music=load('lib/reels/music.ts'), {context,nodes,levels}=musicContext(), controller=new AbortController();
 const begin=await music.prepareMusic(context,{}, {music:true,musicStyle:'flamenco',musicVolume:55},3,controller.signal);
 assert.equal(nodes.length,0);const stop=begin();assert.deepEqual(nodes[0].started,[10]);assert.ok(levels.some(([level])=>level===.55));
 assert.equal(nodes[0].loop,false);assert.equal(nodes[0].stops[0],13);
 controller.abort();assert.equal(nodes[0].disconnected,true);const stops=nodes[0].stops.length;stop();assert.equal(nodes[0].stops.length,stops);
});
test('disabled music is silent and an uploaded file never overrides a selected built-in style', async () => {
 const music=load('lib/reels/music.ts'), {context,nodes}=musicContext();
 const file={arrayBuffer:async()=>{throw Error('must not read unused upload');}};
 for (const settings of [{music:false,musicStyle:'custom',musicFile:file},{music:true,musicStyle:'jazz',musicVolume:0}]) (await music.prepareMusic(context,{},settings,3))();
 assert.equal(nodes.length,0);
 const stop=await music.startMusic(context,{}, {music:true,musicStyle:'country',musicFile:file},3);assert.equal(context.decoded,0);assert.equal(nodes.length,1);stop();
});
test('custom music loops, requires a file, and cancelled decoding cannot start late playback', async () => {
 const music=load('lib/reels/music.ts'), {context,nodes}=musicContext();
 await assert.rejects(music.startMusic(context,{}, {music:true,musicStyle:'custom'},3),/Choose your music file/);
 const file={arrayBuffer:async()=>new ArrayBuffer(1)};
 const stop=await music.startMusic(context,{}, {music:true,musicStyle:'custom',musicFile:file},3);assert.equal(nodes[0].loop,true);stop();
 const controller=new AbortController();context.decodeAudioData=async()=>{controller.abort();return{};};
 await music.startMusic(context,{}, {music:true,musicStyle:'custom',musicFile:file},3,controller.signal);assert.equal(nodes.length,1);
});
