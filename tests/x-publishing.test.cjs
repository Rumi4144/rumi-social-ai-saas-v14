const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const origin='https://rumisocialai.com';
function fixture(){
 const tables=Object.fromEntries(['job','socialConnection','contentItem','publishJob','publishAttempt'].map(k=>[k,new Map()])),cache=new Map(),calls=[];
 const ctx={organizationId:'org',userId:'user',role:'owner'};
 let sequence=0,now=Date.now(),mediaBytes=Buffer.from('approved-media'),hook=async()=>{},postStatus=201,processing=false,failReceipt=false;
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const clone=v=>structuredClone(v);
 function matches(row,where){return Object.entries(where||{}).every(([k,v])=>{
   if(k==='OR')return v.some(w=>matches(row,w));
   const value=row[k];
   if(v&&typeof v==='object'&&!(v instanceof Date)){
    if('in'in v)return v.in.includes(value);if('lt'in v)return value<v.lt;if('lte'in v)return value<=v.lte;
    if('path'in v)return v.path.reduce((a,b)=>a?.[b],value)===v.equals;
    return matches(value||{},v);
   }
   return v instanceof Date?Number(value)===Number(v):value===v;
 });}
 function apply(row,data){for(const[k,v]of Object.entries(data))row[k]=v&&typeof v==='object'&&'increment'in v?(row[k]||0)+v.increment:clone(v);row.updatedAt=new Date(++now);return clone(row);}
 const db=Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,{
  findFirst:async({where,orderBy}={})=>{let values=[...rows.values()].filter(r=>matches(r,where));if(orderBy)values.sort((a,b)=>a.scheduledFor-b.scheduledFor);return clone(values[0]||null);},
  findUnique:async({where})=>clone([...rows.values()].find(r=>matches(r,where))||null),
  findMany:async({where}={})=>clone([...rows.values()].filter(r=>matches(r,where))),
  create:async({data})=>{const id=data.id||'row'+(++sequence);if(rows.has(id)){const e=new Error('duplicate');e.code='P2002';throw e;}const row={id,status:name==='publishJob'?'scheduled':'ready',attempts:0,createdAt:new Date(now),updatedAt:new Date(now),...clone(data)};rows.set(id,row);return clone(row);},
  updateMany:async({where,data})=>{if(failReceipt&&data.status==='succeeded')throw Error('database unavailable');let count=0;for(const row of rows.values())if(matches(row,where)){apply(row,data);count++;}return{count};},
  update:async({where,data})=>{const row=[...rows.values()].find(r=>matches(r,where));assert.ok(row);return apply(row,data);},
  upsert:async({where,create,update})=>{const row=[...rows.values()].find(r=>matches(r,where));return row?apply(row,update):db[name].create({data:create});},
  deleteMany:async({where})=>{let count=0;for(const[id,row]of rows)if(matches(row,where)){rows.delete(id);count++;}return{count};},
 }]));
 db.$transaction=async fn=>fn(db);
 const env={NODE_ENV:'test',NEXT_PUBLIC_APP_URL:origin,TOKEN_ENCRYPTION_KEY:'unit-test',X_CLIENT_ID:'client',X_CLIENT_SECRET:'client-secret'};
 const fetchMock=async(url,options={})=>{
  calls.push({url,options});await hook(url,options);
  assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  if(url.endsWith('/oauth2/token'))return Response.json({access_token:'renewed-access',refresh_token:'renewed-refresh',expires_in:7200,token_type:'bearer',scope:'tweet.read tweet.write users.read media.write offline.access'});
  if(url.endsWith('/users/me'))return Response.json({data:{id:'123',username:'RumiGuitars'}});
  if(url.endsWith('/initialize'))return Response.json({data:{id:'900',expires_after_secs:86400}});
  if(url.endsWith('/append'))return new Response(null,{status:204});
  if(url.endsWith('/finalize'))return Response.json({data:{id:'900',...(processing?{processing_info:{state:'pending',check_after_secs:1}}:{})}});
  if(url.includes('/2/media/upload?'))return Response.json({data:{id:'900',processing_info:{state:processing?'in_progress':'succeeded',check_after_secs:1}}});
  if(url.endsWith('/2/tweets'))return Response.json(postStatus===201?{data:{id:'555',text:'confirmed'}}:{detail:'private-token-should-never-appear'}, {status:postStatus});
  throw Error('Unexpected URL '+url);
 };
 let publisher;
 const mocks={
  '@/lib/prisma':{prisma:db},'@/lib/auth/context':{tenantContext:async()=>({...ctx})},
  '@/lib/x/media':{xHash:s=>require('node:crypto').createHash('sha256').update(s).digest('hex'),xMediaReference:url=>url?{assetId:'media',kind:url.includes('/video/')?'video':'photo'}:null,xMediaBytes:async(org,id)=>{assert.equal(org,'org');assert.equal(id,'post');return{bytes:mediaBytes,contentType:'video/mp4'};}},
  '@/lib/publishing/providers':{publishToProvider:async input=>{assert.equal(input.platform,'x');return publisher.publishX(input);}},
  '@/lib/tiktok/prepare':{prepareTikTokSettings:async()=>{throw Error('Unexpected TikTok');}},
  '@/lib/publishing/google-business':{googleBusinessPost:()=>{throw Error('Unexpected Google');}},
  'next/server':{NextResponse:{json:(value,init)=>Response.json(value,init)}},
 };
 function load(file){if(mocks['@/'+file.replace(/\.ts$/, '')])return mocks['@/'+file.replace(/\.ts$/, '')];if(cache.has(file))return cache.get(file);const module={exports:{}};cache.set(file,module.exports);const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{module,exports:module.exports,Buffer,URL,URLSearchParams,AbortSignal,Response,Date:Clock,Error,console,process:{env},fetch:fetchMock,require:name=>mocks[name]||(name.startsWith('@/')?load(name.slice(2)+'.ts'):name.startsWith('.')?load(path.join(path.dirname(file),name)+'.ts'):require(name))});return module.exports;
 }
 const security=load('lib/security/crypto.ts'),client=load('lib/x/connection.ts'),prep=load('lib/x/publishing.ts');publisher=load('lib/publishing/x.ts');
 const connection={id:'conn',organizationId:'org',provider:'x',externalId:'123',accountName:'RumiGuitars',status:'connected',encryptedToken:security.encryptSecret(JSON.stringify({accessToken:'access',refreshToken:'refresh',expiresAt:now+7200000,scope:client.X_SCOPES,clientId:'client'}))};
 const item={id:'post',caption:'Meet Rumi Guitars.',headline:'Rumi',mediaUrl:null,status:'approved',type:'image_post',campaign:{brand:{organizationId:'org'}}};
 tables.socialConnection.set(connection.id,connection);tables.contentItem.set(item.id,item);
 async function queue(id='publish'){
  const post=await prep.prepareXPost('org',item,connection);
  tables.publishJob.set(id,{id,organizationId:'org',contentItemId:'post',socialConnectionId:'conn',platform:'x',status:'publishing',attempts:1,scheduledFor:new Date(now),updatedAt:new Date(now)});
  // Reorder stored object keys as JSONB does.
  const payload=Object.fromEntries(Object.entries(post).sort(([a],[b])=>a.localeCompare(b)));
  tables.job.set('x_settings_'+id,{id:'x_settings_'+id,organizationId:'org',type:'X_POST_SETTINGS',status:'ready',payload,createdAt:new Date(now),updatedAt:new Date(now)});
  return id;
 }
 const publish=(id='publish',extra={})=>publisher.publishX({organizationId:'org',contentItemId:'post',publishJobId:id,externalAccountId:'123',...extra});
 const route=(name,body)=>load('app/api/publishing/'+name+'/route.ts').POST(new Request(origin+'/api/publishing/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
 return{db,tables,ctx,calls,connection,item,client,prep,security,queue,publish,route,load,setMedia:v=>mediaBytes=v,advance:n=>now+=n,setHook:v=>hook=v,setPostStatus:v=>postStatus=v,setProcessing:v=>processing=v,setFailReceipt:v=>failReceipt=v,posts:()=>calls.filter(c=>c.url.endsWith('/2/tweets'))};
}

test('X counts URLs, emoji and non-Latin text with the official validator',()=>{const f=fixture();assert.equal(f.prep.xCaption('a'.repeat(280),false).length,280);assert.throws(()=>f.prep.xCaption('a'.repeat(281),false),/281/);assert.doesNotThrow(()=>f.prep.xCaption('a'.repeat(256)+' '+ 'https://example.com/'+'b'.repeat(1000),false));assert.throws(()=>f.prep.xCaption('界'.repeat(141),false),/282/);assert.doesNotThrow(()=>f.prep.xCaption('👨‍👩‍👧‍👦'.repeat(140),false));assert.throws(()=>f.prep.xCaption('',false),/valid text/);});
test('X text publishing returns a real receipt and deduplicates retries and separate jobs',async()=>{const f=fixture();await f.queue();assert.equal((await f.publish()).externalId,'555');assert.equal((await f.publish()).externalId,'555');await f.queue('second');assert.equal((await f.publish('second')).externalId,'555');assert.equal(f.posts().length,1);assert.deepEqual(JSON.parse(f.posts()[0].options.body),{text:'Meet Rumi Guitars.'});});
test('concurrent X submissions claim a single public write',async()=>{const f=fixture();await f.queue();await f.queue('second');const results=await Promise.all([f.publish(),f.publish('second')]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.pending).length,1);assert.equal(f.posts().length,1);});
test('X video uploads approved bytes once, polls processing, then publishes with the same media ID',async()=>{const f=fixture();f.item.mediaUrl='/api/video/media/media';f.setProcessing(true);await f.queue();assert.equal((await f.publish()).pending,true);assert.equal(f.posts().length,0);f.advance(300000);f.setProcessing(false);assert.equal((await f.publish()).ok,true);assert.equal(f.calls.filter(c=>c.url.endsWith('/initialize')).length,1);const append=f.calls.find(c=>c.url.endsWith('/append'));assert.equal(Buffer.from(JSON.parse(append.options.body).media,'base64').toString(),'approved-media');assert.deepEqual(JSON.parse(f.posts()[0].options.body).media,{media_ids:['900']});});
test('X photo uploads use tweet_image and preserve approved bytes',async()=>{const f=fixture();f.item.mediaUrl='/api/media/media';await f.queue();assert.equal((await f.publish()).ok,true);assert.equal(JSON.parse(f.calls.find(c=>c.url.endsWith('/initialize')).options.body).media_category,'tweet_image');});
test('changed caption, withdrawn approval, or changed media cannot be published',async()=>{for(const change of[f=>f.item.caption='Different product',f=>f.item.status='draft',f=>f.setMedia(Buffer.from('wrong guitar'))]){const f=fixture();f.item.mediaUrl='/api/video/media/media';await f.queue();change(f);assert.equal((await f.publish()).ok,false);assert.equal(f.posts().length,0);}});
test('X rejects cross-workspace context and a swapped account before API calls',async()=>{for(const extra of[{organizationId:'foreign'},{externalAccountId:'999'}]){const f=fixture();await f.queue();assert.equal((await f.publish('publish',extra)).ok,false);assert.equal(f.calls.length,0);}});
test('a timed-out X public write is never resubmitted, even from a new job',async()=>{const f=fixture();await f.queue();f.setHook(async url=>{if(url.endsWith('/2/tweets'))throw Error('timeout with secret');});assert.match((await f.publish()).error,/did not confirm/);await f.queue('second');assert.match((await f.publish('second')).error,/did not confirm/);assert.equal(f.posts().length,1);});
test('failure to save a confirmed receipt leaves a no-resubmit marker',async()=>{const f=fixture();await f.queue();f.setFailReceipt(true);assert.match((await f.publish()).error,/did not confirm/);f.setFailReceipt(false);assert.match((await f.publish()).error,/did not confirm/);assert.equal(f.posts().length,1);});
test('explicit X credit rejection is actionable, hides raw errors, and permits a deliberate retry',async()=>{const f=fixture();await f.queue();f.setPostStatus(402);const result=await f.publish();assert.match(result.error,/API credits/);assert.ok(!result.error.includes('private-token'));assert.equal(result.retryable,false);assert.equal((await f.publish()).ok,false);assert.equal(f.posts().length,1);await f.queue('retry');f.setPostStatus(201);assert.equal((await f.publish('retry')).ok,true);assert.equal(f.posts().length,2);});
test('X refresh rotates encrypted tokens before publishing',async()=>{const f=fixture();const grant=JSON.parse(f.security.decryptSecret(f.connection.encryptedToken));grant.expiresAt=1;f.connection.encryptedToken=f.security.encryptSecret(JSON.stringify(grant));await f.queue();assert.equal((await f.publish()).ok,true);assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth2/token')).length,1);const stored=f.security.decryptSecret(f.connection.encryptedToken);assert.equal(JSON.parse(stored).refreshToken,'renewed-refresh');assert.ok(!f.connection.encryptedToken.includes('renewed'));assert.equal(f.posts()[0].options.headers.Authorization,'Bearer renewed-access');});
test('concurrent refreshes use a refresh token once and cannot overwrite reconnection',async()=>{const f=fixture();const grant=JSON.parse(f.security.decryptSecret(f.connection.encryptedToken));grant.expiresAt=1;f.connection.encryptedToken=f.security.encryptSecret(JSON.stringify(grant));const copy={...f.connection};f.setHook(async url=>{if(url.endsWith('/oauth2/token'))f.connection.encryptedToken=f.security.encryptSecret(JSON.stringify({...grant,accessToken:'reconnected',expiresAt:Date.now()+7200000}));});const results=await Promise.allSettled([f.prep.xAccessToken(copy),f.prep.xAccessToken(copy)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,0);assert.equal(f.calls.filter(c=>c.url.endsWith('/oauth2/token')).length,1);assert.equal(JSON.parse(f.security.decryptSecret(f.connection.encryptedToken)).accessToken,'reconnected');assert.equal(f.connection.status,'connected');});
test('disconnect during account verification prevents the public write',async()=>{const f=fixture();await f.queue();f.setHook(async url=>{if(url.endsWith('/users/me'))f.tables.socialConnection.delete('conn');});assert.match((await f.publish()).error,/Enable X posting/);assert.equal(f.posts().length,0);});
test('real schedule route saves an approved X snapshot and cron publishes it',async()=>{const f=fixture();const response=await f.route('schedule',{contentItemId:'post',socialConnectionIds:['conn'],scheduledFor:new Date(Date.now()+60000).toISOString()});assert.equal(response.status,201);const body=await response.json();assert.equal(body.scheduled,1);assert.ok(f.tables.job.has('x_settings_'+body.jobs[0].id));f.advance(120000);const result=await f.load('lib/publishing/process-due-job.ts').processDuePublishJob();assert.equal(result.status,'published');assert.equal(f.posts().length,1);});
test('real immediate route publishes only the approved account and records its receipt',async()=>{const f=fixture();const response=await f.route('now',{contentItemId:'post',socialConnectionId:'conn'});assert.equal(response.status,200);assert.equal((await response.json()).externalPostId,'555');assert.equal(f.item.status,'published');assert.equal(f.posts().length,1);});
test('legacy permission, viewer role, and long caption fail before scheduling writes',async()=>{for(const change of[f=>f.connection.status='linked',f=>f.ctx.role='viewer',f=>f.item.caption='x'.repeat(281)]){const f=fixture();change(f);const response=await f.route('schedule',{contentItemId:'post',socialConnectionIds:['conn'],scheduledFor:new Date(Date.now()+60000).toISOString()});assert.ok(response.status>=400);assert.equal(f.tables.publishJob.size,0);assert.equal(f.calls.length,0);}});
test('stale interrupted X worker recovers a receipt without resending',async()=>{const f=fixture();await f.queue();await f.publish();const job=f.tables.publishJob.get('publish');job.updatedAt=new Date(Date.now()-1200000);f.advance(1200000);const result=await f.load('lib/publishing/process-due-job.ts').processDuePublishJob();assert.equal(result.status,'published');assert.equal(f.posts().length,1);});
