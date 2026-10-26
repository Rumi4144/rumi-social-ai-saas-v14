const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');const root=path.resolve(__dirname,'..');
function load(file,mocks={},cache=new Map()){file=path.resolve(root,file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,Buffer,process,require:n=>n in mocks?mocks[n]:n.startsWith('@/')||n.startsWith('.')?load((n.startsWith('@/')?n.slice(2):path.relative(root,path.resolve(path.dirname(file),n)))+'.ts',mocks,cache):require(n)});return module.exports;}
const {renderSocialSvg}=load('lib/render/svg.ts');const {SHOWCASE_STYLES}=load('lib/render/showcase.ts');
const input={detailCrops:true,brand:'Rumi Guitars',headline:'Martinez MF-17',subheadline:'Explore the collection',imageUrl:'data:image/png;base64,AA=='};
test('new ad templates fit long copy, respect saved styles and never manufacture promotional claims',async()=>{
 const {automaticShowcaseStyle}=load('lib/render/showcase.ts');
 for(const style of ['modern-gradient','framed-editorial','geometric-focus']){
  assert.equal(automaticShowcaseStyle('post',style),style);
  const a=route({brandName:'A local business'}),response=await a.api.POST(request({designStyle:style}));assert.equal(response.status,200);
  for(const format of ['square','portrait','story']){
   const h=format==='square'?1080:format==='story'?1920:1350;
   const svg=renderSocialSvg({...input,format,designStyle:style,headline:'W'.repeat(200),subheadline:'A very detailed description '.repeat(20),cta:'Learn more',accentColor:'#fff1b8',primaryColor:'red" onload="bad'});
   assert.ok(!/onload=|NaN|undefined|35\+|clinical practice|guaranteed/.test(svg));
   assert.match(svg,/fill="#111827"/);assert.match(svg,/…/);
   const textNodes=[...svg.matchAll(/<text\b[^>]*\by="([\d.]+)"/g)].map(m=>Number(m[1]));
   assert.ok(textNodes.every(y=>y>=34&&y<h-45),'text stays on the canvas');
   // Only the call to action may occupy the bottom button area.
   assert.equal(textNodes.filter(y=>y>h-(format==='story'?170:62)-84).length,1);
  }
 }
 assert.equal(automaticShowcaseStyle('post','classic'),'classic');
 assert.equal(automaticShowcaseStyle('same-post'),automaticShowcaseStyle('same-post'));
});
test('seven distinct layouts preserve source images, safe dimensions and escaped text for every format',()=>{const seen=new Set();for(const style of SHOWCASE_STYLES)for(const [format,height] of [['square',1080],['portrait',1350],['story',1920]]){const svg=renderSocialSvg({...input,brand:'Rumi & <Guitars>',format,designStyle:style.value});assert.match(svg,new RegExp('height="'+height+'"'));assert.match(svg,/RUMI &amp; &lt;GUITARS&gt;/i);assert.match(svg,/preserveAspectRatio="xMidYMid meet"/);assert.ok(svg.includes(input.imageUrl));assert.ok(!svg.includes('Grand Guitar Salon'));assert.ok(!/Hauser|historic legacy/.test(svg));if(format==='portrait')seen.add(svg);}assert.equal(seen.size,7);});
test('additional views are supplied photos; a single photo uses two different labeled detail crops',()=>{const multiple=renderSocialSvg({...input,designStyle:'heritage',imageUrls:['https://own.example/back.jpg','https://own.example/detail.jpg']});assert.ok(multiple.includes('https://own.example/back.jpg'));assert.ok(multiple.includes('https://own.example/detail.jpg'));assert.match(multiple,/MORE VIEWS/);const single=renderSocialSvg({...input,designStyle:'heritage'});assert.match(single,/DETAIL STUDIES/);assert.ok(!single.includes('MORE VIEWS'));assert.match(single,/x="-118.4"/);});
test('long words and unsafe palette values cannot break poster markup',()=>{const svg=renderSocialSvg({...input,headline:'W'.repeat(150)+' <script>alert(1)</script>',designStyle:'gallery-story',primaryColor:'red" onload="bad',accentColor:'url(https://foreign.example)'});assert.ok(!svg.includes('onload='));assert.ok(!svg.includes('<script>'));assert.match(svg,/…/);});
const json=(body,options={})=>({body,status:options.status||200});
function route({missing=false,style='automatic',brandName='Rumi Guitars',logoUrl}={}){let writes=0,photoQuery,saved;const brand={id:'own-brand',name:brandName,designStyle:style,logoUrl};const api=load('app/api/creative/render/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'own'})},'@/lib/prisma':{prisma:{contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'own');return missing?null:{id:'post',campaignId:'camp',campaign:{brand}};}},mediaAsset:{findMany:async q=>{photoQuery=q;return[{url:'https://own.example/back.jpg'}];},findFirst:async()=>null,create:async q=>{writes++;saved=q.data;return{id:'saved'};}}}},'@/lib/render/raster':{imageToJpegDataUrl:async url=>url,logoToPngDataUrl:async url=>url?'data:image/png;base64,LOGO':undefined,svgToPublishJpeg:async()=>Buffer.from('mock jpeg')}});return{api,writes:()=>writes,query:()=>photoQuery,saved:()=>saved};}
const request=extra=>({json:async()=>({campaignId:'camp',contentItemId:'post',headline:'A guitar',imageUrl:'https://own.example/front.jpg',designStyle:'heritage',prepareOnly:true,...extra})});
test('render rejects foreign post before retrieving photos or saving',async()=>{const a=route({missing:true});assert.equal((await a.api.POST(request())).status,404);assert.equal(a.query(),undefined);assert.equal(a.writes(),0);});
test('preparation only uses photos attached to the owned post and never writes',async()=>{const a=route();const r=await a.api.POST(request());assert.equal(r.status,200);assert.equal(a.query().where.organizationId,'own');assert.equal(a.query().where.campaignId,'camp');assert.equal(a.query().where.contentItemId,'post');assert.equal(a.writes(),0);const svg=Buffer.from(r.body.svgDataUrl.split(',')[1],'base64').toString();assert.ok(svg.includes('https://own.example/back.jpg'));});
test('service brand uses its own name and retains classic design when explicitly selected',async()=>{const a=route({brandName:'Master Mind Advanced Hypnosis'});const r=await a.api.POST(request({designStyle:'classic'}));assert.equal(r.status,200);assert.equal(a.query(),undefined);const svg=Buffer.from(r.body.svgDataUrl.split(',')[1],'base64').toString();assert.ok(svg.includes('MASTER MIND ADVANCED HYPNOSIS'));assert.ok(!svg.includes('Rumi Guitars'));});

test('automatic creative variety applies to service, retail and other business workspaces',async()=>{for(const brandName of ['Master Mind Advanced Hypnosis','Rumi Guitars','Home services example','Restaurant example']){const a=route({brandName});const r=await a.api.POST(request({designStyle:'automatic'}));assert.equal(r.status,200);assert.equal(a.query().where.organizationId,'own');const svg=Buffer.from(r.body.svgDataUrl.split(',')[1],'base64').toString();assert.ok(svg.includes(brandName.toUpperCase()));if(brandName!=='Rumi Guitars')assert.ok(!svg.includes('RUMI GUITARS'));}});

test('people and service photos are kept whole unless detail cropping is explicitly requested',()=>{for(const style of SHOWCASE_STYLES){const svg=renderSocialSvg({...input,detailCrops:false,designStyle:style.value});assert.ok(!svg.includes('DETAIL STUDIES'));assert.ok(!svg.includes('slice'));assert.equal((svg.match(/<image /g)||[]).length,1);}});

test('cinematic design keeps real additional views, avoids invented heritage claims and supports service photos',()=>{
  for(const format of ['square','portrait','story']){
    const svg=renderSocialSvg({...input,designStyle:'cinematic',format,imageUrls:['https://own.example/back.jpg','https://own.example/detail.jpg']});
    assert.ok(svg.includes('https://own.example/back.jpg'));assert.ok(svg.includes('https://own.example/detail.jpg'));
    assert.match(svg,/Cormorant Garamond/);assert.match(svg,/ANOTHER VIEW/);assert.ok(!svg.includes('DETAIL STUDY'));
    assert.ok(!/Hauser|heritage|award|guaranteed/i.test(svg));assert.ok(!svg.includes('undefined'));assert.ok(!svg.includes('NaN'));
  }
  const service=renderSocialSvg({brand:'Your Practice',headline:'A space for reflection',imageUrl:input.imageUrl,designStyle:'cinematic',detailCrops:false});
  assert.equal((service.match(/<image /g)||[]).length,1);assert.ok(!service.includes('DETAIL STUDY'));assert.ok(!service.includes('ANOTHER VIEW'));
});

test('campaign preparation accepts the cinematic style with owned photos',async()=>{
  const a=route();const response=await a.api.POST(request({designStyle:'cinematic'}));assert.equal(response.status,200);
  const svg=Buffer.from(response.body.svgDataUrl.split(',')[1],'base64').toString();assert.match(svg,/cinema-light/);assert.ok(svg.includes('https://own.example/back.jpg'));assert.equal(a.writes(),0);
});


test('prepared template embeds the owned brand logo instead of leaving a remote image reference',async()=>{
 const a=route({logoUrl:'https://own.example/logo.png'});
 const response=await a.api.POST(request({designStyle:'modern-gradient'}));
 assert.equal(response.status,200);
 const svg=Buffer.from(response.body.svgDataUrl.split(',')[1],'base64').toString();
 assert.ok(svg.includes('data:image/png;base64,LOGO'));
 assert.ok(!svg.includes('https://own.example/logo.png'));
});
test('saved creative metadata records the actual automatic or explicitly selected style',async()=>{
 const {automaticShowcaseStyle}=load('lib/render/showcase.ts');
 for(const [preferred,selection,expected] of [['classic','automatic','classic'],['modern-gradient','automatic','modern-gradient'],['automatic','automatic',automaticShowcaseStyle('post')],['modern-gradient','framed-editorial','framed-editorial']]){
  const a=route({style:preferred});
  const result=await a.api.POST(request({designStyle:selection,prepareOnly:false}));
  assert.equal(result.status,200);assert.equal(a.saved().metadata.designStyle,expected);assert.equal(a.saved().organizationId,'own');
 }
});
test('logo embedding preserves transparency and falls back when a logo cannot be fetched',async()=>{
 const sharp=require('sharp');
 const raster=load('lib/render/raster.ts');
 const bytes=await sharp({create:{width:8,height:8,channels:4,background:{r:30,g:60,b:90,alpha:0}}}).png().toBuffer();
 const embedded=await raster.logoToPngDataUrl('data:image/png;base64,'+bytes.toString('base64'));
 assert.match(embedded,/^data:image\/png;base64,/);
 const {data}=await sharp(Buffer.from(embedded.split(',')[1],'base64')).raw().toBuffer({resolveWithObject:true});
 assert.equal(data[3],0);
 assert.equal(await raster.logoToPngDataUrl('data:image/png;base64,invalid'),undefined);
 assert.equal(await raster.logoToPngDataUrl(null),undefined);
});

test('campaign worker embeds owned logos and persists the chosen template in generated creative metadata',async()=>{
 const before=process.env.WORKER_SECRET;process.env.WORKER_SECRET='template-worker';
 try {
  const {automaticShowcaseStyle}=load('lib/render/showcase.ts');
  for(const preference of ['automatic','classic','modern-gradient']){
   let rendered,saved;
   const brand={id:'brand',name:'Local Practice',designStyle:preference,logoUrl:'https://own.example/logo.png'};
   const campaign={id:'camp',brand};
   const post={id:'owned-post',campaignId:'camp',type:'post',headline:'A quiet moment',campaign};
   const job={id:'job',organizationId:'own',status:'queued',type:'GENERATE_IMAGE',payload:{campaignId:'camp',contentItemId:post.id,sourceImageUrl:'https://own.example/service.jpg'}};
   const api=load('app/api/jobs/run/route.ts',{
    'next/server':{NextResponse:{json}},openai:class {},
    '@/lib/auth/context':{},'@/lib/ai/campaign':{},
    '@/lib/ai/visual-history':{recentBrandConcepts:async()=>[],regenerationVariationIndex:()=>0},
    '@/lib/ai/visual-director':{buildVisualDirection:()=> 'Use this business photo'},
    '@/lib/ai/visual-plan':{isSubjectCategory:()=>false},
    '@/lib/render/showcase':{automaticShowcaseStyle},
    '@/lib/render/svg':{renderSocialSvg:input=>{rendered=input;return '<svg/>';}},
    '@/lib/render/raster':{imageToJpegDataUrl:async()=> 'data:image/jpeg;base64,PHOTO',logoToPngDataUrl:async url=>{assert.equal(url,brand.logoUrl);return 'data:image/png;base64,LOGO';},svgToPublishJpeg:async()=>Buffer.from('jpeg')},
    '@/lib/creative/image-history':{saveGeneratedPhoto:async data=>({id:'photo',url:data.url})},
    '@/lib/prisma':{prisma:{
     job:{findFirst:async q=>q.where.type==='GENERATE_IMAGE'?job:null,updateMany:async()=>({count:1}),update:async()=>({})},
     contentItem:{findUnique:async q=>{if(q.include)assert.equal(q.where.campaign.brand.organizationId,'own');return post;},update:async()=>({})},
     campaign:{findUnique:async()=>campaign},
     mediaAsset:{findFirst:async()=>null,create:async q=>{saved=q.data;return {id:'creative'};}}
    }},
   });
   const response=await api.POST({headers:{get:()=> 'template-worker'},json:async()=>({organizationId:'own'})});
   assert.equal(response.status,200);assert.equal(response.body.status,'succeeded');
   assert.equal(rendered.logoUrl,'data:image/png;base64,LOGO');assert.equal(rendered.brand,brand.name);
   assert.equal(rendered.designStyle,automaticShowcaseStyle(post.id,preference));
   assert.equal(saved.metadata.designStyle,rendered.designStyle);assert.equal(saved.organizationId,'own');assert.equal(saved.contentItemId,post.id);
  }
 } finally {if(before===undefined)delete process.env.WORKER_SECRET;else process.env.WORKER_SECRET=before;}
});
