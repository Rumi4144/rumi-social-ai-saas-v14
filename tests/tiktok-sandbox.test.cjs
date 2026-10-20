const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={},cache=new Map()){
 file=path.resolve(root,file);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const requireFile=name=>name in mocks?mocks[name]:(name.startsWith('@/')||name.startsWith('.'))?load((name.startsWith('@/')?name.slice(2):path.relative(root,path.resolve(path.dirname(file),name)))+'.ts',mocks,cache):require(name);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:requireFile,process,Buffer,URL,URLSearchParams,Date,console,fetch:mocks.__fetch||fetch,Request,Response,Headers,Uint8Array,AbortSignal,setTimeout,clearTimeout});return module.exports;
}
const options={consent:true,privacy:'SELF_ONLY',title:'Test video',allowComment:false,allowDuet:false,allowStitch:false,commercial:false,ownBrand:false,brandedContent:false,aiGenerated:false};
const creator={creator_nickname:'Test account',privacy_level_options:['SELF_ONLY'],comment_disabled:false,duet_disabled:false,stitch_disabled:false,max_video_post_duration_sec:60};
const requestId='ad3958fa-c8e7-45de-ac98-4f66ed4c571f';
const next={NextResponse:{json:(body,options={})=>({body,status:options.status||200}),redirect:url=>({url:String(url),cookies:{set(){}}})}};

test('sandbox is administrator-only and uses separate credentials, provider and account-bound grants',async()=>{
 const old=Object.fromEntries(['TIKTOK_SANDBOX_CLIENT_KEY','TIKTOK_SANDBOX_CLIENT_SECRET','NEXT_PUBLIC_APP_URL'].map(k=>[k,process.env[k]]));
 Object.assign(process.env,{TIKTOK_SANDBOX_CLIENT_KEY:'test-key',TIKTOK_SANDBOX_CLIENT_SECRET:'test-secret',NEXT_PUBLIC_APP_URL:'https://rumisocialai.com'});
 let admin=false,grant={environment:'sandbox',clientKey:'test-key',openId:'test-account',accessToken:'token',scope:'video.publish',expiresAt:Date.now()+100000};
 try{
 const api=load('lib/tiktok/sandbox.ts',{'@/lib/auth/context':{tenantContext:async()=>({isSuperAdmin:admin})},'@/lib/prisma':{prisma:{}},'@/lib/security/crypto':{decryptSecret:()=>JSON.stringify(grant)},'./client':{tikTokCreator:async()=>({...creator,privacy_level_options:['PUBLIC_TO_EVERYONE','SELF_ONLY']})},__fetch:async()=>{throw Error('no request allowed');}});
 await assert.rejects(api.sandboxContext(),/administrator/);admin=true;await api.sandboxContext();assert.equal(api.sandboxProvider,'tiktok_sandbox');assert.equal(api.sandboxConfig().redirectUri,'https://rumisocialai.com/api/social/tiktok-test/callback/');
 assert.equal(await api.sandboxAccessToken({id:'test',organizationId:'own',externalId:'test-account',encryptedToken:'encrypted'}),'token');
 grant.clientKey='production-key';await assert.rejects(api.sandboxAccessToken({externalId:'test-account',encryptedToken:'encrypted'}),/Reconnect/);grant.clientKey='test-key';grant.environment='production';await assert.rejects(api.sandboxAccessToken({externalId:'test-account',encryptedToken:'encrypted'}),/Reconnect/);
 assert.deepEqual(Array.from((await api.sandboxCreator('token')).privacy_level_options),['SELF_ONLY']);
 const prod=load('lib/tiktok/client.ts',{'@/lib/prisma':{prisma:{}},'@/lib/security/crypto':{decryptSecret:()=>JSON.stringify({...grant,environment:'sandbox'})}});assert.throws(()=>prod.tikTokGrant({encryptedToken:'encrypted'}),/test area/);
 }finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

function fixture(){
 const state={job:null,inits:0,updates:0,admin:true,remote:'PROCESSING_DOWNLOAD',interrupted:false,connectionId:'sandbox-account',externalId:'creator'};
 const prisma={job:{findFirst:async q=>{assert.equal(q.where.organizationId,'own');assert.equal(q.where.type,'TIKTOK_SANDBOX_POST');return state.job;},create:async q=>{assert.equal(q.data.type,'TIKTOK_SANDBOX_POST');state.job={...q.data,createdAt:new Date()};return state.job;},update:async q=>{state.updates++;state.job={...state.job,...q.data};return state.job;}}};
 const api=load('app/api/social/tiktok-test/post/route.ts',{'next/server':next,'@/lib/prisma':{prisma},'@/lib/tiktok/sandbox':{sandboxContext:async()=>{if(!state.admin)throw Error('administrator only');return {organizationId:'own',userId:'owner'};},sandboxConnection:async org=>{assert.equal(org,'own');return {id:state.connectionId,externalId:state.externalId};},sandboxAsset:async(org,id)=>{assert.equal(org,'own');if(id!=='clip')throw Error('wrong business');return {asset:{id:'clip'},duration:10};},sandboxAccessToken:async()=> 'sandbox-token',sandboxCreator:async()=>creator},'@/lib/tiktok/video-url':{tikTokVideoUrl:(asset,org)=>{assert.equal(asset,'clip');assert.equal(org,'own');return 'https://rumisocialai.com/signed-video';}},'@/lib/tiktok/client':{tikTokJson:async(path,token,body)=>{assert.equal(token,'sandbox-token');if(path==='video/init'){state.inits++;assert.equal(body.post_info.privacy_level,'SELF_ONLY');if(state.interrupted)throw Error('connection interrupted');return {publish_id:'receipt'};}assert.equal(path,'status/fetch');assert.equal(body.publish_id,'receipt');return {status:state.remote};}}});
 const req=(patch={},origin='https://rumisocialai.com')=>new Request('https://rumisocialai.com/api/social/tiktok-test/post',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({assetId:'clip',connectionId:'sandbox-account',accountId:'creator',requestId,options,...patch})});
 return {api,state,req};
}
test('sandbox upload rejects public visibility, missing consent, foreign account/asset and cross-origin requests before creating receipts',async()=>{
 for(const patch of [{options:{...options,privacy:'PUBLIC_TO_EVERYONE'}},{options:{...options,consent:false}},{connectionId:'production-account'},{accountId:'changed-account'},{assetId:'foreign-clip'}]){const f=fixture();assert.equal((await f.api.POST(f.req(patch))).status,400);assert.equal(f.state.inits,0);assert.equal(f.state.job,null);}
 const f=fixture();assert.equal((await f.api.POST(f.req({},'https://attacker.test'))).status,403);f.state.admin=false;assert.equal((await f.api.POST(f.req())).status,400);assert.equal(f.state.inits,0);
});
test('private sandbox upload is idempotent, records processing separately and checks the same account receipt',async()=>{
 const f=fixture();const started=await f.api.POST(f.req());assert.equal(started.status,202);assert.equal(f.state.inits,1);assert.equal(f.state.job.status,'processing');
 await f.api.POST(f.req());assert.equal(f.state.inits,1);
 const req=new Request(`https://rumisocialai.com/api/social/tiktok-test/post?jobId=${started.body.jobId}`);
 let result=await f.api.GET(req);assert.equal(result.body.status,'processing');assert.equal(f.state.inits,1);
 f.state.remote='PUBLISH_COMPLETE';result=await f.api.GET(req);assert.equal(result.body.status,'succeeded');assert.equal(f.state.job.status,'succeeded');assert.equal(f.state.inits,1);
 f.state.job.status='processing';f.state.externalId='changed';assert.equal((await f.api.GET(req)).status,409);assert.equal(f.state.inits,1);
});
test('interrupted sandbox initialization is never silently resubmitted',async()=>{
 const f=fixture();f.state.interrupted=true;const result=await f.api.POST(f.req());assert.equal(result.body.status,'needs_review');assert.equal(f.state.inits,1);await f.api.POST(f.req());assert.equal(f.state.inits,1);
});

test('sandbox callback refuses production state, wrong workspace and missing cookie before token exchange',async()=>{
 let exchanges=0,state={userId:'owner',organizationId:'own',environment:'sandbox',redirectUri:'https://rumisocialai.com/api/social/tiktok-test/callback/'},cookie='state';
 const previous=process.env.NEXT_PUBLIC_APP_URL;process.env.NEXT_PUBLIC_APP_URL='https://rumisocialai.com';
 try{
 const api=load('app/api/social/tiktok-test/callback/route.ts',{'next/server':next,'next/headers':{cookies:async()=>({get:()=>({value:cookie})})},'@/lib/prisma':{prisma:{}},'@/lib/security/crypto':{},'@/lib/social/oauth-state':{verifyTikTokOAuthState:()=>state},'@/lib/tiktok/sandbox':{sandboxContext:async()=>({userId:'owner',organizationId:'own'}),sandboxConfig:()=>({origin:'https://rumisocialai.com',redirectUri:'https://rumisocialai.com/api/social/tiktok-test/callback/',clientKey:'test',clientSecret:'test'}),sandboxProvider:'tiktok_sandbox'},__fetch:async()=>{exchanges++;throw Error('must not exchange');}});
 const req=new Request('https://rumisocialai.com/api/social/tiktok-test/callback/?code=code&state=state');
 for(const mutate of [()=>{state.environment=undefined;},()=>{state.environment='sandbox';state.organizationId='foreign';},()=>{state.organizationId='own';cookie='wrong';}]){mutate();const response=await api.GET(req);assert.match(response.url,/result=error/);assert.equal(exchanges,0);}
 }finally{if(previous===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previous;}
});
