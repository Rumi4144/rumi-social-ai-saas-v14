const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={},cache=new Map()){file=path.resolve(root,file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:name=>name in mocks?mocks[name]:name.startsWith('@/')||name.startsWith('.')?load((name.startsWith('@/')?name.slice(2):path.relative(root,path.resolve(path.dirname(file),name)))+'.ts',mocks,cache):require(name),process,URL,Response,Request,AbortSignal,Date,console,fetch:mocks.__fetch});return module.exports;}
test('email alerts use the configured recipient and original customer, and deduplicate unchanged requests',async()=>{
 const oldKey=process.env.RESEND_API_KEY,oldFrom=process.env.RESEND_FROM_EMAIL;
 process.env.RESEND_API_KEY='test';process.env.RESEND_FROM_EMAIL='Rumi <alerts@example.test>';
 try{
  let enabled=false,foreign=false,fail=false,calls=[],result=null,comment='Change the photo';
  const prisma={job:{findUnique:async()=>({payload:{email:'admin@example.test',enabled}}),findFirst:async q=>{assert.equal(q.where.organizationId,'own');return{id:'request',payload:{contentItemId:'post',comment},result};},updateMany:async q=>{result=q.data.result;return{count:1};}},contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'own');return foreign?null:{headline:'Martinez guitar'};}},organization:{findUnique:async()=>({name:'Rumi Guitars'})}};
  const service=load('lib/admin/request-notifications.ts',{'@/lib/prisma':{prisma},__fetch:async(url,init)=>{calls.push(JSON.parse(init.body));return new Response('{}',{status:fail?500:200});}});
  assert.equal(await service.notifyCustomerRequest('own','request'),'not_configured');assert.equal(calls.length,0);
  enabled=true;foreign=true;assert.equal(await service.notifyCustomerRequest('own','request'),'not_found');assert.equal(calls.length,0);
  foreign=false;assert.equal(await service.notifyCustomerRequest('own','request'),'sent');assert.equal(calls.length,1);assert.deepEqual(calls[0].to,['admin@example.test']);assert.match(calls[0].text,/Rumi Guitars/);assert.match(calls[0].text,/Change the photo/);assert.match(calls[0].text,/organizationId=own/);
  assert.equal(await service.notifyCustomerRequest('own','request'),'already_sent');assert.equal(calls.length,1);
  comment='Use a brighter photo';fail=true;await assert.rejects(service.notifyCustomerRequest('own','request'),/DELIVERY_FAILED/);assert.equal(calls.length,2);
 }finally{if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;if(oldFrom===undefined)delete process.env.RESEND_FROM_EMAIL;else process.env.RESEND_FROM_EMAIL=oldFrom;}
});
