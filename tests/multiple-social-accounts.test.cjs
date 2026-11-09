const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/weekly-load.cjs');
function fixture(){
 const rows=[{id:'one',organizationId:'org',provider:'youtube',externalId:'channel1',status:'connected',encryptedToken:'one-token'},{id:'other-org',organizationId:'foreign',provider:'youtube',externalId:'channel1',status:'connected',encryptedToken:'foreign-token'}];
 const match=(row,q)=>Object.entries(q).every(([k,v])=>typeof v==='object'&&v!==null?'not'in v?row[k]!==v.not:'in'in v?v.in.includes(row[k]):false:row[k]===v);
 const tx={socialConnection:{findFirst:async({where})=>rows.find(r=>match(r,where))||null,update:async({where,data})=>Object.assign(rows.find(r=>r.id===where.id),data),create:async({data})=>{const r={id:'new'+rows.length,...data};rows.push(r);return r;}},$executeRaw:async()=>{}};
 let queue=Promise.resolve();const prisma={$transaction:fn=>{const r=queue.then(()=>fn(tx));queue=r.catch(()=>{});return r;}};
 return {rows,prisma,save:load('lib/social/save-account.ts',{'@/lib/prisma':{prisma}}).saveProviderAccount};
}
test('new YouTube and TikTok identities append; reconnect updates only the identical owned account',async()=>{
 const f=fixture();await f.save('org','youtube','channel2','Second channel','second-token');await f.save('org','tiktok','creator1','Creator','creator-token');
 assert.equal(f.rows[0].encryptedToken,'one-token');assert.equal(f.rows[1].encryptedToken,'foreign-token');assert.equal(f.rows.length,4);
 await f.save('org','youtube','channel1','Renamed channel','renewed');assert.equal(f.rows[0].encryptedToken,'renewed');assert.equal(f.rows.length,4);
 await Promise.all([f.save('org','youtube','channel3','Third','3a'),f.save('org','youtube','channel3','Third','3b')]);assert.equal(f.rows.filter(r=>r.organizationId==='org'&&r.externalId==='channel3').length,1);
});
function disconnectFixture(provider){
 const writes=[],context={organizationId:'org',role:'owner'},connections=[{id:'a',organizationId:'org',provider,encryptedToken:'token-a'},{id:'b',organizationId:'org',provider,encryptedToken:'token-b'}];
 const db={socialConnection:{findFirst:async({where})=>connections.find(c=>c.id===where.id&&c.organizationId===where.organizationId&&c.provider===where.provider),findMany:async({where})=>connections.filter(c=>c.id===where.id&&c.organizationId===where.organizationId),update:async({where,data})=>{writes.push(['connection',where.id]);Object.assign(connections.find(c=>c.id===where.id),data);},updateMany:async({where,data})=>{writes.push(['connection',where.id]);Object.assign(connections.find(c=>c.id===where.id),data);return{count:1};}},publishJob:{updateMany:async({where})=>{writes.push(['publish',where.socialConnectionId]);return{count:1};}},job:{updateMany:async()=>({count:0})},$executeRaw:async()=>{}};db.$transaction=fn=>fn(db);
 const api=load(`app/api/social/${provider==='google_business'?'google-business':provider}/disconnect/route.ts`,{'@/lib/prisma':{prisma:db},'@/lib/auth/context':{tenantContext:async()=>context},'@/lib/google-business/session':{requireGoogleWriter:role=>{if(role==='viewer')throw Error('FORBIDDEN');},sameAppRequest:req=>req.headers.get('origin')==='https://rumisocialai.com'},'@/lib/google-business/client':{GOOGLE_BUSINESS_PROVIDER:'google_business'}});
 const run=id=>api.POST(new Request('https://rumisocialai.com/disconnect',{method:'POST',headers:{origin:'https://rumisocialai.com'},body:new URLSearchParams({connectionId:id})}));
 return{connections,writes,context,run};
}
for(const provider of ['tiktok','google_business'])test(`${provider} disconnect affects only the named owned connection`,async()=>{
 const f=disconnectFixture(provider);assert.equal((await f.run('foreign')).status>=400,true);assert.equal(f.writes.length,0);
 assert.equal((await f.run('a')).status,303);assert.equal(f.connections[1].encryptedToken,'token-b');assert.equal(f.connections[0].encryptedToken,null);
 assert.equal(f.writes.some(w=>w[0]==='publish'&&(w[1]==='a'||w[1]?.in?.includes('a'))),true);
});
test('YouTube disconnect preserves sibling grants and rejects another business channel',async()=>{
 let deleted=[],revokes=0;const own={id:'a',organizationId:'org',provider:'youtube',encryptedToken:'grant'};
 const api=load('app/api/social/youtube/disconnect/route.ts',{'@/lib/auth/context':{tenantContext:async()=>({organizationId:'org',role:'owner'})},'@/lib/prisma':{prisma:{socialConnection:{findFirst:async({where})=>typeof where.id==='object'?{id:'b'}:where.id==='a'?own:null}}},'@/lib/security/crypto':{decryptSecret:()=>JSON.stringify({refreshToken:'shared'})},'@/lib/publishing/youtube-data':{deleteYouTubeData:async c=>{deleted.push(c.id);return true;}},__fetch:async()=>{revokes++;return new Response();}});
 const run=id=>api.POST(new Request('https://rumisocialai.com/disconnect',{method:'POST',headers:{origin:'https://rumisocialai.com'},body:new URLSearchParams({connectionId:id,confirm:'yes'})}));
 assert.equal((await run('foreign')).status,404);assert.deepEqual(deleted,[]);
 assert.equal((await run('a')).status,303);assert.deepEqual(deleted,['a']);assert.equal(revokes,0);
});
