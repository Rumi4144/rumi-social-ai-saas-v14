// Exercise the service and customer APIs with the worker's real raster + absolute-URL representation.
// The only fixtures are database rows and an original product illustration; no paid providers run.
const {test}=require('node:test'),assert=require('node:assert/strict'),sharp=require('sharp');
const {load}=require('./helpers/weekly-load.cjs');
const NextResponse=class extends Response {static json(body,init={}){return new Response(JSON.stringify(body),{...init,headers:{'content-type':'application/json',...init.headers}})}};
test('rendered worker JPEG survives weekly readiness, browser serving, customer approval and individual download',async()=>{
  const {renderWeeklyDesign}=load('lib/render/weekly-layouts.ts');
  const {svgToPublishJpeg,weeklyDesignFonts}=load('lib/render/raster.ts');
  const photo=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="700" height="900"><rect width="700" height="900" fill="#eaf4dc"/><ellipse cx="350" cy="600" rx="200" ry="260" fill="#b76a32"/><rect x="320" y="40" width="60" height="540" fill="#573d29"/><circle cx="350" cy="550" r="65" fill="#202925"/></svg>')).png().toBuffer();
  const svg=renderWeeklyDesign({brand:'Fixture Guitars',headline:'Find your sound',cta:'Explore guitars',format:'portrait',imageUrl:'data:image/png;base64,'+photo.toString('base64'),designFonts:await weeklyDesignFonts()},'weekly-banner');
  const raster=await svgToPublishJpeg(svg),origin=new URL(process.env.NEXT_PUBLIC_APP_URL||'https://rumisocialai.com').origin;
  const item={id:'post',campaignId:'campaign',type:'static_post',platform:'facebook,instagram',headline:'Find your sound',caption:'An actual product photo in a finished design.',status:'draft',mediaUrl:origin+'/api/media/worker-art',scheduledFor:new Date(),createdAt:new Date()};
  const asset={id:'worker-art',organizationId:'org',campaignId:'campaign',contentItemId:'post',kind:'social_creative',provider:'internal-raster',status:'ready',url:'data:image/jpeg;base64,'+raster.toString('base64'),metadata:{format:'portrait',width:1080,height:1350},createdAt:new Date()};
  const context={organizationId:'org',role:'member',userId:'member'},writes=[];
  const db={
    brand:{findMany:async()=>[{id:'brand',organizationId:'org',name:'Fixture Guitars',createdAt:new Date(),websiteUrl:'https://fixture.test',logoUrl:null,products:[]}]},
    subscription:{findUnique:async()=>({plan:'starter',status:'active',credits:100})},
    campaign:{findMany:async()=>[]},job:{findMany:async()=>[],findFirst:async()=>null},
    contentItem:{findMany:async()=>[item],findFirst:async q=>{assert.equal(q.where.campaign.brand.organizationId,'org');return item},update:async({data})=>{writes.push(data);Object.assign(item,data);return item}},
    mediaAsset:{findMany:async q=>q.where.kind==='product_photo'?[]:[asset],findUnique:async()=>asset,findFirst:async q=>{assert.equal(q.where.organizationId,'org');assert.equal(q.where.campaignId,'campaign');assert.equal(q.where.contentItemId,'post');return q.where.id===asset.id?asset:null}},
    publishJob:{findMany:async()=>[],findFirst:async()=>null},socialConnection:{findMany:async()=>[]},auditLog:{create:async()=>{}},
    $transaction:async fn=>fn(db),
  };
  const mocks={'next/server':{NextResponse},'@/lib/prisma':{prisma:db},'@/lib/auth/context':{tenantContext:async()=>context},'@/lib/video/runway':{runwayConfigured:()=>false}};
  const service=load('lib/weekly/service.ts',mocks),approve=load('app/api/weekly/items/[id]/route.ts',mocks),download=load('app/api/weekly/items/[id]/download/route.ts',mocks),media=load('app/api/media/[id]/route.ts',mocks);
  const view=await service.weeklyView(context),post=view.items[0],params={params:Promise.resolve({id:'post'})};
  assert.equal(post.isReady,true);assert.equal(post.mediaKind,'image');assert.equal(post.previewUrl,item.mediaUrl);assert.equal(post.downloadUrl,null);
  const preview=await media.GET(new Request(post.previewUrl),{params:Promise.resolve({id:asset.id})});
  assert.equal(preview.status,200);assert.equal(preview.headers.get('content-type'),'image/jpeg');
  const previewMetadata=await sharp(Buffer.from(await preview.arrayBuffer())).metadata();assert.equal(previewMetadata.width,1080);assert.equal(previewMetadata.height,1350);
  assert.equal((await download.GET(new Request(origin+'/download'),params)).status,409);
  const response=await approve.PATCH(new Request(origin+'/approve',{method:'PATCH',body:JSON.stringify({action:'approve',headline:post.headline,caption:post.caption,mediaUrl:post.mediaUrl})}),params);
  assert.equal(response.status,200);assert.equal(writes.length,1);assert.equal(item.status,'approved');
  const approved=(await service.weeklyView(context)).items[0];assert.equal(approved.downloadUrl,'/api/weekly/items/post/download');
  const saved=await download.GET(new Request(origin+approved.downloadUrl),params);assert.equal(saved.status,200);assert.match(saved.headers.get('content-disposition'),/attachment; filename="Find-your-sound.jpg"/);
  const exported=await sharp(Buffer.from(await saved.arrayBuffer())).metadata();assert.equal(exported.format,'jpeg');assert.equal(exported.width,1080);assert.equal(exported.height,1350);assert.equal(writes.length,1,'Downloading must not change approval or charge credits');
});
