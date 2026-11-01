// Real weekly card and its styles; all requests stay in this local fixture.
const {chromium} = require('playwright');
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-publishing-'));
let browser, server;
(async () => {
  const item = {id:'post', campaignId:'campaign', brandId:'brand', date:'2099-01-01', day:0,
    type:'video_post', kind:'motion_reel', headline:'Find your sound', caption:'Full caption for other platforms.',
    status:'approved', isReady:true, approvalBlockedReason:null, previewUrl:null, mediaUrl:null, mediaKind:'video',
    assetId:'video', downloadUrl:null, platforms:['x','youtube'], needsAttention:false, deliveries:[],
    changeRequest:null, changesRequested:false, nextAction:'review'};
  fs.writeFileSync(path.join(out, 'entry.tsx'), `import React from 'react';import {createRoot} from 'react-dom/client';import WeeklyCard from ${JSON.stringify(repo+'/components/weekly/WeeklyCard')};import styles from ${JSON.stringify(repo+'/components/weekly/weekly.module.css')};import ${JSON.stringify(repo+'/app/globals.css')};createRoot(document.getElementById('root')!).render(<div className={styles.workspace} style={{width:location.pathname==='/narrow'?220:360,maxWidth:'100%',margin:0}}><WeeklyCard item={${JSON.stringify(item)}} canManage onChanged={()=>{}}/></div>);`);
  await esbuild.build({entryPoints:[path.join(out,'entry.tsx')],bundle:true,outfile:path.join(out,'app.js'),nodePaths:[repo+'/node_modules'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
  const writes = [], unexpected = [], errors = [];
  const draft = {contentItemId:'post',sourceText:item.caption,text:'Find your sound. Explore Rumi Guitars.',hasMedia:true};
  let failCaption = false;
  server = http.createServer(async (req,res) => {
    const url = new URL(req.url,'http://local');
    if (['/app.js','/app.css'].includes(url.pathname)) {
      res.setHeader('Content-Type',url.pathname.endsWith('.css')?'text/css':'application/javascript');
      return res.end(fs.readFileSync(path.join(out,url.pathname.slice(1))));
    }
    res.setHeader('Content-Type','application/json');
    if (url.pathname==='/api/publishing/status') return res.end('{"jobs":[]}');
    if (url.pathname==='/api/social/connections') return res.end(JSON.stringify({connections:[
      {id:'x',provider:'x',accountName:'rumiguitars1',status:'connected'},
      {id:'youtube',provider:'youtube',accountName:'Rumi Guitars',status:'connected'},
      {id:'instagram',provider:'instagram',accountName:'rumiguitars1',status:'connected'}]}));
    if (url.pathname==='/api/content-items/post/x-caption') {
      res.statusCode=failCaption?500:200;
      return res.end(JSON.stringify(failCaption?{error:'Caption temporarily unavailable.'}:draft));
    }
    if (url.pathname==='/api/publishing/schedule') {
      const chunks=[];for await(const chunk of req) chunks.push(chunk);
      writes.push(JSON.parse(Buffer.concat(chunks)));return res.end('{}');
    }
    if(url.pathname.startsWith('/api/')) {unexpected.push(url.pathname);res.statusCode=500;return res.end('{}');}
    res.setHeader('Content-Type','text/html');
    res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="public-page"><main id="root" style="padding:8px;margin:0"></main><script src="/app.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch(require('./browser-launch.cjs')());
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',error=>errors.push(error.message));
  const base='http://127.0.0.1:'+server.address().port;
  for(const route of ['/narrow','/mobile']) {
    await page.goto(base+route);
    await page.getByRole('button',{name:'Show post details'}).click();
    await page.getByRole('button',{name:'Post or schedule',exact:true}).click();
    await page.getByRole('checkbox',{name:'X (Twitter) · rumiguitars1',exact:true}).check();
    const x=page.getByRole('region',{name:'X caption review'});
    await x.getByRole('paragraph').filter({hasText:draft.text}).waitFor();
    assert.equal(await x.getByLabel('Edit X caption').isVisible(),false);
    assert.equal(await page.getByText(/X may charge/).count(),0);
    await page.getByRole('checkbox',{name:'youtube · Rumi Guitars',exact:true}).check();
    const youtube=page.getByRole('region',{name:'YouTube settings'});
    const consent=youtube.getByRole('checkbox',{name:/I approve this upload/});
    assert.equal(await consent.isChecked(),false);
    await page.getByRole('combobox',{name:/^When/}).selectOption('now');
    const submit=page.getByRole('button',{name:'Approve and post now',exact:true});
    await submit.click();
    await page.getByText('Confirm the YouTube upload settings.',{exact:true}).waitFor();
    assert.equal(writes.length,route==='/narrow'?0:1,'Missing consent never submits');
    // Global weekly input styles must not stretch checkboxes or merge their labels.
    const rows=await youtube.locator('label').evaluateAll(labels=>labels.map(label=>{
      const box=label.getBoundingClientRect(),input=label.querySelector('input');
      return {top:box.top,bottom:box.bottom,width:input?.getBoundingClientRect().width,height:input?.getBoundingClientRect().height};
    }));
    rows.forEach((row,i)=>{if(i)assert.ok(row.top>=rows[i-1].bottom);if(row.width){assert.equal(row.width,18);assert.equal(row.height,18);}});
    const overflow=await page.getByTestId('weekly-post-post').evaluate(card=>Array.from(card.querySelectorAll('input,select,textarea,button,label,section')).filter(el=>el.getBoundingClientRect().width>0).some(el=>el.getBoundingClientRect().right>card.getBoundingClientRect().right+1));
    assert.equal(overflow,false,'Controls fit inside the weekly card');
    const evidence=process.env.PUBLISHING_QA_DIR;
    if(evidence){fs.mkdirSync(evidence,{recursive:true});await youtube.locator('..').screenshot({path:path.join(evidence,route.slice(1)+'-posting.png')});}
    await youtube.getByLabel('Visibility',{exact:true}).selectOption('unlisted');
    await youtube.getByLabel('Made for kids',{exact:true}).check();
    await youtube.getByLabel('Realistic altered or synthetic content',{exact:true}).uncheck();
    await consent.check();
    await submit.click();
    await page.getByText('Submitted. Delivery status updates above.',{exact:true}).waitFor();
    assert.deepEqual(writes.at(-1).socialConnectionIds,['x','youtube']);
    assert.deepEqual(writes.at(-1).x,{text:draft.text,sourceText:draft.sourceText,approved:true});
    assert.deepEqual(writes.at(-1).youtube,{certified:true,privacy:'unlisted',madeForKids:true,containsSyntheticMedia:false});
    assert.equal(await page.getByRole('button',{name:'✓ Submitted',exact:true}).isDisabled(),true);
  }
  failCaption=true;await page.goto(base+'/mobile');
  await page.getByRole('button',{name:'Show post details'}).click();
  await page.getByRole('button',{name:'Post or schedule',exact:true}).click();
  await page.getByRole('checkbox',{name:'X (Twitter) · rumiguitars1',exact:true}).check();
  await page.getByText('Caption temporarily unavailable.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Approve and post now',exact:true}).isDisabled(),true);
  failCaption=false;await page.getByRole('button',{name:'Retry X caption'}).click();
  await page.getByRole('region',{name:'X caption review'}).getByRole('paragraph').filter({hasText:draft.text}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Approve and post now',exact:true}).isEnabled(),true);
  assert.equal(writes.length,2,'Loading and retrying a caption never posts');
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  console.log('PASS: actual weekly card at narrow and mobile sizes, compact caption preview, aligned YouTube settings, explicit consent, exact approved payloads, no duplicate submissions, and caption retry. Local fixtures only.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.close();fs.rmSync(out,{recursive:true,force:true});});
