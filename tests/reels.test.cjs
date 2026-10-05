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
  vm.runInNewContext(js, { module, exports: module.exports, require: requireFile, process, Buffer, URL, console, fetch: mocks.__fetch || fetch, AbortSignal, FormData, Blob, Response, Uint8Array, Headers, ReadableStream }, { filename: file });
  return module.exports;
}
const timeline = load('lib/reels/timeline.ts');
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
