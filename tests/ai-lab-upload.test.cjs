const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function fixture(){
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aUO0AAAAASUVORK5CYII=','base64');
 const state={admin:true,org:'own',recent:0,previous:null,source:bytes,download:bytes,contentType:'image/png',fetches:[],puts:[],tickets:0,assets:[],ready:[]};
 const deps={
 'next/server':{NextResponse:{json:(body,o)=>({body,status:o?.status||200})}},zod:require('zod'),sharp:require('sharp'),
 '@/lib/auth/context':{tenantContext:async()=>({organizationId:state.org,isSuperAdmin:state.admin})},
 '@/lib/ai-lab/catalog':{labCanRun:(_r,a)=>a},'@/lib/http/errors':{apiError:e=>({status:e.message==='FORBIDDEN'?403:500})},
 '@/lib/ai-lab/providers':{labUploadTicket:async()=>{state.tickets++;return {download_url:'https://provider.test/image.png',upload:{url:'https://provider.test/put',headers:{'Content-Type':'image/png'}}};}},
 '@/lib/reels/public-fetch':{fetchPublicBytes:async(url,max)=>{assert.equal(max,10_000_000);state.fetches.push(url);return {bytes:url.includes('provider')?state.download:state.source,contentType:state.contentType};}},
 '@/lib/prisma':{prisma:{brand:{findMany:async q=>{assert.equal(q.where.organizationId,'own');return [{websiteUrl:'https://brand.test'}];}},mediaAsset:{findFirst:async q=>{assert.equal(q.where.organizationId,'own');assert.equal(q.where.status,'ready');assert.equal(q.where.metadata.path[0],'sourceUrl');return state.previous;},count:async q=>{assert.equal(q.where.organizationId,'own');return state.recent;},create:async q=>{state.assets.push(q.data);return {id:'imported'};},update:async q=>state.ready.push(q)}}},
 };
 const load=(file,dependencies)=>{const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:n=>dependencies[n],URL,Buffer,Uint8Array,AbortSignal,process:{env:{WAVESPEED_API_KEY:'fixture'}},fetch:async(url,o)=>{state.puts.push({url,...o});return {ok:true};}});return module.exports;};
 deps['@/lib/reels/product-photos']=load('lib/reels/product-photos.ts',{});
 const api=load('app/api/ai-lab/upload/route.ts',deps);
 return {state,post:async(p={})=>api.POST({json:async()=>({action:'import',organizationId:'own',url:'https://brand.test/photo.png',...p})})};
}
test('website import is tenant scoped, preserves original bytes, and verifies before marking ready',async()=>{
 const f=fixture(),r=await f.post();assert.equal(r.status,200);assert.equal(r.body.assetId,'imported');assert.equal(r.body.name,'photo.png');assert.equal(f.state.tickets,1);assert.equal(f.state.puts[0].redirect,'error');assert.ok(Buffer.from(f.state.puts[0].body).equals(f.state.source));assert.equal(f.state.assets[0].organizationId,'own');assert.equal(f.state.assets[0].status,'uploading');assert.equal(f.state.assets[0].metadata.sourceUrl,'https://brand.test/photo.png');assert.equal(f.state.ready[0].data.status,'ready');
});
test('foreign workspace, non-admin and unrelated websites stop before downloading or uploading',async()=>{
 for(const change of [{organizationId:'foreign'},{url:'https://other.test/photo.png'},{url:'http://brand.test/photo.png'},{url:'https://brand.test@evil.test/photo.png'},{url:'https://brand.test:8080/photo.png'}]){const f=fixture();assert.ok((await f.post(change)).status>=400);assert.equal(f.state.fetches.length,0);assert.equal(f.state.tickets,0);}
 const f=fixture();f.state.admin=false;assert.equal((await f.post()).status,403);assert.equal(f.state.fetches.length,0);
});
test('malformed images, HTML, mismatched MIME and upload corruption never become ready',async()=>{
 for(const change of [{source:Buffer.from('<html>login</html>')},{contentType:'text/html'},{contentType:'image/jpeg'},{download:Buffer.from('corrupt')}]){const f=fixture();Object.assign(f.state,change);assert.ok((await f.post()).status>=400);assert.equal(f.state.ready.length,0);}
});
test('repeat imports reuse a current owned photo; new imports respect the existing allowance',async()=>{
 const f=fixture();f.state.previous={id:'saved',metadata:{filename:'photo.png'}};assert.equal((await f.post()).body.assetId,'saved');assert.equal(f.state.fetches.length,0);assert.equal(f.state.tickets,0);
 const limited=fixture();limited.state.recent=20;assert.equal((await limited.post()).status,429);assert.equal(limited.state.fetches.length,0);
});
