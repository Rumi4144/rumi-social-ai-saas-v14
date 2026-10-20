// Exercise the actual posting screen with fake TikTok responses; never sends a social post.
const {chromium}=require('playwright'),esbuild=require('esbuild'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'tiktok-posting-'));let browser,server;
(async()=>{
 fs.writeFileSync(path.join(out,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Schedule from ${JSON.stringify(repo+'/components/SchedulePostButton')};import ${JSON.stringify(repo+'/app/globals.css')};createRoot(document.getElementById('root')!).render(<Schedule contentItemId="post" initialStatus="approved" isVideo videoAssetId="clip" openByDefault allowPostNow/>);`);
 await esbuild.build({entryPoints:[path.join(out,'entry.tsx')],bundle:true,outfile:path.join(out,'app.js'),nodePaths:[repo+'/node_modules'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 const writes=[],unexpected=[];let mode='ready',creatorReads=0;
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://local');
  if(['/app.js','/app.css'].includes(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('css')?'text/css':'application/javascript');return res.end(fs.readFileSync(path.join(out,url.pathname.slice(1))));}
  if(url.pathname==='/api/social/connections'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({connections:[{id:'tiktok',provider:'tiktok',accountName:'Master Mind'}]}));}
  if(url.pathname==='/api/publishing/status'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({jobs:[]}));}
  if(url.pathname==='/api/social/tiktok/creator'){
   creatorReads++;assert.equal(url.searchParams.get('assetId'),'clip');assert.equal(url.searchParams.get('contentItemId'),'post');res.setHeader('Content-Type','application/json');
   if(mode==='needs-scope'){res.statusCode=409;return res.end(JSON.stringify({error:'TikTok is linked for sign-in only. Reconnect TikTok in Settings and approve video posting.'}));}
   return res.end(JSON.stringify({creator:{creator_nickname:'Master Mind',creator_username:'mastermind',privacy_level_options:['SELF_ONLY'],comment_disabled:false,duet_disabled:true,stitch_disabled:true,max_video_post_duration_sec:mode==='too-long'?5:60},post:{title:'A short moment between tasks.',duration:15,videoUrl:'/clip.mp4'},publicPostingApproved:false}));
  }
  if(url.pathname==='/api/publishing/schedule'){const chunks=[];for await(const chunk of req)chunks.push(chunk);writes.push(JSON.parse(Buffer.concat(chunks)));res.setHeader('Content-Type','application/json');return res.end('{}');}
  if(url.pathname==='/clip.mp4'){res.statusCode=404;return res.end();}
  if(url.pathname.startsWith('/api/')){unexpected.push(url.pathname);res.statusCode=500;return res.end('{}');}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body class="public-page"><main id="root"></main><script src="/app.js"></script></body></html>');
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base);await page.getByRole('heading',{name:'Post to TikTok · Master Mind'}).waitFor();const submit=page.getByRole('button',{name:'Approve and post now',exact:true});
 assert.equal(await page.getByLabel('Who can watch').inputValue(),'');assert.equal(await page.getByLabel('Allow comments',{exact:true}).isChecked(),false);assert.equal(await page.getByLabel(/Allow Duet/).isEnabled(),false);assert.equal(await submit.isEnabled(),false);
 await page.getByLabel('Who can watch').selectOption('SELF_ONLY');await page.getByLabel('TikTok caption').fill('My edited TikTok caption.');await page.getByLabel('This content promotes a business, product or service').check();assert.equal(await submit.isEnabled(),false);
 await page.getByLabel('Your brand · promoting your own business').check();await page.getByLabel(/I authorize uploading this video/).check();await submit.waitFor({state:'visible'});await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Approve and post now'&&!button.disabled));
 await page.getByLabel('TikTok caption').fill('Updated again.');assert.equal(await page.getByLabel(/I authorize uploading this video/).isChecked(),false);assert.equal(await submit.isEnabled(),false);
 await page.getByLabel(/I authorize uploading this video/).check();await submit.click();await page.getByText('Submitted. Delivery status updates above.',{exact:true}).waitFor();assert.equal(writes.length,1);assert.equal(writes[0].tiktok.title,'Updated again.');assert.equal(writes[0].tiktok.privacy,'SELF_ONLY');assert.equal(writes[0].tiktok.ownBrand,true);assert.equal(writes[0].tiktok.allowDuet,false);assert.equal(writes[0].tiktok.consent,true);
 mode='too-long';await page.goto(base+'/too-long');await page.getByRole('alert').filter({hasText:'allows up to 5 seconds'}).waitFor();assert.equal(await page.getByRole('button',{name:'Approve and post now',exact:true}).isEnabled(),false);
 mode='needs-scope';await page.goto(base+'/needs-scope');await page.getByRole('alert').filter({hasText:'sign-in only'}).waitFor();assert.equal(await page.getByRole('button',{name:'Approve and post now',exact:true}).isEnabled(),false);assert.equal(await page.getByRole('link',{name:'Reconnect TikTok for posting'}).getAttribute('href'),'/api/social/tiktok/connect');
 assert.equal(creatorReads,3);assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);console.log('PASS: TikTok creator identity, no default privacy/interactions, editable caption, renewed consent, disclosures, duration limits, scope reconnect and one explicit submission.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.close();});
