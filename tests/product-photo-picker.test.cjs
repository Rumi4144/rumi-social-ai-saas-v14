const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');const root=path.resolve(__dirname,'..');
function load(file,mocks={},cache=new Map()){file=path.resolve(root,file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,Buffer,URL,process,require:n=>n in mocks?mocks[n]:n.startsWith('@/')||n.startsWith('.')?load((n.startsWith('@/')?n.slice(2):path.relative(root,path.resolve(path.dirname(file),n)))+'.ts',mocks,cache):require(n)});return module.exports;}
const home='https://shop.example/',name='Ramirez Inspired A1 Guitar',post={id:'ramirez',headline:'Meet the Ramirez Inspired A1 Guitar',caption:'Discover this guitar.',type:'reel_post'},brand={name:'Rumi Guitars',websiteUrl:home};const json=(body,options={})=>({body,status:options.status||200});
const correct={sourceEvidence:{title:name,sourceUrl:home+'product/ramirez-inspired-a1-guitar/',imageUrl:home+'ramirez.jpg'}},wrong={sourceEvidence:{title:'Martinez MS-14R',sourceUrl:home+'product/martinez-ms-14r/',imageUrl:home+'martinez.jpg'}};
test('named product discovery returns its gallery and excludes related-product images',async()=>{
 const catalog=[{name,permalink:correct.sourceEvidence.sourceUrl,images:[{src:home+'ramirez.jpg'}]},{name:'Martinez MS-14R',permalink:wrong.sourceEvidence.sourceUrl,images:[{src:home+'martinez.jpg'}]}];
 const pages={[home]:'<script src="/wp-content/shop.js"></script><img src="/martinez.jpg" alt="Martinez">',[correct.sourceEvidence.sourceUrl]:'<h1>Ramirez Inspired A1 Guitar</h1><div class="woocommerce-product-gallery"><img data-large_image="/ramirez.jpg"><img data-large_image="/ramirez-back.jpg"></div><section class="related"><img src="/martinez.jpg" alt="Martinez"></section>'};
 const helper=load('lib/website/photos.ts',{'@/lib/reels/public-fetch':{fetchPublicBytes:async url=>({contentType:url.includes('wp-json')?'application/json':'text/html',bytes:Buffer.from(url.includes('wp-json')?JSON.stringify(catalog):pages[url]||'')})}});
 const photos=await helper.websitePhotos(home,brand.name,undefined,name);assert.equal(photos.length,2);assert.ok(photos.every(p=>p.imageUrl.includes('ramirez')&&!p.imageUrl.includes('martinez')));
 assert.equal((await helper.websitePhotos(home,brand.name,undefined,'Ramirez A9')).length,0);
 const rechecked=await helper.websitePhotos(home,brand.name,correct.sourceEvidence.sourceUrl);assert.equal(rechecked[0].id,photos[0].id);
});
test('website picker verifies the post and defaults to its product; broad browsing is explicit',async()=>{
 const calls=[];let missing=false;const api=load('app/api/website/photos/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'org'})},'@/lib/prisma':{prisma:{campaign:{findFirst:async()=>({brand})},contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'org');assert.equal(q.where.campaignId,'campaign');return missing?null:post;}},job:{findFirst:async()=>null}}},'@/lib/website/photos':{websitePhotos:async(...args)=>{calls.push(args);return[];}}});
 const req=extra=>({url:'https://app.test/api/website/photos?campaignId=campaign&contentItemId=ramirez'+extra});
 const first=await api.GET(req(''));assert.equal(first.body.matchingOnly,true);assert.equal(calls[0][3],post.headline);
 const broad=await api.GET(req('&scope=all'));assert.equal(broad.body.matchingOnly,false);assert.equal(calls[1][3],undefined);
 missing=true;assert.equal((await api.GET(req(''))).status,404);assert.equal(calls.length,2);
});
test('saved photo picker filters product provenance before pagination, regardless of post labels',async()=>{
 let reads=0,lastQuery,missing=false;const assets=[...Array.from({length:35},(_,i)=>({id:'wrong-'+i,campaignId:'past',contentItemId:'ramirez',kind:'ai_image',metadata:wrong})),{id:'correct',campaignId:'past',contentItemId:'ramirez',kind:'product_photo',metadata:correct}];
 const api=load('app/api/reels/library/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'org'})},'@/lib/prisma':{prisma:{campaign:{findFirst:async()=>({brandId:'rumi',brand}),findMany:async()=>[{id:'current',title:'Current'},{id:'past',title:'Past'}]},contentItem:{findFirst:async()=>missing?null:post,findMany:async()=>[post]},job:{findFirst:async()=>null},mediaAsset:{findMany:async q=>{reads++;lastQuery=q;return assets.slice(q.skip,q.skip+q.take);}}}}});
 const req=extra=>({url:'https://app.test/api/reels/library?organizationId=org&campaignId=current&contentItemId=ramirez'+extra});
 const first=await api.GET(req(''));assert.equal(first.body.matchingOnly,true);assert.deepEqual(Array.from(first.body.sources,s=>s.id),['correct']);assert.equal(lastQuery.skip,0);assert.ok(lastQuery.take>35);assert.equal(lastQuery.where.organizationId,'org');assert.equal(first.body.hasMore,false);
 const broad=await api.GET(req('&scope=all'));assert.equal(broad.body.matchingOnly,false);assert.equal(broad.body.sources.length,24);assert.ok(broad.body.sources.some(s=>s.id.startsWith('wrong')));
 missing=true;assert.equal((await api.GET(req(''))).status,404);assert.equal(reads,2);
});

test('ordinary numbered service topics do not become product filters',()=>{const helper=load('lib/reels/product-identity.ts');assert.equal(helper.reelProductSubject({headline:'Session 2: Notice your breathing',topics:['Session 2: Notice your breathing']},{name:'Master Mind',industry:'Health & Wellness'}),undefined);});
