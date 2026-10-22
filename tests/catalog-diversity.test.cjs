const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={},cache=new Map()){file=path.resolve(root,file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,Buffer,URL,process,require:n=>n in mocks?mocks[n]:n.startsWith('@/')||n.startsWith('.')?load((n.startsWith('@/')?n.slice(2):path.relative(root,path.resolve(path.dirname(file),n)))+'.ts',mocks,cache):require(n)});return module.exports;}
const home='https://store.example/';
const products=[...Array.from({length:12},(_,i)=>({name:'MakerA Model A'+i,permalink:home+'product/a'+i,images:[{src:home+'a'+i+'.jpg'},{src:home+'a'+i+'-back.jpg'}]})),...['MakerB','MakerC','MakerD','MakerE','MakerF','MakerG','MakerH','MakerI','MakerJ','MakerK'].map((name,i)=>({name:name+' Model B'+i,permalink:home+'product/b'+i,images:[{src:home+'b'+i+'.jpg'}]}))];
const fetcher=async url=>url===home?{contentType:'text/html',bytes:Buffer.from('<h1>Our store</h1><script src="/wp-content/shop.js"></script>')}:{contentType:'application/json',bytes:Buffer.from(JSON.stringify(products))};
const mocks={'@/lib/reels/public-fetch':{fetchPublicBytes:fetcher}};
test('WordPress storefront pages over 500 KB still reach their product catalog within a finite limit',async()=>{
 const html='<h1>Our Store</h1><script src="/wp-content/shop.js"></script>'+ ' '.repeat(523237);
 const helper=load('lib/campaign/website-topics.ts',{'@/lib/reels/public-fetch':{fetchPublicBytes:async(url,maxBytes)=>{
  const bytes=Buffer.from(url===home?html:JSON.stringify(products));
  assert.ok(maxBytes<=4_000_000);if(bytes.length>maxBytes)throw Error('page too large');
  return {contentType:url===home?'text/html':'application/json',bytes};
 }}});
 const ideas=await helper.websiteBriefSuggestions('Our Store',home);
 assert.equal(ideas.length,22);assert.equal(ideas[1].label,'MakerB Model B0');
});
test('full catalog topics interleave product families and retain exact product source pages',async()=>{
 const helper=load('lib/campaign/website-topics.ts',mocks);const ideas=await helper.websiteBriefSuggestions('Our Store',home);
 assert.equal(ideas.length,22);assert.equal(ideas.filter(i=>i.sourceUrl.includes('/product/')).length,22);
 assert.equal(new Set(ideas.slice(0,11).map(i=>i.label.split(' ')[0])).size,11);
 assert.equal(ideas[1].label,'MakerB Model B0');assert.equal(ideas[1].sourceUrl,home+'product/b0');
});
test('every chosen product gets a verified photo before any additional angle',async()=>{
 const topics=(await load('lib/campaign/website-topics.ts',mocks).websiteBriefSuggestions('Our Store',home)).filter(i=>i.sourceUrl.includes('/product/')).map(i=>i.label);
 const evidence=[];const images=await load('lib/campaign/website-photos.ts',mocks).discoverWebsitePhotos(home,topics,evidence);
 assert.ok(images.length>20);assert.equal(new Set(evidence.slice(0,22).map(i=>i.sourceUrl)).size,22);
 assert.equal(evidence[1].title,'MakerB Model B0');assert.equal(images[1],home+'b0.jpg');
 const receipt=load('lib/campaign/photo-matching.ts');const old=process.env.AUTH_SECRET;process.env.AUTH_SECRET='test-key';
 try{const signed=receipt.signPhotoEvidence('org',home,evidence);assert.equal(receipt.verifyPhotoEvidence(signed,'org',home).length,evidence.length);}finally{if(old===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=old;}
 const {applyCampaignTopics,buildQuantityContentPlan}=load('lib/campaign/content-plan.ts');
 const slots=buildQuantityContentPlan([{day:1,date:'2026-10-19',platforms:['facebook']}],1,{post:10,reel_post:0,presenter_post:0,story_post:0});
 const plan=applyCampaignTopics(slots,topics);assert.equal(new Set(plan.map(s=>s.topics[0])).size,10);assert.ok(plan.every(s=>s.topics.length===1));
});
test('catalog rejects another site, unavailable products and malformed responses without preventing heading fallback',async()=>{
 const invalid=[...products.slice(0,1),{name:'Foreign',permalink:'https://foreign.example/product/',images:[]},{name:'Sold item',permalink:home+'sold',is_in_stock:false,images:[]}];
 const helper=load('lib/campaign/website-catalog.ts',{'@/lib/reels/public-fetch':{fetchPublicBytes:async url=>{assert.ok(url.startsWith(home));return{contentType:'application/json',bytes:Buffer.from(JSON.stringify(invalid))};}}});
 assert.equal((await helper.websiteCatalog(home,'woocommerce')).length,1);assert.equal((await helper.websiteCatalog(home,'A normal service website')).length,0);
 const fallback=load('lib/campaign/website-topics.ts',{'@/lib/reels/public-fetch':{fetchPublicBytes:async url=>{if(url===home)return{contentType:'text/html',bytes:Buffer.from('<h2>Coaching for confidence</h2><script src="/wp-content/x"></script>')};throw Error('no catalog');}}});
 const ideas=await fallback.websiteBriefSuggestions('Practice',home);assert.equal(ideas[0].label,'Coaching for confidence');
});

test('historical years do not turn a single named guitar into two product models',()=>{
 const helper=load('lib/campaign/photo-matching.ts');const title='Torres Papel FE14 Handmade 1862 Classical Guitar';const photo={title,sourceUrl:home+'product/torres-papel-fe14/',imageUrl:home+'torres.jpg'};
 assert.ok(helper.matchingWebsitePhoto({headline:title,topics:[title]},[photo],[photo.imageUrl]));
});
