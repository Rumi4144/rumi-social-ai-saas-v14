const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={},cache=new Map()){
 file=path.resolve(root,file);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 const requireFile=name=>name in mocks?mocks[name]:(name.startsWith('@/')||name.startsWith('.'))?load((name.startsWith('@/')?name.slice(2):path.relative(root,path.resolve(path.dirname(file),name)))+'.ts',mocks,cache):require(name);
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module,exports:module.exports,require:requireFile,process,Buffer,URL,URLSearchParams,Date,console,fetch:mocks.__fetch||fetch,Request,Response,Headers,Uint8Array,AbortSignal,setTimeout,clearTimeout});return module.exports;
}
const options={consent:true,privacy:'SELF_ONLY',title:'A short moment between tasks.',allowComment:false,allowDuet:false,allowStitch:false,commercial:false,ownBrand:false,brandedContent:false,aiGenerated:false};
const creator={creator_nickname:'Master Mind',creator_username:'mastermind',privacy_level_options:['SELF_ONLY'],comment_disabled:false,duet_disabled:true,stitch_disabled:true,max_video_post_duration_sec:60};
const connection={id:'connection',organizationId:'own',provider:'tiktok',externalId:'creator',encryptedToken:'encrypted',status:'connected'};
const json={NextResponse:{json:(body,options={})=>({body,status:options.status||200})}};

test('TikTok requires explicit privacy and consent, valid disclosure and current creator limits',()=>{
 const api=load('lib/tiktok/options.ts');
 assert.ok(api.TikTokOptions.safeParse(options).success);
 for(const value of [{...options,consent:false},{...options,privacy:''},{...options,commercial:true},{...options,commercial:true,brandedContent:true},{...options,ownBrand:true}])assert.equal(api.TikTokOptions.safeParse(value).success,false);
 assert.throws(()=>api.validateTikTokOptions({...options,privacy:'PUBLIC_TO_EVERYONE'},creator,15),/privacy/);
 assert.throws(()=>api.validateTikTokOptions(options,creator,61),/length/);
 assert.throws(()=>api.validateTikTokOptions({...options,allowDuet:true},creator,15),/permissions changed/);
 api.validateTikTokOptions(options,creator,15);
});

test('sign-in-only TikTok connections cannot post; refresh is bound to the same account and encrypted grant',async()=>{
 let grant={openId:'creator',scope:'user.info.basic',accessToken:'old',refreshToken:'refresh',expiresAt:0},saved,requests=0;
 const oldKey=process.env.TIKTOK_CLIENT_KEY,oldSecret=process.env.TIKTOK_CLIENT_SECRET;
 process.env.TIKTOK_CLIENT_KEY='test-key';process.env.TIKTOK_CLIENT_SECRET='test-secret';
 try{
 const api=load('lib/tiktok/client.ts',{'@/lib/security/crypto':{decryptSecret:()=>JSON.stringify(grant),encryptSecret:()=> 'new-encrypted'},'@/lib/prisma':{prisma:{socialConnection:{updateMany:async q=>{saved=q;return {count:1};}}}},__fetch:async(url,init)=>{requests++;assert.equal(init.body.get('grant_type'),'refresh_token');return new Response(JSON.stringify({open_id:'creator',access_token:'new',refresh_token:'rotated',expires_in:86400,scope:'user.info.basic,video.publish'}));}});
 await assert.rejects(api.tikTokAccessToken(connection),/sign-in only/);assert.equal(requests,0);
 grant.scope='user.info.basic,video.publish';assert.equal(await api.tikTokAccessToken(connection),'new');assert.equal(saved.where.organizationId,'own');assert.equal(saved.where.encryptedToken,'encrypted');assert.equal(saved.data.encryptedToken,'new-encrypted');
 grant.openId='someone-else';await assert.rejects(api.tikTokAccessToken(connection),/account changed/);assert.equal(requests,1);
 }finally{if(oldKey===undefined)delete process.env.TIKTOK_CLIENT_KEY;else process.env.TIKTOK_CLIENT_KEY=oldKey;if(oldSecret===undefined)delete process.env.TIKTOK_CLIENT_SECRET;else process.env.TIKTOK_CLIENT_SECRET=oldSecret;}
});

test('TikTok creator API checks HTTP-200 error codes and keeps public posting behind audit confirmation',async()=>{
 let error=false;const previous=process.env.TIKTOK_PUBLIC_POSTING_APPROVED;delete process.env.TIKTOK_PUBLIC_POSTING_APPROVED;
 try{
 const api=load('lib/tiktok/client.ts',{'@/lib/security/crypto':{},'@/lib/prisma':{prisma:{}},__fetch:async(url,init)=>{assert.equal(init.headers.Authorization,'Bearer token');return new Response(JSON.stringify(error?{error:{code:'spam_risk_too_many_posts'}}:{error:{code:'ok'},data:{...creator,privacy_level_options:['PUBLIC_TO_EVERYONE','SELF_ONLY']}}));}});
 assert.deepEqual(Array.from((await api.tikTokCreator('token')).privacy_level_options),['SELF_ONLY']);
 process.env.TIKTOK_PUBLIC_POSTING_APPROVED='true';assert.equal((await api.tikTokCreator('token')).privacy_level_options.length,2);
 error=true;await assert.rejects(api.tikTokCreator('token'),/spam_risk_too_many_posts/);
 }finally{if(previous===undefined)delete process.env.TIKTOK_PUBLIC_POSTING_APPROVED;else process.env.TIKTOK_PUBLIC_POSTING_APPROVED=previous;}
});

function publisherFixture(){
 const state={receipt:null,status:'PROCESSING_DOWNLOAD',inits:0,checks:0,asset:true,settings:{options,assetId:'clip',accountId:'creator'},throwInit:false,job:true,claims:0};
 const prisma={publishJob:{findFirst:async q=>{assert.equal(q.where.organizationId,'own');assert.equal(q.where.contentItemId,'post');return state.job?{id:'publish',socialConnectionId:'connection'}:null;}},socialConnection:{findFirst:async q=>{assert.equal(q.where.organizationId,'own');assert.equal(q.where.externalId,'creator');return connection;}},mediaAsset:{findFirst:async q=>{assert.equal(q.where.organizationId,'own');assert.equal(q.where.contentItemId,'post');return state.asset?{id:'clip',metadata:{contentType:'video/mp4',duration:15}}:null;}},job:{findFirst:async q=>q.where.type==='TIKTOK_POST_SETTINGS'?{payload:state.settings}:state.receipt,create:async q=>{state.claims++;state.receipt={...q.data,createdAt:new Date()};return state.receipt;},update:async q=>{state.receipt={...state.receipt,...q.data};return state.receipt;}}};
 const client={tikTokAccessToken:async()=> 'token',tikTokCreator:async()=>creator,tikTokJson:async(path,token,body)=>{assert.equal(token,'token');if(path==='video/init'){state.inits++;assert.equal(body.source_info.source,'PULL_FROM_URL');assert.equal(body.post_info.privacy_level,'SELF_ONLY');assert.equal(body.post_info.disable_duet,true);assert.equal(body.post_info.title,options.title);if(state.throwInit)throw Error('connection interrupted');return {publish_id:'receipt'};}assert.equal(body.publish_id,'receipt');state.checks++;return {status:state.status,publicaly_available_post_id:[],fail_reason:'file_format_check_failed'};}};
 const api=load('lib/publishing/tiktok.ts',{'@/lib/prisma':{prisma},'@/lib/tiktok/client':client,'@/lib/tiktok/video-url':{tikTokVideoUrl:()=> 'https://app.test/signed-media'}});
 return {api,state,args:{assetId:'clip',organizationId:'own',contentItemId:'post',publishJobId:'publish',externalAccountId:'creator'}};
}
test('TikTok records acceptance, polls the same upload and reports posted only after completion',async()=>{
 const f=publisherFixture();let result=await f.api.publishTikTokVideo(f.args);assert.equal(result.pending,true);assert.equal(result.ok,false);assert.equal(f.state.inits,1);
 result=await f.api.publishTikTokVideo(f.args);assert.equal(result.pending,true);assert.equal(f.state.inits,1);
 f.state.status='PUBLISH_COMPLETE';result=await f.api.publishTikTokVideo(f.args);assert.equal(result.ok,true);assert.equal(f.state.receipt.status,'succeeded');
 await f.api.publishTikTokVideo(f.args);assert.equal(f.state.inits,1);assert.equal(f.state.checks,3);
});
test('failed and interrupted TikTok uploads never silently create a duplicate',async()=>{
 const f=publisherFixture();f.state.status='FAILED';let result=await f.api.publishTikTokVideo(f.args);assert.equal(result.retryable,false);assert.match(result.error,/file_format_check_failed/);
 result=await f.api.publishTikTokVideo(f.args);assert.equal(result.ok,false);assert.equal(f.state.inits,1);
 const interrupted=publisherFixture();interrupted.state.throwInit=true;await interrupted.api.publishTikTokVideo(interrupted.args);await interrupted.api.publishTikTokVideo(interrupted.args);assert.equal(interrupted.state.inits,1);
});
test('missing job, unapproved settings, wrong account/video and missing media fail before TikTok init',async()=>{
 for(const mutate of [s=>s.job=false,s=>s.asset=false,s=>s.settings={...s.settings,accountId:'other'},s=>s.settings={...s.settings,assetId:'other'},s=>s.settings={...s.settings,options:{...options,consent:false}}]){const f=publisherFixture();mutate(f.state);assert.equal((await f.api.publishTikTokVideo(f.args)).ok,false);assert.equal(f.state.inits,0);assert.equal(f.state.claims,0);}
});

test('creator settings enforce tenant and post ownership before reading TikTok data',async()=>{
 let own=false,calls=0;
 const api=load('app/api/social/tiktok/creator/route.ts',{'next/server':json,'@/lib/auth/context':{tenantContext:async()=>({organizationId:'own',role:'owner'})},'@/lib/prisma':{prisma:{socialConnection:{findFirst:async q=>{assert.equal(q.where.organizationId,'own');return own?connection:null;}},contentItem:{findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'own');return null;}}}},'@/lib/tiktok/client':{tikTokAccessToken:async()=>{calls++;},tikTokCreator:async()=>{calls++;}},'@/lib/publishing/facebook-video':{campaignVideoId:()=>null}});
 const req=new Request('https://app.test/api/social/tiktok/creator?connectionId=foreign&contentItemId=foreign');
 assert.equal((await api.GET(req)).status,404);own=true;assert.equal((await api.GET(req)).status,404);assert.equal(calls,0);
});

test('TikTok signed media cannot be reused for another tenant, video, expired request or platform',()=>{
 const old=process.env.AUTH_SECRET;process.env.AUTH_SECRET='test-secret';
 try{const api=load('lib/tiktok/video-url.ts'),instagram=load('lib/publishing/instagram-video-url.ts');const url=new URL(api.tikTokVideoUrl('clip','own'));const exp=url.searchParams.get('expires'),sig=url.searchParams.get('signature');assert.equal(api.validTikTokVideoUrl('clip','own',exp,sig),true);assert.equal(api.validTikTokVideoUrl('clip','other',exp,sig),false);assert.equal(api.validTikTokVideoUrl('other','own',exp,sig),false);assert.equal(api.validTikTokVideoUrl('clip','own',String(Date.now()-1),sig),false);assert.equal(instagram.validInstagramVideoUrl('clip','own',exp,sig),false);}finally{if(old===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=old;}
});

for(const route of ['now','schedule'])test(`TikTok ${route} refuses missing consent before creating any publishing jobs`,async()=>{
 let writes=0,prepared=0;
 const prisma={contentItem:{findFirst:async()=>({id:'post',status:'approved',mediaUrl:'/api/video/media/clip',type:'reel_post'})},socialConnection:{findFirst:async q=>q.where.provider&&q.where.provider!=='tiktok'?null:connection},publishJob:{create:async()=>{writes++;}},$transaction:async()=>{writes++;}};
 const api=load(`app/api/publishing/${route}/route.ts`,{'next/server':json,'@/lib/prisma':{prisma},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'own',role:'owner'})},'@/lib/tiktok/prepare':{prepareTikTokSettings:async(org,item,conn,raw)=>{prepared++;assert.equal(org,'own');assert.equal(conn.id,'connection');throw Error('Review TikTok privacy and consent.');}},'@/lib/publishing/facebook-video':{campaignVideoId:()=> 'clip'},'@/lib/publishing/google-business':{},'@/lib/publishing/providers':{}});
 const response=await api.POST({json:async()=>({contentItemId:'post',socialConnectionId:'connection',socialConnectionIds:['connection'],scheduledFor:'2027-01-01T12:00:00Z'})});assert.equal(response.status,400);assert.equal(writes,0);assert.equal(prepared,1);
});

test('TikTok scheduling stores the reviewed caption, privacy and exact asset with the queued job',async()=>{
 let saved,jobCount=0;
 const prisma={contentItem:{findFirst:async()=>({id:'post',status:'approved',mediaUrl:'/api/video/media/clip',type:'reel_post'}),update:async()=>({})},socialConnection:{findFirst:async q=>q.where.provider&&q.where.provider!=='tiktok'?null:connection},$transaction:async fn=>fn({publishJob:{upsert:async()=>{jobCount++;return {id:'publish'};}},job:{upsert:async q=>{saved=q.create;return q.create;}}})};
 const frozen={options,assetId:'clip',accountId:'creator'};
 const api=load('app/api/publishing/schedule/route.ts',{'next/server':json,'@/lib/prisma':{prisma},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'own',role:'owner'})},'@/lib/tiktok/prepare':{prepareTikTokSettings:async()=> frozen},'@/lib/publishing/facebook-video':{campaignVideoId:()=> 'clip'},'@/lib/publishing/google-business':{}});
 const response=await api.POST({json:async()=>({contentItemId:'post',socialConnectionIds:['connection'],scheduledFor:'2027-01-01T12:00:00Z',tiktok:options})});
 assert.equal(response.status,201);assert.equal(jobCount,1);assert.equal(saved.id,'tiktok_settings_publish');assert.equal(saved.organizationId,'own');assert.equal(saved.payload.assetId,'clip');assert.equal(saved.payload.options.title,options.title);assert.equal(saved.payload.options.privacy,'SELF_ONLY');
});

test('TikTok connect requests publishing scope, binds the OAuth cookie and rejects viewers',async()=>{
 let role='owner';const previous=process.env.TIKTOK_CLIENT_KEY,app=process.env.NEXT_PUBLIC_APP_URL;process.env.TIKTOK_CLIENT_KEY='key';process.env.NEXT_PUBLIC_APP_URL='https://app.test';
 try{
 const api=load('app/api/social/tiktok/connect/route.ts',{'next/server':{NextResponse:{json:json.NextResponse.json,redirect:url=>({url,cookies:{set:(...args)=>{cookie=args;}}})}},'@/lib/auth/context':{tenantContext:async()=>({userId:'user',organizationId:'own',role})},'@/lib/social/oauth-state':{createTikTokOAuthState:()=> 'signed-state'}});
 let cookie;const response=await api.GET();const url=new URL(response.url);assert.equal(url.searchParams.get('scope'),'user.info.basic,video.publish');assert.equal(cookie[0],'tiktok_oauth');assert.equal(cookie[1],'signed-state');assert.equal(cookie[2].httpOnly,true);role='viewer';assert.equal((await api.GET()).status,403);
 }finally{if(previous===undefined)delete process.env.TIKTOK_CLIENT_KEY;else process.env.TIKTOK_CLIENT_KEY=previous;if(app===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=app;}
});

test('TikTok OAuth callback stays bound to the signed-in user and workspace before exchanging tokens',async()=>{
 let exchanges=0;const cookie='signed-state';
 const api=load('app/api/social/tiktok/callback/route.ts',{'next/server':{NextResponse:{redirect:url=>({url})}},'next/headers':{cookies:async()=>({get:()=>({value:cookie})})},'@/lib/auth/context':{tenantContext:async()=>({organizationId:'other',userId:'other',role:'owner'})},'@/lib/social/oauth-state':{verifyTikTokOAuthState:()=>({organizationId:'own',userId:'user'})},'@/lib/security/crypto':{},'@/lib/prisma':{prisma:{}},__fetch:async()=>{exchanges++;throw Error('must not exchange');}});
 const key=process.env.TIKTOK_CLIENT_KEY,secret=process.env.TIKTOK_CLIENT_SECRET;process.env.TIKTOK_CLIENT_KEY='key';process.env.TIKTOK_CLIENT_SECRET='secret';
 try{const result=await api.GET(new Request('https://app.test/api/social/tiktok/callback/?code=code&state=signed-state'));assert.match(result.url,/reason=workspace/);assert.equal(exchanges,0);}finally{if(key===undefined)delete process.env.TIKTOK_CLIENT_KEY;else process.env.TIKTOK_CLIENT_KEY=key;if(secret===undefined)delete process.env.TIKTOK_CLIENT_SECRET;else process.env.TIKTOK_CLIENT_SECRET=secret;}
});
