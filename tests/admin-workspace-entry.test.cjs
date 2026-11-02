const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const {load}=require('./helpers/weekly-load.cjs');
function setup(failure, campaignOrg=true) {
 const cookies=[], reads=[];
 const api=load('app/admin/enter/[id]/route.ts', {
  'next/server':{NextResponse:{redirect:url=>({url:String(url),cookies:{set:(...v)=>cookies.push(v)}}),json:(body,opts)=>({body,status:opts.status})}},
  '@/lib/admin/context':{superAdminContext:async()=>{if(failure==='UNAUTHENTICATED'||failure==='FORBIDDEN')throw Error(failure);}},
  '@/lib/prisma':{prisma:{organization:{findUnique:async q=>{reads.push(q);if(failure==='database')throw Error('database');return failure==='missing'?null:{id:'org'};}},campaign:{findFirst:async q=>{assert.equal(q.where.brand.organizationId,'org');return campaignOrg?{id:'campaign'}:null;}}}}
 });
 return {cookies,reads,run:query=>api.GET(new Request('https://rumisocialai.com/admin/enter/org'+(query||'')),{params:Promise.resolve({id:'org'})})};
}
test('workspace entry stays on current host and sets an Admin-only workspace cookie',async()=>{
 const f=setup();const r=await f.run();assert.equal(r.url,'https://rumisocialai.com/dashboard');assert.equal(f.cookies[0][0],'adminWorkspace');assert.equal(f.cookies[0][1],'org');assert.equal(f.cookies[0][2].httpOnly,true);
 const campaign=setup();assert.equal((await campaign.run('?campaignId=campaign')).url,'https://rumisocialai.com/campaigns/campaign');
 assert.equal((await setup(null,false).run('?campaignId=foreign')).url,'https://rumisocialai.com/dashboard');
});
test('entry preserves authentication boundaries and does not disguise operational errors as sign-outs',async()=>{
 for(const [error,status] of [['FORBIDDEN',403],['database',503]]) {const f=setup(error);assert.equal((await f.run()).status,status);assert.equal(f.cookies.length,0);}
 const unauth=setup('UNAUTHENTICATED');assert.equal((await unauth.run()).url,'https://rumisocialai.com/login');assert.equal(unauth.reads.length,0);
 assert.equal((await setup('missing').run()).url,'https://rumisocialai.com/admin');
});
test('workspace switch links use same-origin full navigation without prefetch',()=>{
 const grid=fs.readFileSync('components/AdminOrganizationGrid.tsx','utf8');assert.ok(!grid.includes('NEXT_PUBLIC_APP_URL'));assert.match(grid,/<a[\s\S]*?href=\{`\/admin\/enter\/\$\{org.id\}`\}/);
 const page=fs.readFileSync('app/admin/organizations/[id]/page.tsx','utf8');assert.match(page,/<a\s+className="button gold"\s+href=\{`\/admin\/enter\/\$\{organization.id\}`\}/);
});
