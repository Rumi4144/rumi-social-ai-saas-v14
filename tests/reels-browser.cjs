// Runs in CI with an isolated browser, synthetic media and mocked campaign data.
const { chromium } = require('playwright');
const esbuild = require('esbuild');
const fs = require('node:fs'); const path = require('node:path'); const os = require('node:os'); const http = require('node:http'); const { spawnSync } = require('node:child_process'); const assert = require('node:assert/strict');
const savedOnly = process.env.REEL_SAVED_CLIP_ONLY === '1';
const quick = process.env.REEL_QUICK_BROWSER === '1';
const previewOnly = process.env.REEL_PREVIEW_AUDIO_ONLY === '1';
const repo=path.resolve(__dirname,'..'), output=fs.mkdtempSync(path.join(os.tmpdir(),'reel-browser-')); let browser, server; const uploads=new Map(), mutations=[]; let weeklyRequest;
const image='<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280"><rect width="720" height="1280" fill="#597450"/><ellipse cx="360" cy="760" rx="190" ry="260" fill="#e1b260"/><rect x="325" y="140" width="70" height="650" fill="#563a21"/><circle cx="360" cy="730" r="65" fill="#132342"/></svg>';
function verify(file) {
 if(savedOnly){
  const result=spawnSync('ffmpeg',['-i',file,'-af','volumedetect','-f','null','-'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.match(result.stderr,/Video:.*1080x1920/);assert.match(result.stderr,/Audio:/);assert.match(result.stderr,/max_volume: -?[0-9.]+ dB/);assert.ok([...result.stderr.matchAll(/frame=\s*(\d+)/g)].some(m=>Number(m[1])>100));return;
 }

 const result=spawnSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',file],{encoding:'utf8'}); assert.equal(result.status,0,result.stderr);
 const streams=JSON.parse(result.stdout).streams, video=streams.find(s=>s.codec_type==='video'); assert.equal(video.width,1080); assert.equal(video.height,1920); assert.ok(Number(video.nb_read_frames)>100,'Export must contain the timeline, not one frozen frame');assert.ok(streams.some(s=>s.codec_type==='audio'),'Soundtrack must be recorded');
 const decoded=spawnSync('ffmpeg',['-v','error','-i',file,'-f','null','-'],{encoding:'utf8'});assert.equal(decoded.status,0,decoded.stderr);
 const audio=spawnSync('ffmpeg',['-i',file,'-vn','-af','volumedetect','-f','null','-'],{encoding:'utf8'});assert.match(audio.stderr,/max_volume: -?[0-9.]+ dB/,'Sound must contain audio rather than silence');
}
async function verifyPhotoSelection(page) {
 const original=await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('social-reel-drafts',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const draft=await new Promise((resolve,reject)=>{const r=db.transaction('drafts').objectStore('drafts').get('org-a:demo:post-a');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const sources=Array.from({length:7},(_,i)=>({id:'choice-'+i,src:'/photo.svg'+(i?'?choice='+i:''),kind:'image',contentItemId:'post-a',label:['Post photo','AI photo Scene 2','AI photo Scene 1'][i]||'Extra photo '+i}));
  const scenes=[0,0,0,1,1,1].map((choice,i)=>({id:'scene-'+i,src:sources[choice].src,kind:'image',seconds:i+1,headline:'Scene title '+i,detail:'Keep caption '+i}));
  await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({...draft,sources,project:{...draft.project,scenes}},'org-a:demo:post-a');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();return draft;
 });
 const reopen=async()=>{await page.reload();await page.getByLabel('Campaign',{exact:true}).selectOption('demo');await page.getByRole('status').filter({hasText:'Your saved draft was restored'}).waitFor();await page.getByText('Adjust photos, captions and branding',{exact:true}).click();};
 await reopen();
 const photo=name=>page.getByRole('checkbox',{name:'Use '+name+' in reel',exact:true});
 assert.equal(await photo('Post photo').isChecked(),true);assert.equal(await photo('AI photo Scene 2').isChecked(),true);
 assert.equal(await photo('AI photo Scene 1').isChecked(),false);
 assert.equal(await photo('AI photo Scene 1').isEnabled(),true,'A third photo must remain selectable when six scenes contain repeated photos');
 await photo('AI photo Scene 1').check();
 await page.getByRole('status').filter({hasText:'3 photos or clips selected · 6 of 6 scenes'}).waitFor();
 assert.deepEqual(await page.getByLabel('Supporting caption').allTextContents(),Array.from({length:6},(_,i)=>'Keep caption '+i));
 assert.deepEqual(await page.getByLabel('Scene length').evaluateAll(items=>items.map(item=>item.value)),['1','2','3','4','5','6']);
 await page.getByRole('button',{name:'Automatically select 3 photos',exact:true}).click();
 await page.getByRole('status').filter({hasText:'3 photos or clips selected · 3 of 6 scenes'}).waitFor();
 await page.getByRole('heading',{name:'Preview · 15 seconds',exact:true}).waitFor();
 assert.deepEqual(await page.getByLabel('Scene length').evaluateAll(items=>items.map(item=>item.value)),['4','4','4']);
 await photo('Post photo').uncheck();await photo('AI photo Scene 2').uncheck();
 await photo('Post photo').check();await photo('AI photo Scene 2').check();
 await page.getByRole('status').filter({hasText:'3 photos or clips selected · 3 of 6 scenes'}).waitFor();
 await page.getByRole('button',{name:'Save draft in this browser',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved in this browser'}).waitFor();
 await reopen();
 for(const label of ['Post photo','AI photo Scene 2','AI photo Scene 1'])assert.equal(await photo(label).isChecked(),true,'All three photo choices must survive reload');
 await page.getByRole('status').filter({hasText:'3 photos or clips selected · 3 of 6 scenes'}).waitFor();
 if(process.env.REEL_PHOTO_QA_DIR){fs.mkdirSync(process.env.REEL_PHOTO_QA_DIR,{recursive:true});await page.getByRole('heading',{name:'Photos and clips for this post',exact:true}).evaluate(element=>element.scrollIntoView({block:'start'}));await page.screenshot({path:path.join(process.env.REEL_PHOTO_QA_DIR,'three-photos-selected.png')});}
 for(const label of ['Extra photo 3','Extra photo 4','Extra photo 5'])await photo(label).check();
 assert.equal(await photo('Extra photo 6').isDisabled(),true);assert.equal(await photo('Post photo').isEnabled(),true);
 await page.getByText('All 6 scenes use different photos or clips.',{exact:false}).waitFor();
 await photo('Post photo').uncheck();await photo('Extra photo 6').check();
 await page.getByRole('status').filter({hasText:'6 photos or clips selected · 6 of 6 scenes'}).waitFor();
 await page.evaluate(async draft=>{const db=await new Promise(resolve=>{const r=indexedDB.open('social-reel-drafts',1);r.onsuccess=()=>resolve(r.result);});await new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(draft,'org-a:demo:post-a');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();},original);
 await reopen();
 console.log('PASS: third photo selection with six repeated scenes, captions/timing preserved, one-click automatic three-photo reel, choices saved/restored, deselection, and explained six-distinct-photo limit.');
}
async function verifyAutomaticPhotoDefault(browser, baseUrl) {
 const page=await browser.newPage();
 const data={organizationId:'org-a',campaign:{id:'demo',title:'Demo'},brand:{id:'guitars',name:'Rumi Guitars',color:'#132342',accent:'#dec184',website:'rumiguitars.com'},posts:[{id:'post-a',headline:'Explore our collection',caption:''}],sources:['a','b','c','d'].map(id=>({id,src:'/photo.svg?default='+id,kind:'image',contentItemId:'post-a',label:'Default '+id}))};
 await page.route('**/api/reels/project*',route=>route.fulfill({json:new URL(route.request().url()).searchParams.has('campaignId')?data:{campaigns:[{id:'demo',title:'Demo'}]}}));
 await page.goto(baseUrl);await page.getByLabel('Campaign',{exact:true}).selectOption('demo');
 await page.getByText('Adjust photos, captions and branding',{exact:true}).click();
 await page.getByRole('status').filter({hasText:'3 photos or clips selected · 3 of 6 scenes'}).waitFor();
 await page.getByRole('heading',{name:'Preview · 15 seconds',exact:true}).waitFor();
 for(const id of ['a','b','c'])assert.equal(await page.getByRole('checkbox',{name:'Use Default '+id+' in reel',exact:true}).isChecked(),true,'A fresh reel should select three different photos automatically');
 assert.equal(await page.getByRole('checkbox',{name:'Use Default d in reel',exact:true}).isChecked(),false);
 await page.getByRole('checkbox',{name:'Use Default b in reel',exact:true}).uncheck();
 await page.getByRole('button',{name:'Save draft in this browser',exact:true}).click();await page.getByRole('status').filter({hasText:'Draft saved in this browser'}).waitFor();
 await page.reload();await page.getByLabel('Campaign',{exact:true}).selectOption('demo');await page.getByRole('status').filter({hasText:'Your saved draft was restored'}).waitFor();
 await page.getByText('Adjust photos, captions and branding',{exact:true}).click();
 await page.getByRole('status').filter({hasText:'2 photos or clips selected · 2 of 6 scenes'}).waitFor();
 assert.equal(await page.getByRole('checkbox',{name:'Use Default b in reel',exact:true}).isChecked(),false,'Saved manual choices must not be overwritten by automatic defaults');
 await page.close();console.log('PASS: three photos selected automatically for a fresh reel; saved manual choices remain unchanged after reload.');
}
(async()=>{
 if (!previewOnly) { const fixture=spawnSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','color=c=blue:s=720x1280:r=30','-f','lavfi','-i','sine=frequency=600:sample_rate=44100','-t','2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',path.join(output,'clip.mp4')]);assert.equal(fixture.status,0,String(fixture.stderr)); }
 fs.writeFileSync(path.join(output,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import ReelEditor from ${JSON.stringify(repo+'/app/studio/reels/ReelEditor')};import ${JSON.stringify(repo+'/app/globals.css')};createRoot(document.getElementById('root')!).render(<ReelEditor quick={${quick}} initialCampaignId="" initialContentItemId="post-a"/>);`);
 await esbuild.build({entryPoints:[path.join(output,'entry.tsx')],bundle:true,outfile:path.join(output,'app.js'),nodePaths:[repo+'/node_modules'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'blob-fixture',setup(b){b.onResolve({filter:/^@vercel\/blob\/client$/},()=>({path:'blob-fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`export async function upload(pathname,blob,options){const response=await fetch('/fixture-upload?pathname='+encodeURIComponent(pathname),{method:'POST',headers:{'Content-Type':blob.type,'X-Client-Payload':encodeURIComponent(options.clientPayload)},body:blob});if(!response.ok)throw new Error('Fixture upload failed');return {pathname,url:'/fixture-video?pathname='+encodeURIComponent(pathname)};}`}));}},{name:'alias',setup(b){b.onResolve({filter:/^@\//},a=>({path:path.join(repo,a.path.slice(2)+(fs.existsSync(path.join(repo,a.path.slice(2)+'.ts'))?'.ts':'.tsx'))}));}}]});
 server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/video/file'){res.setHeader('Content-Type','video/mp4');res.end(fs.readFileSync(path.join(output,'clip.mp4')));return;}if(req.method==='POST'){mutations.push(url.pathname);if(url.pathname==='/api/reels/week'){let body='';req.on('data',part=>body+=part);req.on('end',()=>{weeklyRequest=JSON.parse(body);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({days:weeklyRequest.days.map((day,i)=>({...day,contentItemId:'weekly-post-'+i}))}));});return;}if(url.pathname==='/fixture-upload'){const parts=[];req.on('data',part=>parts.push(part));req.on('end',()=>{uploads.set(url.searchParams.get('pathname'),{bytes:Buffer.concat(parts),type:req.headers['content-type'],payload:JSON.parse(decodeURIComponent(req.headers['x-client-payload']))});res.end('{}');});return;}}if(url.pathname==='/api/reels/upload'){const found=uploads.get(url.searchParams.get('pathname'));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(found?{assetId:'asset-'+found.payload.contentItemId}:{}));return;}if(url.pathname==='/api/reels/project'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.searchParams.has('campaignId')?{organizationId:'org-a',campaign:{id:'demo',title:'Find your next guitar'},brand:{name:'Rumi Guitars',color:'#132342',accent:'#dec184',website:'rumiguitars.com'},posts:[{id:'post-a',headline:'Find your next guitar',caption:''},{id:'post-b',headline:'A different guitar',caption:''}],sources:[{id:'image-a',src:'/photo.svg',kind:'image',contentItemId:'post-a'}]}:{campaigns:[{id:'demo',title:'Demo'}]}));return;}if(url.pathname.startsWith('/music/')){res.setHeader('Content-Type',url.pathname.endsWith('.wav')?'audio/wav':'audio/mpeg');res.end(fs.readFileSync(path.join(repo,'public',url.pathname)));return;}if(url.pathname==='/api/social/connections'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({connections:[]}));return;}if(url.pathname==='/photo.svg'){res.setHeader('Content-Type','image/svg+xml');res.end(image);return;}if(['/app.js','/app.css'].includes(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(path.join(output,url.pathname.slice(1))));return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body class="public-page"><main id="root"></main><script src="/app.js"></script></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,...(process.env.REEL_BROWSER_EXECUTABLE ? {executablePath:process.env.REEL_BROWSER_EXECUTABLE} : {})});const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(() => { const original=AudioNode.prototype.connect; window.__audioTaps=[]; AudioNode.prototype.connect=function(target,...args){if(target instanceof AudioDestinationNode){const analyser=this.context.createAnalyser();original.call(this,analyser);original.call(analyser,target);window.__audioTaps.push({context:this.context,analyser});return target;}return original.call(this,target,...args);}; });await page.goto('http://127.0.0.1:'+server.address().port);
 if (quick) {
  let planCalls = 0, releasePlan;
  await page.route('**/api/reels/auto-plan', async route => {
   planCalls++; const input=route.request().postDataJSON();
   if (planCalls === 2) await new Promise(resolve => { releasePlan = resolve; });
   await route.fulfill({json:{organizationId:input.organizationId,campaign:{id:input.campaignId,title:'Demo'},post:{id:input.contentItemId,headline:'Find your next guitar',caption:'Saved caption'},brand:{id:'guitars',name:'Rumi Guitars'},project:{brand:'Rumi Guitars',website:'rumiguitars.com',cta:'Explore the collection',color:'#132342',accent:'#dec184',style:'cinematic',animation:'gentle',closingSeconds:1,scenes:[{id:'auto-a',src:'/photo.svg',kind:'image',seconds:4,headline:'Find your next guitar',detail:'Saved caption'}]},sources:[{id:'image-a',src:'/photo.svg',kind:'image',contentItemId:input.contentItemId}],warnings:[]}});
  });
  await page.getByLabel('Campaign',{exact:true}).selectOption('demo');
  await page.getByLabel('Music style').first().waitFor();
  // The sound controls mount before the scene image finishes decoding.
  // Wait for actual preview readiness rather than sampling that loading state.
  await page.getByRole('button',{name:'Preview reel with sound',exact:true,disabled:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Preview reel with sound',exact:true}).isEnabled(),true,'Existing campaign photos must be usable without running the planner');
  await page.getByText('Adjust photos, captions and branding',{exact:true}).click();
  await page.getByLabel('Supporting caption').fill('Manual edit before automatic planning');
  assert.equal(await page.getByRole('button',{name:'Export finished reel',exact:true}).isEnabled(),true,'Manually edited scenes must be exportable');
  await page.getByText('Adjust photos, captions and branding',{exact:true}).click();
  await page.getByLabel('Music style').first().selectOption('soft-acoustic');
  await page.getByRole('button',{name:'Create reel draft',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Draft ready'}).waitFor();
  assert.equal(await page.getByLabel('Music style').first().inputValue(),'soft-acoustic','Creating a draft must preserve the selected soft music');
  // A saved automatic draft must remain usable after reopening the page.
  // Previously the photos restored, but a transient planner flag disabled both actions.
  await page.getByText('Adjust photos, captions and branding',{exact:true}).click();
  await page.getByLabel('Supporting caption').fill('Saved guitar caption');
  await page.getByLabel('Music style').first().selectOption('classical');
  await page.getByRole('button',{name:'Save draft in this browser',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Draft saved in this browser'}).waitFor();
  await page.reload();
  await page.getByLabel('Campaign',{exact:true}).selectOption('demo');
  await page.getByRole('status').filter({hasText:'Your saved draft was restored'}).waitFor();
  await page.getByRole('button',{name:'Preview reel with sound',exact:true,disabled:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Preview reel with sound',exact:true}).isEnabled(),true,'Restored automatic draft must be playable without creating it again');
  assert.equal(await page.getByRole('button',{name:'Export finished reel',exact:true}).isEnabled(),true,'Restored automatic draft must be exportable');
  assert.equal(await page.getByLabel('Music style').first().inputValue(),'classical');
  await page.getByText('Adjust photos, captions and branding',{exact:true}).click();
  assert.equal(await page.getByLabel('Supporting caption').inputValue(),'Saved guitar caption');
  assert.equal(planCalls,1,'Restoring a draft must not request a replacement plan');
  const compactSound = page.locator('section').filter({has:page.getByRole('heading',{name:'Your automatic draft',exact:true})});
  const musicChoice=compactSound.getByLabel('Music style').first();
  await musicChoice.selectOption('ambient');
  for (const choice of ['classical','ambient','rain']) {
   await musicChoice.selectOption(choice);
   await page.getByRole('button',{name:'Preview reel with sound',exact:true}).click();
   await page.waitForFunction(()=>window.__audioTaps.some(({context,analyser})=>{if(context.state!=='running')return false;const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);return samples.some(sample=>Math.abs(sample)>.0001);}));
   await page.getByRole('button',{name:'Stop preview',exact:true}).click();
   await page.waitForFunction(()=>window.__audioTaps.every(tap=>tap.context.state==='closed'));
  }
  await verifyPhotoSelection(page);
  await verifyAutomaticPhotoDefault(browser,'http://127.0.0.1:'+server.address().port);
  if (previewOnly) {
   // Exercise the actual browser encoder and player even where ffmpeg is not installed.
   await musicChoice.selectOption('classical');
   await page.getByRole('button',{name:'Export finished reel',exact:true}).click();
   await page.getByRole('link',{name:'Download finished reel'}).waitFor({timeout:45000});
   const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download finished reel'}).click()]);
   const file=path.join(output,download.suggestedFilename());await download.saveAs(file);assert.ok(fs.statSync(file).size>10000);
   await page.locator('video[controls]').evaluate(async video=>{
    const context=new AudioContext();await context.resume();context.createMediaElementSource(video).connect(context.destination);await video.play();
   });
   await page.waitForFunction(()=>window.__audioTaps.some(({context,analyser})=>{if(context.state!=='running')return false;const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);return samples.some(sample=>Math.abs(sample)>.0001);}));
   await page.waitForFunction(()=>document.querySelector('video[controls]')?.ended);
   const result=await page.locator('video[controls]').evaluate(video=>({width:video.videoWidth,height:video.videoHeight,duration:video.duration,frames:video.getVideoPlaybackQuality().totalVideoFrames}));
   assert.equal(result.width,1080);assert.equal(result.height,1920);assert.ok(result.duration>=4.5 && result.duration<=6);assert.ok(result.frames>60,'Downloaded reel must contain moving video frames');
   await page.getByLabel('Campaign post',{exact:true}).selectOption('post-b');
   await page.getByRole('status').filter({hasText:'Add a photo or clip to preview and export'}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Preview reel with sound',exact:true}).isDisabled(),true,'An empty post must not preview the previous reel');
   assert.equal(await page.getByRole('button',{name:'Export finished reel',exact:true}).isDisabled(),true);
   assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
   console.log('PASS: existing and manually edited scenes, saved draft reload with captions/music retained, audible Spanish Romance/ambient/rain previews, stop cleanup, actual downloadable 1080x1920 export with audible sound and moving frames, and clear empty-post blocking. No paid or publishing requests. Export: '+file);
   return;
  }
  await musicChoice.selectOption('ambient');
  await page.getByRole('button',{name:'Export finished reel',exact:true}).click();
  await page.getByRole('link',{name:'Download finished reel'}).waitFor({timeout:45000});
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download finished reel'}).click()]);
  const file=path.join(output,download.suggestedFilename());await download.saveAs(file);verify(file);
  await page.getByRole('button',{name:'Save reel and continue to posting',exact:true}).click();
  await page.getByRole('button',{name:'Reel saved',exact:true}).waitFor();
  const saved=[...uploads.values()][0]; assert.equal(saved.payload.contentItemId,'post-a');assert.deepEqual(saved.bytes,fs.readFileSync(file));assert.equal(uploads.size,1);
  assert.equal(await page.getByRole('button',{name:'Reel saved',exact:true}).isDisabled(),true);
  await page.getByRole('button',{name:'Create reel draft',exact:true}).click();
  await page.waitForFunction(()=>document.body.textContent.includes('Arranging your saved photos'));
  await page.getByLabel('Campaign post',{exact:true}).selectOption('post-b');
  while (!releasePlan) await page.waitForTimeout(10);
  releasePlan(); await page.waitForTimeout(300);
  assert.equal(await page.getByRole('link',{name:'Download finished reel'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Export finished reel',exact:true}).isDisabled(),true);
  assert.equal(uploads.size,1); assert.deepEqual(errors,[]);
  assert.deepEqual(mutations.filter(name=>name!=='/fixture-upload'),[],'Automatic workflow never requests publication, scheduling or paid generation');
  console.log('PASS: automatic plan, business sound default, native preview/export, encoded video with audio, download bytes equal private campaign upload, idempotent save, stale plan suppression after post switch and no publication.');
  return;
 }
 if(savedOnly){
  await page.getByLabel('Campaign',{exact:true}).selectOption('demo');await page.getByText('Closing screen',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Remove scene',exact:true}).click();
  await page.getByText('Add an existing Rumi video',{exact:true}).click();
  await page.getByLabel('Saved Rumi video link',{exact:true}).fill('https://foreign.test/clip.mp4');await page.getByRole('button',{name:'Add saved clip',exact:true}).click();await page.getByText('Use a saved Rumi video link.',{exact:true}).waitFor();
  await page.getByLabel('Saved Rumi video link',{exact:true}).fill('http://127.0.0.1:'+server.address().port+'/api/video/file?jobId=runway-fixture&download=1');await page.getByRole('button',{name:'Add saved clip',exact:true}).click();await page.getByText('Saved clip added. Review its picture and scene length below.',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Scene length').inputValue(),'2');await page.getByLabel('Scene length').selectOption('5');await page.getByLabel('Visual style').selectOption('footage');await page.getByLabel('Animation').selectOption('none');await page.getByLabel('Closing screen length').selectOption('0');await page.getByLabel('Music style').selectOption('classical');
  await page.getByRole('button',{name:'Export finished reel'}).click();await page.getByRole('link',{name:'Download finished reel'}).waitFor({timeout:45000});
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download finished reel'}).click()]);const file=path.join(output,'saved-clip-'+download.suggestedFilename());await download.saveAs(file);verify(file);
  const pixel=await page.locator('canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(540,1500,1,1).data));assert.ok(pixel[2]>200 && pixel[0]<20 && pixel[1]<20,'Clean moving footage must preserve the blue fixture without a dark overlay');
  await page.getByRole('button',{name:'Save reel and continue to posting',exact:true}).click();await page.getByRole('button',{name:'Reel saved',exact:true}).waitFor();assert.equal(uploads.size,1);assert.deepEqual(mutations.filter(name=>name!=='/fixture-upload'),[]);assert.deepEqual(errors,[]);
  console.log('PASS: saved video import, private-route restriction, timing, clean footage color, 1080x1920 MP4 with guitar audio and private save without publication.');return;
 }
 await page.getByLabel('Campaign',{exact:true}).selectOption('demo');await page.getByText('Closing screen',{exact:true}).waitFor();await page.getByLabel('Visual style').selectOption('gallery');await page.getByLabel('Supporting caption').fill('Explore the collection at Rumi Guitars.');await page.getByRole('button',{name:'Save draft in this browser'}).click();await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();await page.reload();await page.getByLabel('Campaign',{exact:true}).selectOption('demo');await page.getByRole('status').filter({hasText:'saved draft was restored'}).waitFor();assert.equal(await page.getByLabel('Supporting caption').inputValue(),'Explore the collection at Rumi Guitars.');
 await page.getByRole('button',{name:'Export finished reel'}).click();await page.getByRole('link',{name:'Download finished reel'}).waitFor({timeout:45000});const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download finished reel'}).click()]);const file=path.join(output,download.suggestedFilename());await download.saveAs(file);verify(file);
 await page.getByLabel('Upload photos or presenter clips').setInputFiles(path.join(output,'clip.mp4'));await page.getByLabel('Keep audio from the video clips').check();await page.getByLabel('Visual style').selectOption('cinematic');await page.getByRole('button',{name:'Export finished reel'}).click();await page.getByRole('link',{name:'Download finished reel'}).waitFor({timeout:45000});const [clip]=await Promise.all([page.waitForEvent('download'),page.getByRole('link',{name:'Download finished reel'}).click()]);const clipFile=path.join(output,'presenter-'+clip.suggestedFilename());await clip.saveAs(clipFile);verify(clipFile);
 await page.getByRole('button',{name:'Export finished reel'}).click();await page.getByRole('button',{name:'Cancel export'}).click();await page.getByRole('status').filter({hasText:'Export cancelled'}).waitFor({timeout:15000});assert.deepEqual(errors,[]);
 await page.reload();await page.getByLabel('Campaign',{exact:true}).selectOption('demo');await page.getByRole('status').filter({hasText:'saved draft was restored'}).waitFor();
 const weekly=page.locator('section').filter({has:page.getByRole('heading',{name:'Create a week of reels',exact:true})});await weekly.getByLabel('First day').fill('2026-10-05');await weekly.getByRole('button',{name:'Plan seven days'}).click();assert.equal(await weekly.locator('details').count(),7);
 const summaries=await weekly.locator('summary').allTextContents();for(let i=0;i<7;i++)assert.ok(summaries[i].includes('2026-10-'+String(5+i).padStart(2,'0')));
 const layouts=[];for(let i=0;i<7;i++){const day=weekly.locator('details').nth(i);await day.locator('summary').click();layouts.push(await day.getByLabel('Daily layout').inputValue());assert.ok((await day.getByLabel('Daily caption').inputValue()).includes('Rumi Guitars'));}assert.equal(new Set(layouts).size,6);
 await weekly.locator('details').first().getByLabel('Daily caption').fill('Weekly caption reviewed by the owner.');await weekly.getByRole('button',{name:'Create and save seven reels'}).click();await weekly.getByRole('status').filter({hasText:'All seven reels are saved'}).waitFor({timeout:180000});assert.equal(uploads.size,7);assert.equal(weeklyRequest.days.length,7);assert.equal(weeklyRequest.days[0].caption,'Weekly caption reviewed by the owner.');assert.equal(weeklyRequest.campaignId,'demo');assert.equal(new Set(weeklyRequest.days.map(day=>day.headline)).size,7);
 for(let i=0;i<7;i++){const day=weekly.locator('details').nth(i);const [download]=await Promise.all([page.waitForEvent('download'),day.getByRole('link',{name:/^Download /}).click()]);const target=path.join(output,'weekly-'+download.suggestedFilename());await download.saveAs(target);verify(target);const saved=[...uploads.values()].find(value=>value.payload.contentItemId==='weekly-post-'+i);assert.ok(saved.bytes.length>10000);assert.deepEqual(saved.bytes,fs.readFileSync(target),'Campaign upload must contain the actual downloadable reel');assert.equal(saved.payload.campaignId,'demo');assert.ok(saved.payload.duration>=7);assert.match(await day.locator('summary').textContent(),/Saved/);}
 assert.deepEqual(mutations.filter(name=>name!=='/fixture-upload'),['/api/reels/week'],'Only draft creation is requested; no publication or scheduling');assert.deepEqual(errors,[]);
 const failedPage=await browser.newPage();await failedPage.route('**/api/reels/project*',route=>route.fulfill({status:500,json:{error:'Could not load campaigns. Try again.'}}));await failedPage.goto('http://127.0.0.1:'+server.address().port);await failedPage.getByRole('status').filter({hasText:'Could not load campaigns'}).waitFor();await failedPage.getByRole('button',{name:'Refresh campaigns'}).click();await failedPage.getByRole('status').filter({hasText:'Could not load campaigns'}).waitFor();await failedPage.close();
 const emptyPage=await browser.newPage();await emptyPage.route('**/api/reels/project*',route=>route.fulfill({json:{campaigns:[]}}));await emptyPage.goto('http://127.0.0.1:'+server.address().port);await emptyPage.getByRole('heading',{name:'No campaigns available in this workspace'}).waitFor();await emptyPage.getByRole('link',{name:'Create a campaign',exact:true}).waitFor();await emptyPage.close();
 console.log('PASS: campaign selection, visible fetch errors and empty-workspace guidance; browser draft recovery, vertical video encoding, non-silent soundtrack, imported presenter clip, cancellation, seven varied weekly drafts with real video/audio uploads and no automatic publishing, and no page errors.');
})().catch(e=>{console.error(e);console.error('::error::'+String(e.stack||e).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1;}).finally(async()=>{await browser?.close();server?.close();});
