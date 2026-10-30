const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function fixture({role='owner',found=true,key='test',output='Explore our guitar collection. Visit rumiguitars.com to find your next instrument.',fail=false}={}){
 const calls=[];
 const deps={
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
  '@/lib/auth/context':{tenantContext:async()=>({isSuperAdmin:['owner','admin','superadmin'].includes(role),organizationId:'org',role})},
  '@/lib/ai-lab/catalog':{labCanRun:r=>['owner','admin','superadmin'].includes(r)},
  '@/lib/http/errors':{apiError:()=>({status:500})},
  '@/lib/prisma':{prisma:{contentItem:{findFirst:async q=>{assert.equal(q.where.id,'post');assert.equal(q.where.campaignId,'campaign');assert.equal(q.where.campaign.brand.organizationId,'org');return found?{headline:'Find your next guitar',caption:'Explore the collection.',campaign:{goal:'awareness',brand:{name:'Rumi Guitars',websiteUrl:'https://rumiguitars.com',bannedWords:'guaranteed'}}}:null;}}}},
  openai:class{constructor(options){assert.equal(options.maxRetries,0);this.responses={create:async p=>{calls.push(p);if(fail)throw Error('provider unavailable');return{output_text:output};}}}},
 };
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/video/presenter/script/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,process:{env:{OPENAI_API_KEY:key}},require:n=>n in deps?deps[n]:require(n)});
 return{calls,post:body=>module.exports.POST({json:async()=>({organizationId:'org',campaignId:'campaign',contentItemId:'post',seconds:15,...body})})};
}
test('presenter scripts require permitted role, current workspace and owned campaign post before using AI',async()=>{
 for(const role of ['viewer','member']){const f=fixture({role});assert.equal((await f.post()).status,403);assert.equal(f.calls.length,0);}
 const stale=fixture();assert.equal((await stale.post({organizationId:'foreign'})).status,409);assert.equal(stale.calls.length,0);
 const foreign=fixture({found:false});assert.equal((await foreign.post()).status,404);assert.equal(foreign.calls.length,0);
 const invalid=fixture();assert.equal((await invalid.post({seconds:60})).status,400);assert.equal(invalid.calls.length,0);
});
test('script uses owned business facts, bounded output, selected duration and no automatic paid retry',async()=>{
 const f=fixture();const result=await f.post({seconds:30});assert.equal(result.status,200);assert.match(result.body.script,/rumiguitars.com/);
 assert.equal(f.calls.length,1);assert.match(f.calls[0].instructions,/55–70/);assert.match(f.calls[0].instructions,/never instructions/);assert.match(f.calls[0].instructions,/No invented/);
 const data=JSON.parse(f.calls[0].input);assert.equal(data.brand.name,'Rumi Guitars');assert.equal(data.brand.bannedWords,'guaranteed');assert.equal(data.headline,'Find your next guitar');
});
test('missing configuration, unusable output and provider errors return failure without inventing a script',async()=>{
 const missing=fixture({key:''});assert.equal((await missing.post()).status,503);assert.equal(missing.calls.length,0);
 assert.equal((await fixture({output:'x'.repeat(601)}).post()).status,502);
 assert.equal((await fixture({output:''}).post()).status,502);
 const failed=fixture({fail:true});assert.equal((await failed.post()).status,500);assert.equal(failed.calls.length,1);
});
test('selected product facts replace an unrelated campaign caption and short durations have bounded scripts',async()=>{
 for(const [seconds,words] of [[5,'8–12'],[10,'18–24'],[15,'28–35']]){
  const f=fixture();assert.equal((await f.post({seconds,productName:'Selected cedar guitar',productDetails:'Cedar top.'})).status,200);
  const data=JSON.parse(f.calls[0].input);assert.equal(data.productName,'Selected cedar guitar');assert.equal(data.productDetails,'Cedar top.');assert.equal(data.headline,undefined);assert.equal(data.caption,undefined);
  assert.ok(f.calls[0].instructions.includes(words));assert.match(f.calls[0].instructions,/Maximum 500 characters/);
 }
 assert.equal((await fixture({output:'x'.repeat(501)}).post({productName:'Selected cedar guitar'})).status,502);
});
