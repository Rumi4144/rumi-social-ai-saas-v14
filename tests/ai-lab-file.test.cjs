const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function fixture({forbidden=false,foreign=false}={}) {
 let reads=0,cancelled=false;
 const module={exports:{}};
 const dependencies={
  '@vercel/blob':{get:async()=>{reads++;return {statusCode:200,blob:{size:10},stream:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('0123'));c.enqueue(new TextEncoder().encode('4567'));c.enqueue(new TextEncoder().encode('89'));},cancel(){cancelled=true;}})};}},
  '@/lib/auth/context':{tenantContext:async()=>({organizationId:'org',role:'superadmin',isSuperAdmin:!forbidden})},
  '@/lib/prisma':{prisma:{job:{findFirst:async q=>{assert.equal(q.where.organizationId,'org');assert.equal(q.where.status,'succeeded');return {id:'job',result:{pathname:`ai-lab/${foreign?'other':'org'}/job.mp3`,contentType:'audio/mpeg'}};}}}},
  '@/lib/http/errors':{apiError:()=>new Response(null,{status:403})},
  '@/lib/ai-lab/catalog':{labCanRun:(_role,superadmin)=>superadmin},
 };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/ai-lab/file/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:n=>dependencies[n],Response,Headers,ReadableStream,URL});
 return {get:range=>module.exports.GET(new Request('https://rumi.test/api/ai-lab/file?jobId=job&download=1',{headers:range?{Range:range}:{}})),reads:()=>reads,cancelled:()=>cancelled};
}
test('saved voice supports browser byte probes, seeking and suffix requests',async()=>{
 for(const [range,body,contentRange] of [['bytes=0-1','01','bytes 0-1/10'],['bytes=3-7','34567','bytes 3-7/10'],['bytes=8-','89','bytes 8-9/10'],['bytes=-3','789','bytes 7-9/10'],['bytes=7-99','789','bytes 7-9/10']]){
  const f=fixture(),r=await f.get(range);assert.equal(r.status,206);assert.equal(r.headers.get('Content-Range'),contentRange);assert.equal(Number(r.headers.get('Content-Length')),body.length);assert.equal(r.headers.get('Content-Type'),'audio/mpeg');assert.match(r.headers.get('Content-Disposition'),/^attachment/);assert.equal(await r.text(),body);assert.equal(f.cancelled(),true);
 }
});
test('invalid ranges cancel the private stream and return 416',async()=>{
 for(const range of ['bytes=10-','bytes=7-2','bytes=-0','bytes=-','bytes=0-1,4-5','bytes=9007199254740992-']){const f=fixture(),r=await f.get(range);assert.equal(r.status,416);assert.equal(r.headers.get('Content-Range'),'bytes */10');assert.equal(f.cancelled(),true);}
});
test('full downloads keep bytes intact and private access remains enforced',async()=>{
 const f=fixture(),r=await f.get();assert.equal(r.status,200);assert.equal(r.headers.get('Accept-Ranges'),'bytes');assert.equal(r.headers.get('Cache-Control'),'private, no-store');const reader=r.body.getReader();let body='';for(let i=0;i<3;i++){body+=new TextDecoder().decode((await reader.read()).value);}await reader.cancel();assert.equal(body,'0123456789');
 for(const options of [{forbidden:true},{foreign:true}]){const restricted=fixture(options);assert.ok([403,404].includes((await restricted.get('bytes=0-1')).status));assert.equal(restricted.reads(),0);}
});
