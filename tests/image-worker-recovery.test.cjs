const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function fixture(){
 const job={id:'image-job',organizationId:'org',type:'GENERATE_IMAGE',status:'queued',payload:{campaignId:'campaign',contentItemId:'post',prompt:'Requested scene'}};
 let history=0;const prompts=[],directions=[];
 class ImageRejectedError extends Error{}
 let reject=false;
 const deps={
 '@/lib/weekly/plan':require('./helpers/weekly-load.cjs').load('lib/weekly/plan.ts'),
 'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
 '@/lib/prisma':{prisma:{job:{findFirst:async()=>job,updateMany:async q=>{if(job.status!==q.where.status)return {count:0};Object.assign(job,q.data);return{count:1};},update:async q=>{Object.assign(job,q.data);return job;}},contentItem:{findUnique:async()=>({id:'post',type:'post',campaign:{brand:{id:'brand',name:'Master Mind'}}})}}},
 '@/lib/ai/image-provider':{ImageRejectedError,imageConfiguration:()=>({provider:'bfl'}),generateImage:async input=>{prompts.push(input);if(reject)throw new ImageRejectedError();throw Error('Polling connection interrupted');}},
 '@/lib/ai/visual-history':{recentBrandConcepts:async()=>[{changed:++history}],regenerationVariationIndex:()=>0},
 '@/lib/ai/visual-director':{buildVisualDirection:input=>{directions.push(input);return 'Frozen scene '+input.recentConcepts[0].changed;}},
 '@/lib/ai/visual-plan':{isSubjectCategory:()=>false},
 };
 for(const name of ['@/lib/creative/save-revision','@/lib/campaign/setup-photos','@/lib/ai/campaign','@/lib/campaign/content-plan','@/lib/campaign/photo-matching','@/lib/render/svg','@/lib/render/showcase','@/lib/ai/occasion','@/lib/render/raster'])deps[name]={};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/jobs/run/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,process:{env:{WORKER_SECRET:'test'}},require:n=>n in deps?deps[n]:require(n)});
 return{job,prompts,directions,api:module.exports,reject:()=>reject=true,req:{headers:{get:()=> 'test'},json:async()=>({jobId:job.id,organizationId:'org'})}};
}
test('worker polling interruption stays queued and retries frozen prompt/task ID despite history drift',async()=>{const f=fixture();assert.equal((await f.api.POST(f.req)).status,202);assert.equal(f.job.status,'queued');assert.equal(f.job.payload.frozenImagePrompt,'Frozen scene 1');assert.equal((await f.api.POST(f.req)).status,202);assert.equal(f.prompts.length,2);assert.equal(f.prompts[0].prompt,f.prompts[1].prompt);assert.equal(f.prompts[0].requestId,f.prompts[1].requestId);});
test('worker stops retrying definitive paid provider rejection',async()=>{const f=fixture();f.reject();assert.equal((await f.api.POST(f.req)).status,500);assert.equal(f.job.status,'failed');});
test('worker uses the planned photo sequence and caption position, independent of its database ID',async()=>{const f=fixture();f.job.payload.variationIndex=19;f.job.payload.textPosition='right';await f.api.POST(f.req);assert.equal(f.directions[0].variationIndex,19);assert.equal(f.directions[0].textPosition,'right');});
