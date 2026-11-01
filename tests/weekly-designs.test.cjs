const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/weekly-load.cjs');
const {WEEKLY_DESIGNS,WEEKLY_DESIGN_CHOICES,renderWeeklyDesign,weeklyHeadline,weeklyDesignFamily}=load('lib/render/weekly-layouts.ts');
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
test('90 compositions have stable unique names and non-overlapping product and title regions',()=>{
 assert.equal(WEEKLY_DESIGNS.length,90);assert.equal(new Set(WEEKLY_DESIGNS).size,90);
 assert.equal(new Set(WEEKLY_DESIGN_CHOICES.map(item=>item.label)).size,90);
 const {WEEKLY_COMPOSITIONS}=load('lib/render/weekly-compositions.ts'), geometry=new Set();
 for(const item of WEEKLY_COMPOSITIONS){
  geometry.add(JSON.stringify([item.photo,item.headline,item.art,item.align]));
  for(const [x,y,w,h] of [item.photo,item.headline])assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=1000&&y+h<=1000,item.value);
  const [x,y,w,h]=item.photo,[tx,ty,tw,th]=item.headline;
  assert.ok(x+w<=tx||tx+tw<=x||y+h<=ty||ty+th<=y,`Original product must not be covered by the headline: ${item.value}`);
  assert.ok(w>=450&&h>=590,`Photo must remain prominent: ${item.value}`);
 }
 assert.equal(geometry.size,83);
});
test('each business uses all 90 layouts before repeating, with a wide repeat gap over a year',()=>{
 const history=[],all=[];
 for(let week=0;week<52;week++){
  const weekStart=addDays('2026-10-26',week*7),next=planWeek({organizationId:'own',brandId:'own-brand',brandName:'Business',startsOn:'2026-10-26',weekStart,mix:{images:7,motionReels:0,aiVideos:0},photos:[],history});
  for(const slot of next.slots){assert.ok(!all.slice(-84).includes(slot.layout),'A chronological seven-post week must not reuse the preceding twelve weeks');all.push(slot.layout);}
  history.push({brandId:'own-brand',weekStart,slots:next.slots});
 }
 for(let start=0;start+90<=all.length;start+=90)assert.equal(new Set(all.slice(start,start+90)).size,90);
 assert.equal(new Set(history[0].slots.map(s=>weeklyDesignFamily(s.layout))).size,7,'Start with different design families in the same pack');
});
test('future reservations count, foreign brands do not, and planning never rewrites saved art',()=>{
 const base={organizationId:'own',brandId:'brand',brandName:'Business',startsOn:'2026-10-26',mix:{images:7,motionReels:0,aiVideos:0},photos:[]};
 const history=[],all=[];
 for(const week of [10,3,8,1,6,11,2,9,0,5,7,4]){
  const weekStart=addDays(base.startsOn,week*7),before=JSON.stringify(history);
  const next=planWeek({...base,weekStart,history});
  assert.equal(JSON.stringify(history),before);
  assert.deepEqual(next,planWeek({...base,weekStart,history:history.slice().reverse()}),'History query order must not change selection');
  all.push(...next.slots.map(s=>s.layout));history.push({brandId:'brand',weekStart,slots:next.slots});
 }
 assert.equal(new Set(all).size,84,'Out-of-order preparation still uses unreserved designs');
 assert.deepEqual(planWeek({...base,brandId:'new-brand',weekStart:base.startsOn,history}),planWeek({...base,brandId:'new-brand',weekStart:base.startsOn,history:[]}));
});
test('larger mixes and exhausted histories retain exact quantities and valid layouts',()=>{
 for(const count of [1,7,14,21,95]){
  const next=planWeek({organizationId:'own',brandId:'brand',brandName:'Business',startsOn:'2026-10-26',weekStart:'2026-10-26',mix:{images:count,motionReels:0,aiVideos:0},photos:[],history:[]});
  assert.equal(next.slots.length,count);assert.ok(next.slots.every(s=>WEEKLY_DESIGNS.includes(s.layout)));
  assert.equal(new Set(next.slots.slice(0,90).map(s=>s.layout)).size,Math.min(count,90));
 }
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
