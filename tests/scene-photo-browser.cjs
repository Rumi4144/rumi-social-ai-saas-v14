// Isolated UI checks: no sign-ins, paid image calls or publishing.
const {chromium}=require('playwright'),esbuild=require('esbuild'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'scene-photo-ui-'));let browser,server;
(async()=>{
 fs.writeFileSync(path.join(out,'entry.tsx'),`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Scene from ${JSON.stringify(repo+'/app/studio/reels/ScenePhotoControls')};import Clip from ${JSON.stringify(repo+'/app/studio/reels/ClipPreview')};import ${JSON.stringify(repo+'/app/globals.css')};
 function App(){const [direction,setDirection]=useState('A close-up of hands gently playing guitar strings.');return <><Scene organizationId="org" campaignId="camp" contentItemId="post" sceneId="scene1" sceneNumber={1} direction={direction} disabled={false} onDirection={setDirection} onPhoto={source=>{window.__chosen=(window.__chosen||[]).concat(source)}} onBusy={()=>{}}/><div style={{maxWidth:300}}><Clip src="/missing.mp4" label="Post video"/></div></>};createRoot(document.getElementById('root')!).render(<App/>);`);
 await esbuild.build({entryPoints:[path.join(out,'entry.tsx')],bundle:true,outfile:path.join(out,'app.js'),nodePaths:[repo+'/node_modules'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const requests=[];let mode='flagged';
 const source={id:'candidate',src:'/photo.svg',kind:'image',contentItemId:'post',sceneId:'scene1',label:'AI photo · Scene 1'};
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/app.js'||url.pathname==='/app.css'){res.setHeader('Content-Type',url.pathname.endsWith('css')?'text/css':'application/javascript');return res.end(fs.readFileSync(path.join(out,url.pathname.slice(1))));}
  if(url.pathname==='/photo.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#789884"/></svg>');}
  if(url.pathname==='/missing.mp4'){res.statusCode=404;return res.end();}
  if(url.pathname==='/api/reels/scene-photo'){
   const chunks=[];for await(const part of req)chunks.push(part);const body=JSON.parse(Buffer.concat(chunks).toString());requests.push(body);res.setHeader('Content-Type','application/json');
   if(requests.length===1){res.statusCode=202;return res.end(JSON.stringify({status:'continuing',error:'Creating one replacement; the first photo is saved.'}));}
   if(mode==='uncertain'){res.statusCode=202;return res.end(JSON.stringify({status:'uncertain',error:'Request saved. Check this same request again.'}));}
   return res.end(JSON.stringify({status:'succeeded',source,needsReview:mode==='flagged',review:{issues:['This repeats another seated guitar portrait.']}}));
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="public-page"><main id="root" style="width:calc(100% - 40px);max-width:800px;margin:20px"></main><script src="/app.js"></script></body></html>');
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,...require('./browser-launch.cjs')()});const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('button',{name:'Generate AI photo · 1 Rumi credit',exact:true}).click();
 await page.getByRole('region',{name:'Scene photo needs your review'}).waitFor();assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId);assert.equal(await page.evaluate(()=>window.__chosen?.length||0),0);
 const key='rumi-scene-photo:org:camp:post:scene1';assert.ok(await page.evaluate(k=>localStorage.getItem(k),key));
 for(const width of [1280,390]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'review-'+width+'.png'),fullPage:true});}
 assert.equal(await page.getByLabel('Post video',{exact:true}).evaluate(video=>video.controls),true);await page.getByText('Video preview could not load.',{exact:false}).waitFor();assert.equal(await page.getByRole('link',{name:'Open saved video'}).getAttribute('href'),'/missing.mp4');
 await page.reload();await page.getByRole('button',{name:'Check photo status',exact:true}).click();await page.getByRole('region',{name:'Scene photo needs your review'}).waitFor();assert.equal(requests[2].requestId,requests[0].requestId);assert.equal(await page.evaluate(()=>window.__chosen?.length||0),0);
 await page.getByRole('button',{name:'Use this photo after review'}).click();assert.equal(await page.evaluate(()=>window.__chosen.length),1);assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null);
 mode='uncertain';await page.getByRole('button',{name:'Generate AI photo · 1 Rumi credit',exact:true}).click();await page.getByText('Request saved. Check this same request again.',{exact:true}).waitFor();const pendingId=requests.at(-1).requestId;assert.notEqual(pendingId,requests[0].requestId);
 await page.reload();mode='passed';await page.getByRole('button',{name:'Check photo status',exact:true}).click();await page.getByText('AI photo selected for this scene. Preview it, then save your draft.',{exact:true}).waitFor();assert.equal(requests.at(-1).requestId,pendingId);assert.equal(await page.evaluate(()=>window.__chosen.length),1);assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),null);
 assert.deepEqual(errors,[]);console.log('PASS: bounded continuation, failed photo requires selection, request survives refresh, uncertain request resumes, passed photo selects, video controls/error recovery, mobile layout. Screenshots: '+out);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.close();});
