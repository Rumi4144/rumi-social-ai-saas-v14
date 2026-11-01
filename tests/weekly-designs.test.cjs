const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/weekly-load.cjs');
const {WEEKLY_DESIGNS,renderWeeklyDesign,weeklyHeadline}=load('lib/render/weekly-layouts.ts');
const {planWeek,addDays}=load('lib/weekly/plan.ts');
test('short and long product headlines are preserved without ellipses, squashed lettering, or markup',()=>{
 for(const title of ['Meet the Martinez MF-17','Notice the Semi-Hollow Design','Bring it into your repertoire','Your MF-17 Viewing Checklist','Imperial Blue, Viewed Up Close','Rumi 41” Acoustic Guitar — Premium Steel String Folk Guitar for Beginners & Professionals | Natural Wood Finish','W'.repeat(64)]) {
  for(const [width,height,face] of [[430,520,'display'],[976,285,'display'],[510,290,'editorial']]) {
   const fit=weeklyHeadline(title,width,height,150,face);
   assert.equal(fit.lines.join('').replace(/\s/g,''),(face==='display'?title.toUpperCase():title).replace(/\s/g,''));
   assert.ok(fit.height<=height,'Full headline must fit the allotted height');
   if(title.length<64) assert.equal(fit.lines.join(' '),(face==='display'?title.toUpperCase():title), 'Normal words and product names must stay whole');
  }
  for(const format of ['square','portrait','story'])for(const style of WEEKLY_DESIGNS){
   const svg=renderWeeklyDesign({brand:'A & B',headline:title,imageUrl:'data:image/png;base64,ORIGINAL',logoUrl:'data:image/png;base64,OWNLOGO',format},style);
   assert.doesNotMatch(svg,/textLength=|lengthAdjust=|NaN|undefined/);
   assert.equal((svg.match(/data-role="product-photo"/g)||[]).length,1);
   assert.match(svg,/preserveAspectRatio="xMidYMid meet"/);
  }
 }
});
test('weekly design order changes through the year and does not rewrite older saved layouts',()=>{
 const legacy={brandId:'brand',weekStart:'2026-10-19',slots:[{layout:'modern-gradient'},{layout:'heritage'}]};
 const history=[legacy],snapshot=JSON.stringify(legacy),orders=new Set();
 for(let week=0;week<52;week++){
  const weekStart=addDays('2026-10-26',week*7),next=planWeek({organizationId:'org',brandId:'brand',brandName:'Actual Business',startsOn:'2026-10-26',weekStart,mix:{images:7,motionReels:0,aiVideos:0},photos:[],history});
  orders.add(next.slots.map(s=>s.layout).join(','));
  assert.equal(new Set(next.slots.map(s=>s.layout)).size,7);
  history.push({brandId:'brand',weekStart,slots:next.slots});
 }
 assert.ok(orders.size>=20,'A year must not repeat one fixed weekly design order');
 assert.equal(JSON.stringify(legacy),snapshot);
});
test('a saved logo takes priority, and recovery failure leaves an honest business name fallback',async()=>{
 let recoveries=0;const {logoToPngDataUrl}=load('lib/render/raster.ts',{'../onboarding/website':{readWebsiteLogo:async url=>{recoveries++;assert.equal(url,'https://own.test');return 'data:image/png;base64,WEBSITELOGO';}}});
 assert.equal(await logoToPngDataUrl(null,'https://own.test'),'data:image/png;base64,WEBSITELOGO');
 assert.equal(await logoToPngDataUrl(null),undefined);
 assert.equal(await logoToPngDataUrl('data:image/png;base64,broken','https://own.test'),undefined);
 assert.equal(recoveries,1,'An explicitly saved logo must not be replaced with a different website mark');
 const failing=load('lib/render/raster.ts',{'../onboarding/website':{readWebsiteLogo:async()=>{throw Error('Site unavailable')}}});
 assert.equal(await failing.logoToPngDataUrl(null,'https://own.test'),undefined);
 for(const style of WEEKLY_DESIGNS) assert.match(renderWeeklyDesign({brand:'Own business',headline:'See the collection'},style),/>OWN BUSINESS<\/text>/);
});
