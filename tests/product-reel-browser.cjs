// Isolated browser verification. All provider/storage APIs are fixtures; no live generation or publishing.
const {chromium}=require('playwright'),esbuild=require('esbuild');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=process.env.PRODUCT_REEL_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'product-reel-'));
fs.mkdirSync(out,{recursive:true});
const ffmpeg=process.env.REEL_FFMPEG||'ffmpeg';
const ff=(args)=>{const r=spawnSync(ffmpeg,args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r;};
let browser,server,stored=null,generated=false,planCalls=0,startCalls=0;const requests=[];
const image='<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><rect width="720" height="1280" fill="#f2ead5"/><ellipse cx="360" cy="800" rx="200" ry="270" fill="#d79a43"/><rect x="320" y="80" width="80" height="680" fill="#573c21"/><circle cx="360" cy="730" r="65" fill="#172d2b"/></svg>';
const sources=Array.from({length:3},(_,i)=>({id:'scene-'+i,src:'/api/video/file?jobId=scene-'+i,kind:'video',contentItemId:'post-a',label:['Opening product shot','Moving detail shot','Closing product shot'][i],seconds:5}));
function completed(){return {...stored,status:'ready',progress:100,shots:stored.shots.map((s,i)=>({...s,id:'scene-'+i,status:'succeeded'})),sources,musicStyle:'classical',project:{brand:'Rumi Guitars',website:'https://rumiguitars.com',color:'#132342',accent:'#dec184',cta:'Explore the collection',productSubject:'Martinez MF-17',style:'product-film',animation:'gentle',closingSeconds:0,endingOverlay:true,scenes:sources.map((s,i)=>({id:s.id,src:s.src,kind:'video',seconds:5,headline:['Martinez MF-17','A closer look','Explore the collection'][i],detail:''}))}};}
function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
(async()=>{
 for(let i=0;i<3;i++)ff(['-y','-v','error','-f','lavfi','-i',`testsrc2=size=360x640:rate=30, hue=h=${i*70}`,'-t','2','-c:v','libx264','-pix_fmt','yuv420p',path.join(out,'scene-'+i+'.mp4')]);
 fs.writeFileSync(path.join(out,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import ReelEditor from ${JSON.stringify(root+'/app/studio/reels/ReelEditor')};import ${JSON.stringify(root+'/app/globals.css')};createRoot(document.getElementById('root')!).render(<ReelEditor initialCampaigns={[{id:'campaign',title:'Product reel QA'}]} initialCampaignId="campaign" initialContentItemId="post-a"/>);`);
 await esbuild.build({entryPoints:[path.join(out,'entry.tsx')],bundle:true,outfile:path.join(out,'app.js'),nodePaths:[root+'/node_modules'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'alias',setup(b){b.onResolve({filter:/^@\//},a=>{const p=path.join(root,a.path.slice(2));return {path:p+(fs.existsSync(p+'.ts')?'.ts':'.tsx')};});}}]});
 server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/reels/product-video'){
  if(req.method==='GET'){const post=u.searchParams.get('contentItemId');return json(res,{job:post&&post!=='post-a'?null:stored?(generated?completed():stored):null});}
  let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const p=JSON.parse(body);requests.push(p);if(p.action==='plan'){planCalls++;stored={id:p.requestId,campaignId:'campaign',contentItemId:'post-a',productName:'Martinez MF-17',sourceUrl:'https://rumiguitars.com/product/martinez-mf-17-flamenco-guitar/',status:'draft',progress:0,cost:120,configured:true,error:null,shots:Array.from({length:3},(_,i)=>({id:String(i+1),label:sources[i].label,caption:'A product shot',imageUrl:'/photo.svg',status:'planned',error:null}))};return json(res,{job:stored});}startCalls++;assert.equal(p.requestId,stored.id);assert.equal(p.expectedCost,120);assert.equal(p.consent,true);generated=true;return json(res,{job:{...stored,status:'running',shots:stored.shots.map(s=>({...s,status:'running'}))}},202);});return;
 }
 if(u.pathname==='/api/reels/photos'){let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{const p=JSON.parse(body);assert.equal(p.url,'https://rumiguitars.com/product/martinez-mf-17-flamenco-guitar/');json(res,{sourceUrl:p.url,sources:[{id:'website-photo',contentItemId:'post-a'}]});});return;}
 if(u.pathname==='/api/reels/project')return json(res,{organizationId:'qa-org',campaign:{id:'campaign',title:'Product reel QA'},brand:{id:'guitar-brand',name:'Rumi Guitars',website:'https://rumiguitars.com',color:'#132342',accent:'#dec184'},posts:[{id:'post-a',headline:'Martinez MF-17',caption:'Discover the guitar'},{id:'post-b',headline:'Another product',caption:''}],sources:[]});
 if(u.pathname==='/api/video/file'){const i=Number((u.searchParams.get('jobId')||'').split('-').at(-1))||0;res.writeHead(200,{'Content-Type':'video/mp4'});res.end(fs.readFileSync(path.join(out,'scene-'+i+'.mp4')));return;}
 if(u.pathname.startsWith('/music/')){res.writeHead(200,{'Content-Type':u.pathname.endsWith('.wav')?'audio/wav':'audio/mpeg'});res.end(fs.readFileSync(path.join(root,'public',u.pathname)));return;}
 if(u.pathname.startsWith('/api/'))return json(res,{photos:[],sources:[],connections:[]});
 if(u.pathname==='/photo.svg'){res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end(image);return;}
 if(['/app.js','/app.css'].includes(u.pathname)){res.writeHead(200,{'Content-Type':u.pathname.endsWith('.js')?'text/javascript':'text/css'});res.end(fs.readFileSync(path.join(out,u.pathname.slice(1))));return;}
 res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="public-page"><main id="root"></main><script src="/app.js"></script></body></html>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.REEL_BROWSER_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1440,height:1080},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 const card=page.getByRole('region',{name:'Create a moving product reel'});
 await card.getByLabel('Product website link').fill('https://rumiguitars.com/product/martinez-mf-17-flamenco-guitar/');
 await card.getByRole('button',{name:'Find product photos and plan reel'}).click();
 await card.getByText('120 Rumi credits total',{exact:true}).waitFor();assert.equal(startCalls,0,'Planning must not start paid generation');
 assert.equal(await card.getByRole('button',{name:'Create moving product reel',exact:true}).isDisabled(),true);
 await card.screenshot({path:path.join(out,'product-reel-plan-desktop.png')});
 await page.setViewportSize({width:390,height:844});await card.screenshot({path:path.join(out,'product-reel-plan-mobile.png')});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile must not scroll horizontally');
 await page.setViewportSize({width:1440,height:1080});
 await card.getByRole('checkbox').check();await card.getByRole('button',{name:'Create moving product reel',exact:true}).click();
 await card.getByText('Your request is saved.',{exact:false}).waitFor();
 await card.getByRole('button',{name:'Check saved status',exact:true}).click();
 await page.getByRole('heading',{name:'Preview · 15 seconds',exact:true}).waitFor();
 assert.equal(await page.getByLabel('Visual style').inputValue(),'product-film');
 assert.equal(await page.getByLabel('Closing screen length').inputValue(),'0');assert.equal(await page.getByLabel('Scene length').count(),3);
 await page.getByRole('button',{name:'Preview reel with sound',exact:true}).click();
 await page.waitForTimeout(1800);await page.locator('canvas').screenshot({path:path.join(out,'product-film-frame.png')});
 await page.getByRole('button',{name:'Stop preview',exact:true}).click();
 await page.getByRole('button',{name:'Export finished reel',exact:true}).click();
 const link=page.getByRole('link',{name:'Download finished reel',exact:true});await link.waitFor({timeout:45000});
 const downloadPromise=page.waitForEvent('download');await link.click();const download=await downloadPromise;const output=path.join(out,'QA-only-moving-product-reel.'+download.suggestedFilename().split('.').at(-1));await download.saveAs(output);
 const decoded=ff(['-i',output,'-af','volumedetect','-f','null','-']);assert.match(decoded.stderr,/1080x1920/);assert.match(decoded.stderr,/Audio:/);assert.match(decoded.stderr,/Duration: 00:00:1[456]/);assert.match(decoded.stderr,/max_volume: -?[\d.]+ dB/);
 assert.equal(planCalls,1);assert.equal(startCalls,1);assert.equal(errors.length,0,errors.join('\n'));
 await page.reload();await page.getByRole('button',{name:'Open reel with music',exact:true}).waitFor();assert.equal(startCalls,1,'Reload must recover, never restart');
 await page.getByRole('button',{name:'Open reel with music',exact:true}).click();await page.getByRole('heading',{name:'Preview · 15 seconds',exact:true}).waitFor();
 await page.getByLabel('Campaign post',{exact:true}).selectOption('post-b');await page.getByLabel('Product website link').waitFor();assert.equal(await page.getByRole('button',{name:'Open reel with music',exact:true}).count(),0,'Another product must not inherit previous video');
 assert.equal(startCalls,1);
 fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({planCalls,startCalls,requests,output,errors,syntheticVideo:true,liveProviderCalls:0},null,2));
 console.log('PASS: website import, free plan, visible cost, consent, 3 moving scenes, music, full-screen layout, mobile, actual 15-second export/decode, resume without another charge, and post isolation.');console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server?.close(r)||r());});
