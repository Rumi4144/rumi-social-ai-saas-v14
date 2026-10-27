const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{createHash}=require('node:crypto');
const input={organizationId:'org',requestId:'request',prompt:'A bright kitchen scene with no words',format:'portrait'};
function png(size='896x1120'){
 const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
 const [width,height]=size.split('x').map(Number);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);return bytes;
}
function fixture(env={OPENAI_API_KEY:'test',BFL_API_KEY:'test'}){
 const jobs=new Map(),submissions=[];let polls=0,downloads=0,saves=0;
 const faults={submit:false,download:false,poll:false,save:0,status:200,response:null};
 const prisma={job:{
  findFirst:async q=>{const job=jobs.get(q.where.id);return job?.organizationId===q.where.organizationId?job:null;},
  create:async q=>{if(jobs.has(q.data.id))throw Error('duplicate');jobs.set(q.data.id,structuredClone(q.data));return jobs.get(q.data.id);},
  update:async q=>{if(q.data.result){saves++;if(faults.save-->0)throw Error('storage');}Object.assign(jobs.get(q.where.id),structuredClone(q.data));return jobs.get(q.where.id);},
 }};
 function load(file){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{
  module,exports:module.exports,process:{env},URL,Buffer,AbortSignal,setTimeout,Date,
  require:n=>n==='@/lib/prisma'?{prisma}:n==='./image-models'?load('lib/ai/image-models.ts'):n==='@/lib/reels/public-fetch'?{fetchPublicBytes:async()=>{downloads++;if(faults.download)throw Error('download');return{bytes:png(),contentType:'image/png'};}}:require(n),
  fetch:async(url,options)=>{
   if(options.method==='POST'){
    assert.equal(url,'https://api.openai.com/v1/images/generations');assert.equal(options.headers.Authorization,'Bearer test');
    const body=JSON.parse(options.body);submissions.push(body);assert.equal(jobs.size>0,true,'durable claim precedes paid request');
    if(faults.submit)throw Error('network');
    return{ok:faults.status===200,status:faults.status,json:async()=>faults.response||{data:[{b64_json:png(body.size).toString('base64')}]}};
   }
   polls++;assert.equal(options.headers['x-key'],'test');if(faults.poll)throw Error('network');
   assert.match(url,/\/v1\/get_result\?id=task$/);return{ok:true,json:async()=>({status:'Ready',result:{sample:'https://delivery.test.bfl.ai/photo.png'}})};
  },
 });return module.exports;}
 function legacy(request=input,result={taskId:'task',pollingUrl:'https://api.eu.bfl.ai/v1/get_result?id=task'},provider='bfl'){
  const id='image-provider-'+createHash('sha256').update(JSON.stringify([request.organizationId,request.requestId])).digest('hex').slice(0,40);
  const fingerprint=createHash('sha256').update(JSON.stringify([request.requestDescription??request.prompt,request.format])).digest('hex');
  jobs.set(id,{id,organizationId:request.organizationId,type:'IMAGE_PROVIDER_TASK',status:'running',payload:{fingerprint,prompt:request.prompt,provider,model:provider==='bfl'?'flux-3-image-klein':'gpt-image-1'},result});
 }
 return{api:load('lib/ai/image-provider.ts'),env,jobs,submissions,faults,legacy,counters:()=>({polls,downloads,saves})};
}
test('regular photos use Flare Medium with one PNG and format-specific dimensions',async()=>{
 for(const [format,size] of [['square','1024x1024'],['portrait','1024x1280'],['story','864x1536']]){
  const f=fixture();const result=await f.api.generateImage({...input,format});
  assert.deepEqual(f.submissions,[{model:'gpt-image-2.5-flare-2026-09-08',prompt:input.prompt,size,quality:'medium',output_format:'png',n:1}]);
  assert.equal(result.provider,'openai');assert.equal(result.model,f.submissions[0].model);assert.equal(result.size,size);assert.equal(result.quality,'medium');
  const saved=[...f.jobs.values()][0];assert.equal(saved.payload.size,size);assert.equal(saved.payload.quality,'medium');assert.equal(saved.status,'succeeded');
  await f.api.generateImage({...input,format});assert.equal(f.submissions.length,1);assert.equal(f.counters().polls,0);
 }
});
test('legacy environment values cannot override the selected regular Medium setting',()=>{
 const f=fixture({OPENAI_API_KEY:'test',IMAGE_PROVIDER:'bfl',OPENAI_IMAGE_MODEL:'gpt-image-1'});
 assert.equal(f.api.imageConfiguration().provider,'openai');assert.equal(f.api.imageConfiguration().model,'gpt-image-2.5-flare-2026-09-08');assert.equal(f.api.imageConfiguration().quality,'medium');
});
test('missing OpenAI credentials fails before a paid claim; never falls back to FLUX',async()=>{
 const f=fixture({BFL_API_KEY:'test'});await assert.rejects(f.api.generateImage(input),/OPENAI_API_KEY_MISSING/);assert.equal(f.jobs.size,0);assert.equal(f.submissions.length,0);
});
test('simultaneous duplicate requests buy one image and recover the saved result',async()=>{
 const f=fixture();const results=await Promise.allSettled([f.api.generateImage(input),f.api.generateImage(input)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));await f.api.generateImage(input);assert.equal(f.submissions.length,1);
});
test('ambiguous submissions and server errors never buy another image or fall back',async()=>{
 for(const fault of [{submit:true},{status:500}]){
  const f=fixture();Object.assign(f.faults,fault);await assert.rejects(f.api.generateImage(input),f.api.ImagePendingError);await assert.rejects(f.api.generateImage(input),f.api.ImagePendingError);assert.equal(f.submissions.length,1);
 }
});
test('confirmed provider rejections stop and persist without automatic resubmission',async()=>{
 for(const status of [400,401,402,403,404,422,429]){
  const f=fixture();f.faults.status=status;await assert.rejects(f.api.generateImage(input),f.api.ImageRejectedError);await assert.rejects(f.api.generateImage(input),f.api.ImageRejectedError);assert.equal(f.submissions.length,1);assert.equal([...f.jobs.values()][0].status,'failed');
 }
});
test('invalid image bytes, dimensions and extra outputs stay uncertain without paid retries',async()=>{
 for(const response of [{data:[]},{data:[{b64_json:'not an image'}]},{data:[{b64_json:png('1024x1024').toString('base64')}]},{data:[{b64_json:png('1024x1280').toString('base64')},{b64_json:'extra'}]}]){
  const f=fixture();f.faults.response=response;await assert.rejects(f.api.generateImage(input),f.api.ImagePendingError);await assert.rejects(f.api.generateImage(input),f.api.ImagePendingError);assert.equal(f.submissions.length,1);
 }
});
test('a transient persistence failure retries only saving the purchased bytes',async()=>{
 const f=fixture();f.faults.save=1;await f.api.generateImage(input);await f.api.generateImage(input);assert.equal(f.submissions.length,1);assert.equal(f.counters().saves,2);
});
test('persistent storage failure preserves the claim and never repurchases',async()=>{
 const f=fixture();f.faults.save=2;await assert.rejects(f.api.generateImage(input),f.api.ImagePendingError);await assert.rejects(f.api.generateImage(input),f.api.ImagePendingError);assert.equal(f.submissions.length,1);
});
test('completed photos recover even with credentials removed or from a previous model',async()=>{
 const f=fixture();await f.api.generateImage(input);delete f.env.OPENAI_API_KEY;assert.equal((await f.api.generateImage(input)).quality,'medium');assert.equal(f.submissions.length,1);
 const old=fixture({});old.legacy(input,{base64:png().toString('base64')},'openai');assert.equal((await old.api.generateImage(input)).model,'gpt-image-1');assert.equal(old.submissions.length,0);
});
test('saved FLUX tasks resume after the default switch without OpenAI credentials',async()=>{
 const f=fixture({BFL_API_KEY:'test'});f.legacy();const result=await f.api.generateImage(input);assert.equal(result.provider,'bfl');assert.equal(result.model,'flux-3-image-klein');assert.equal(result.size,'896x1120');await f.api.generateImage(input);assert.equal(f.submissions.length,0);assert.equal(f.counters().polls,1);assert.equal(f.counters().downloads,1);
});
test('legacy FLUX download and polling failures reuse their purchased task',async()=>{
 for(const fault of ['download','poll']){
  const f=fixture({BFL_API_KEY:'test'});f.legacy();f.faults[fault]=true;await assert.rejects(f.api.generateImage(input));f.faults[fault]=false;await f.api.generateImage(input);assert.equal(f.submissions.length,0);
 }
});
test('legacy unknown submission is never resubmitted using the new provider',async()=>{
 const f=fixture();f.legacy(input,{});await assert.rejects(f.api.generateImage(input),f.api.ImagePendingError);assert.equal(f.submissions.length,0);
});
test('task IDs remain organization-bound and cannot be reused with different instructions',async()=>{
 const f=fixture();await f.api.generateImage(input);await assert.rejects(f.api.generateImage({...input,prompt:'Different'}),/different description/);await assert.rejects(f.api.generateImage({...input,format:'square'}),/different description/);await f.api.generateImage({...input,organizationId:'other'});assert.equal(f.submissions.length,2);assert.equal(f.jobs.size,2);
});
test('stable user description recovers the task despite regenerated context drift',async()=>{
 const f=fixture(),stable={...input,requestDescription:'Keep original requested subject'};await f.api.generateImage(stable);await f.api.generateImage({...stable,prompt:'History changed internally'});assert.equal(f.submissions.length,1);await assert.rejects(f.api.generateImage({...stable,requestDescription:'A different user request'}));
});
test('legacy polling addresses reject credential exfiltration',()=>{
 const f=fixture();for(const url of ['https://evil.example/v1/get_result','http://api.bfl.ai/v1/get_result','https://api.bfl.ai/v1/other','https://api.bfl.ai@evil.example/v1/get_result'])assert.throws(()=>f.api.imagePollingUrl(url));
});
