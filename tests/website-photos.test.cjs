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


const json=(body,options={})=>({body,status:options.status||200});
const {extractWebsitePhotos,websitePage}=load('lib/website/photos.ts');
test('website photos include actual service images and exclude logos small icons and duplicates',()=>{
 const html='<img src="/logo.png" alt="Logo"><img src="/session.jpg" alt="Hypnosis consultation" width="800" height="600"><img src="/session.jpg" alt="Duplicate"><img src="/icon.png" width="20" height="20"><img data-src="/office.webp" alt="Quiet office">';
 const photos=extractWebsitePhotos(html,'https://mind.example/','Master Mind');assert.equal(photos.length,2);assert.equal(photos[0].name,'Hypnosis consultation');assert.equal(photos[0].imageUrl,'https://mind.example/session.jpg');assert.equal(photos[0].websitePhoto,true);assert.equal(photos[1].sourceUrl,'https://mind.example/');
});
test('photo discovery cannot use another business website or credentials in a URL',()=>{assert.throws(()=>websitePage('https://mind.example','https://guitars.example/'));assert.throws(()=>websitePage('https://mind.example','https://user:pass@mind.example/'));assert.equal(websitePage('https://mind.example','https://mind.example/services').origin,'https://mind.example');});
test('selection uses rechecked website image and preserves the existing post title and caption',async()=>{let update;const api=load('app/api/website/photos/route.ts',{'next/server':{NextResponse:{json}},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'mind',role:'owner'})},'@/lib/website/photos':{websitePhotos:async(website,name,page)=>{assert.equal(website,'https://mind.example');assert.equal(page,'https://mind.example/services');return [{id:'photo',name:'Service photo',imageUrl:'https://mind.example/office.jpg',sourceUrl:page}]}},'@/lib/prisma':{prisma:{contentItem:{findFirst:async()=>({id:'post',campaignId:'campaign',campaign:{brand:{websiteUrl:'https://mind.example',name:'Master Mind'}}})},$transaction:async fn=>fn({contentItem:{findFirst:async()=>({status:'draft'}),update:async q=>{update=q.data}},publishJob:{findFirst:async()=>null},mediaAsset:{updateMany:async()=>({}),create:async()=>({})}})}}});const r=await api.POST(new Request('https://app.test/api/website/photos',{method:'POST',body:JSON.stringify({campaignId:'campaign',contentItemId:'post',photoId:'photo',pageUrl:'https://mind.example/services'})}));assert.equal(r.status,200);assert.equal(update.mediaUrl,'https://mind.example/office.jpg');assert.equal(update.status,'draft');assert.equal('headline' in update,false);assert.equal('caption' in update,false);});
