const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps={}) {
 const module={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,require:n=>n in deps?deps[n]:require(n)});
 return module.exports;
}
const helper=load('lib/campaign/brief-suggestions.ts');
test('Master Mind ideas use its own name and educational topics without invented offers',()=>{
 const ideas=helper.briefSuggestions({name:'Master Mind Advanced Hypnosis'});
 assert.equal(ideas.length,6);assert.ok(ideas.some(i=>i.label==='Self-hypnosis for anxiety & fear'));
 assert.ok(ideas.every(i=>i.brief.includes('Master Mind Advanced Hypnosis')));
 assert.ok(ideas.every(i=>!i.brief.includes('Rumi Guitars')));
 assert.ok(ideas.every(i=>i.brief.includes('do not invent testimonials, offers, or guaranteed outcomes')));
});
test('guitar and unknown businesses do not receive hypnosis suggestions',()=>{
 for(const name of ['Rumi Guitars','New business']) {
  const ideas=helper.briefSuggestions({name});assert.ok(ideas.every(i=>i.brief.includes(name)));
  assert.ok(ideas.every(i=>!/hypnosis|anxiety|Master Mind/i.test(i.brief)));
 }
});
test('suggestion endpoint uses only the active workspace and prohibits shared caching',async()=>{
 const queries=[];
 const api=load('app/api/campaigns/brief-suggestions/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,options})}},
  '@/lib/auth/context':{tenantContext:async()=>({organizationId:'master-mind',organization:{name:'Master Mind'}})},
  '@/lib/prisma':{prisma:{brand:{findFirst:async query=>{queries.push(query);return {name:'Master Mind Advanced Hypnosis'};}}}},
  '@/lib/http/errors':{},'@/lib/campaign/brief-suggestions':helper,
 });
 const result=await api.GET();assert.equal(queries[0].where.organizationId,'master-mind');assert.equal(result.body.organizationId,'master-mind');assert.equal(result.options.headers['Cache-Control'],'no-store');assert.equal(result.body.suggestions.length,6);
});
test('signed-out users receive no brand data',async()=>{
 let reads=0;
 const api=load('app/api/campaigns/brief-suggestions/route.ts',{
  'next/server':{},'@/lib/auth/context':{tenantContext:async()=>{throw Error('UNAUTHENTICATED');}},
  '@/lib/prisma':{prisma:{brand:{findFirst:async()=>{reads++;}}}},
  '@/lib/http/errors':{apiError:error=>({status:401,error:error.message})},'@/lib/campaign/brief-suggestions':helper,
 });
 assert.equal((await api.GET()).status,401);assert.equal(reads,0);
});
