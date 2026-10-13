const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps={}) {
 const module={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,URL,require:n=>n in deps?deps[n]:require(n)});
 return module.exports;
}
const helper=load('lib/campaign/brief-suggestions.ts');
test('mixed briefs cover selected subjects across the whole campaign',()=>{
 const brief=helper.mixedTopicBrief('Master Mind',['Relaxation','Confidence','Changing habits']);
 assert.match(brief,/Do not focus the whole week or month on one topic/);assert.match(brief,/different question, tip, explanation/);
 assert.match(brief,/Relaxation/);assert.match(brief,/Confidence/);assert.equal(helper.mixedTopicBrief('Master Mind',[]),'');
});
test('website reader stays on the business website and ignores script instructions and unrelated links',async()=>{
 const calls=[];
 const html='<h1>Master Mind</h1><h2>Self-Hypnosis for Anxiety and Fear</h2><h2>Confidence</h2><script><h2>Secret topic</h2></script><a href="/habits/">Changing habits</a><a href="https://guitars.example/product/">Guitar lessons</a><a href="/cart/">Shopping cart</a>';
 const website=load('lib/campaign/website-topics.ts',{'@/lib/reels/public-fetch':{fetchPublicBytes:async url=>{calls.push(url);return {contentType:'text/html',bytes:{toString:()=>url.endsWith('/habits/')?'<h2>Understanding habitual patterns</h2>':html}};}}});
 const ideas=await website.websiteBriefSuggestions('Master Mind','https://mind.example/');
 assert.ok(ideas.some(i=>i.label==='Self-Hypnosis for Anxiety and Fear'));assert.ok(ideas.some(i=>i.label==='Understanding habitual patterns'));
 assert.ok(ideas.every(i=>!/Guitar|Secret|Shopping cart/.test(i.label)));assert.deepEqual(calls,['https://mind.example/','https://mind.example/habits/']);assert.ok(ideas.every(i=>i.sourceUrl.startsWith('https://mind.example/')));
});
test('website endpoint refuses stale workspace and reads only the saved current-business URL',async()=>{
 let reads=0;const api=load('app/api/campaigns/brief-suggestions/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
  '@/lib/auth/context':{tenantContext:async()=>({organizationId:'master-mind'})},
  '@/lib/prisma':{prisma:{brand:{findFirst:async query=>{assert.equal(query.where.organizationId,'master-mind');return {name:'Master Mind',websiteUrl:'https://mind.example/'};}}}},
  '@/lib/campaign/website-topics':{websiteBriefSuggestions:async(name,url)=>{reads++;assert.equal(name,'Master Mind');assert.equal(url,'https://mind.example/');return [{label:'Confidence'}];}},
  '@/lib/campaign/brief-suggestions':helper,'@/lib/http/errors':{},
 });
 assert.equal((await api.POST({json:async()=>({organizationId:'guitars',url:'https://foreign.example/'})})).status,409);assert.equal(reads,0);
 const result=await api.POST({json:async()=>({organizationId:'master-mind',url:'https://foreign.example/'})});assert.equal(result.status,200);assert.equal(reads,1);assert.equal(result.body.source,'website');
});
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
  '@/lib/http/errors':{},'@/lib/campaign/brief-suggestions':helper,'@/lib/campaign/website-topics':{},
 });
 const result=await api.GET();assert.equal(queries[0].where.organizationId,'master-mind');assert.equal(result.body.organizationId,'master-mind');assert.equal(result.options.headers['Cache-Control'],'no-store');assert.equal(result.body.suggestions.length,6);
});
test('signed-out users receive no brand data',async()=>{
 let reads=0;
 const api=load('app/api/campaigns/brief-suggestions/route.ts',{
  'next/server':{},'@/lib/auth/context':{tenantContext:async()=>{throw Error('UNAUTHENTICATED');}},
  '@/lib/prisma':{prisma:{brand:{findFirst:async()=>{reads++;}}}},
  '@/lib/http/errors':{apiError:error=>({status:401,error:error.message})},'@/lib/campaign/brief-suggestions':helper,'@/lib/campaign/website-topics':{},
 });
 assert.equal((await api.GET()).status,401);assert.equal(reads,0);
});
