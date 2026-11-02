const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/weekly-load.cjs');
test('all-customer inbox is Admin-only and never attaches another customer’s post',async()=>{
 let allowed=false,reads=0;
 const prisma={
  job:{findMany:async q=>{reads++;assert.equal(q.take,26);assert.equal(q.where.status,'pending');assert.equal(q.where.organizationId,undefined);return [{id:'one',organizationId:'a',payload:{contentItemId:'post-a',comment:'Change photo'}},{id:'two',organizationId:'b',payload:{contentItemId:'post-a',comment:'Wrong tenant'}}];}},
  organization:{findMany:async()=>[{id:'a',name:'Customer A'},{id:'b',name:'Customer B'}]},
  contentItem:{findMany:async()=>[{id:'post-a',headline:'Real post',campaign:{id:'campaign-a',title:'Original',brand:{organizationId:'a'}}}]},
 };
 const service=load('lib/admin/customer-history.ts',{'@/lib/prisma':{prisma},'@/lib/admin/context':{superAdminContext:async()=>{if(!allowed)throw Error('FORBIDDEN');}}});
 await assert.rejects(service.allCustomerChangeRequests(),/FORBIDDEN/);assert.equal(reads,0);
 allowed=true;const page=await service.allCustomerChangeRequests();assert.equal(page.requests.length,2);assert.equal(page.requests[0].customerName,'Customer A');assert.equal(page.requests[0].item.id,'post-a');assert.equal(page.requests[1].item,null);
});
test('request count cannot be read by an ordinary customer',async()=>{
 let reads=0;
 const api=load('app/api/admin/requests/summary/route.ts',{'@/lib/http/errors':{apiError:()=>new Response('{}',{status:403})},'@/lib/prisma':{prisma:{job:{count:async()=>{reads++;return 3;}}}},'@/lib/admin/context':{superAdminContext:async()=>{throw Error('FORBIDDEN');}}});
 assert.equal((await api.GET()).status,403);assert.equal(reads,0);
});
