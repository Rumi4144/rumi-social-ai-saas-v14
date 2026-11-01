// Real weekly controls and motion export; all service calls stay in this fixture.
const {chromium}=require('playwright'),esbuild=require('esbuild'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'weekly-finish-'));
let server,browser,uploaded,ready=false,failPlan=true;
const writes=[],errors=[];
const pathname='reels/org/reel/11111111-1111-4111-8111-111111111111.mp4';
const scenes=[0,1,2].map(i=>({id:String(i),src:'/photo.svg?scene='+i,kind:'image',seconds:5,headline:['Take a moment','Breathe deeply','Find your focus'][i],detail:''}));
function weekly(){return{organizationId:'org',canManage:true,brands:[{id:'brand',name:'Test business'}],brand:{id:'brand',name:'Test business'},weekStart:'2026-11-01',weekEnd:'2026-11-07',pack:{id:'pack',pendingJobs:0},items:[{id:'reel',campaignId:'campaign',brandId:'brand',date:'2026-11-04',type:'reel_post',kind:'motion_reel',headline:'A moment of calm',caption:'A small pause in your day.',status:'draft',isReady:ready,approvalBlockedReason:ready?null:'Finish this reel.',previewUrl:ready?'/saved.mp4':null,mediaUrl:ready?'/api/video/media/saved':null,mediaKind:ready?'video':null,assetId:ready?'saved':null,deliveries:[],nextAction:ready?'review':'finish_motion_reel'}],prepare:{mix:{images:6,motionReels:1,aiVideos:0},availableCredits:20,warnings:[]},plan:{label:'Intro',weeklyPosts:7},annualPlan:{preparedWeeks:1}};}
(async()=>{
  fs.writeFileSync(path.join(out,'entry.tsx'),`import React from'react';import{createRoot}from'react-dom/client';import Workspace from ${JSON.stringify(repo+'/components/weekly/WeeklyWorkspace')};import ${JSON.stringify(repo+'/app/globals.css')};createRoot(document.getElementById('root')!).render(<Workspace/>);`);
  await esbuild.build({entryPoints:[path.join(out,'entry.tsx')],bundle:true,outfile:path.join(out,'app.js'),nodePaths:[repo+'/node_modules'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'local-upload',setup(b){b.onResolve({filter:/^@vercel\/blob\/client$/},()=>({path:'upload',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`export async function upload(pathname,blob){const r=await fetch('/fixture-upload',{method:'POST',body:blob});if(!r.ok)throw Error('Upload failed');return{};}`}));}}]});
  server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture');
    const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
    if(['/app.js','/app.css'].includes(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('css')?'text/css':'application/javascript');return res.end(fs.readFileSync(path.join(out,url.pathname.slice(1))));}
    if(url.pathname==='/photo.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><rect width="540" height="960" fill="${['#2d6254','#9f6f32','#4b6283'][Number(url.searchParams.get('scene'))]}"/><circle cx="270" cy="420" r="110" fill="#f4dfb9"/></svg>`);}
    if(url.pathname==='/saved.mp4'){res.setHeader('Content-Type','video/mp4');return res.end(uploaded);}
    if(url.pathname==='/fixture-upload'){const chunks=[];for await(const c of req)chunks.push(c);uploaded=Buffer.concat(chunks);writes.push({path:url.pathname});return json({});}
    if(url.pathname==='/api/weekly'&&req.method==='GET')return json(weekly());
    if(url.pathname==='/api/reels/upload')return json(uploaded?{assetId:'saved'}:{pending:true});
    if(url.pathname.startsWith('/api/')){
      let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw||'{}');writes.push({path:url.pathname,body});
      if(url.pathname==='/api/reels/auto-plan'){
        if(failPlan){res.statusCode=409;return json({error:'Scene photos are still being prepared. Try again shortly.'});}
        return json({organizationId:'org',campaign:{id:'campaign'},post:{id:'reel'},brand:{name:'Test business'},sources:scenes,project:{brand:'Test business',website:'example.test',color:'#174838',accent:'#e6c575',cta:'Learn more',style:'product-film',animation:'gentle',closingSeconds:0,scenes}});
      }
      if(url.pathname==='/api/weekly/reel-completion'){
        if(body.action==='reserve')return json({reservationId:'reservation',pathname});
        if(body.action==='complete'){ready=true;return json({});}
      }
      res.statusCode=500;return json({error:'Unexpected fixture request'});
    }
    res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="public-page"><main id="root"></main><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch(require('./browser-launch.cjs')());
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.addInitScript(()=>{
    // A suppressed native confirmation used to make Finish reel silently return.
    window.confirm=()=>{throw Error('Native confirm must not be used');};
    window.realAudioContext=window.AudioContext;
    window.AudioContext=class{resume(){return new Promise(()=>{});}close(){return Promise.resolve();}};
  });
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  const card=page.getByTestId('weekly-post-reel');
  const open=()=>card.getByRole('button',{name:'Finish reel · 4 credits',exact:true}).click();
  const start=()=>card.getByRole('button',{name:'Start reel · 4 credits',exact:true}).click();
  await open();await card.getByRole('region',{name:'Finish reel confirmation'}).waitFor();
  assert.equal(writes.length,0,'Opening confirmation must not start a paid request');
  assert.ok(await card.evaluate(el=>el.scrollWidth<=el.clientWidth),'Confirmation fits its mobile card');
  await card.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(writes.length,0);
  await open();await start();await card.getByRole('progressbar',{name:'Reel preparation progress'}).waitFor();
  await card.getByRole('button',{name:'Pause this reel'}).click();await card.getByRole('alert').filter({hasText:'Paused.'}).waitFor();
  assert.equal(writes.length,0,'Pausing blocked audio must not reserve credits');
  await open();await start();await card.getByRole('alert').filter({hasText:'could not start reel audio'}).waitFor({timeout:12000});
  assert.equal(writes.length,0,'Audio timeout must not reserve credits');
  assert.ok(await card.getByRole('button',{name:'Finish reel · 4 credits',exact:true}).isEnabled(),'Timeout allows recovery');
  await page.evaluate(()=>{window.AudioContext=window.realAudioContext;});
  await open();await start();await card.getByRole('alert').filter({hasText:'Scene photos are still being prepared'}).waitFor();
  assert.equal(writes.filter(w=>w.body?.action==='reserve').length,0,'A photo-planning error must not charge');
  assert.equal(await card.getByText('Needs attention',{exact:true}).count(),1);
  failPlan=false;await open();
  await card.getByRole('button',{name:'Start reel · 4 credits',exact:true}).evaluate(el=>{el.click();el.click();});
  await card.getByText('Creating your reel. Keep this tab visible.',{exact:true}).waitFor();
  assert.ok(await card.getByRole('button',{name:'Preparing reel…',exact:true}).isDisabled());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No mobile overflow while rendering');
  await card.getByRole('button',{name:'Approve post',exact:true,disabled:false}).waitFor({timeout:40000});
  assert.deepEqual(writes.filter(w=>w.body?.action).map(w=>w.body.action),['reserve','complete'],'Double-click still reserves and saves only once');
  assert.equal(writes.filter(w=>w.path==='/fixture-upload').length,1);
  assert.ok(uploaded.length>10000&&uploaded.includes(Buffer.from('vide'))&&uploaded.includes(Buffer.from('soun')),'Finished reel has encoded video and music');
  assert.equal(await card.getByRole('alert').count(),0,'Successful retry clears the old card error');
  assert.equal(await card.getByText('Reel saved. Review it before approving.',{exact:true}).count(),1);
  assert.ok(!writes.some(w=>/publishing|items\/reel/.test(w.path)),'Finishing does not approve or publish');
  fs.mkdirSync(path.join(repo,'qa-weekly'),{recursive:true});await page.screenshot({path:path.join(repo,'qa-weekly/finish-reel-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: inline confirmation, cancel without charge, blocked audio pause/timeout, card errors, safe retry and one complete motion reel export.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.close();});
