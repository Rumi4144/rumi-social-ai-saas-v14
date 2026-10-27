// Local browser fixtures: no paid providers, sign-ins or publishing.
const {chromium}=require('playwright'),esbuild=require('esbuild'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'photo-review-ui-'));let server,browser;
(async()=>{
 fs.writeFileSync(path.join(out,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Notice from ${JSON.stringify(repo+'/components/PhotoReviewNotice')};import Generate from ${JSON.stringify(repo+'/components/RegenerateImageButton')};import ${JSON.stringify(repo+'/app/globals.css')};createRoot(document.getElementById('root')!).render(<><Generate campaignId="camp" contentItemId="post" headline="Financial clarity"/><Notice campaignId="camp" contentItemId="post" assetId="candidate" issues={['Repeats the desk portrait from the campaign.','The expression does not fit the reassuring message.']}/></>);`);
 await esbuild.build({entryPoints:[path.join(out,'entry.tsx')],bundle:true,outfile:path.join(out,'app.js'),nodePaths:[repo+'/node_modules'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'navigation-fixture',setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:'export const useRouter=()=>({refresh:()=>{window.__refreshes=(window.__refreshes||0)+1}});'}));}}]});
 const generates=[],selections=[],unexpected=[];let completes=false;
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/app.js'||url.pathname==='/app.css'){res.setHeader('Content-Type',url.pathname.endsWith('css')?'text/css':'application/javascript');return res.end(fs.readFileSync(path.join(out,url.pathname.slice(1))));}
  if(url.pathname==='/api/reels/media'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="380"><rect width="300" height="380" fill="#789884"/></svg>');}
  if(url.pathname==='/api/creative/generate-image'||url.pathname==='/api/creative/select-photo'){
   const chunks=[];for await(const part of req)chunks.push(part);const data=JSON.parse(Buffer.concat(chunks).toString());res.setHeader('Content-Type','application/json');
   if(url.pathname.endsWith('generate-image')){generates.push(data);if(!completes){res.statusCode=202;return res.end(JSON.stringify({pending:true,error:'Photo review is still running.'}));}return res.end(JSON.stringify({needsReview:true,assetId:'candidate'}));}
   selections.push(data);return res.end('{"status":200}');
  }
  if(url.pathname.startsWith('/api/')){unexpected.push(url.pathname);res.statusCode=500;return res.end('{}');}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body class="public-page"><main style="width:calc(100% - 40px);max-width:850px;margin:20px" id="root"></main><script src="/app.js"></script></body></html>');
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,...require('./browser-launch.cjs')()});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));const base='http://127.0.0.1:'+server.address().port;await page.goto(base);
 await page.getByRole('button',{name:'Regenerate Image',exact:true}).click();await page.getByText('Photo review is still running.',{exact:true}).waitFor();assert.equal(generates.length,1);
 await page.reload();completes=true;await page.getByRole('button',{name:'Regenerate Image',exact:true}).click();await page.waitForFunction(()=>!sessionStorage.getItem('rumi-photo-request:camp:post:portrait'));assert.equal(generates.length,2);assert.equal(generates[0].requestId,generates[1].requestId);assert.equal(unexpected.length,0);assert.equal(selections.length,0);
 await page.getByRole('button',{name:'Use this photo after review',exact:true}).click();await page.getByRole('status').filter({hasText:'Photo selected'}).waitFor();assert.deepEqual(selections,[{campaignId:'camp',contentItemId:'post',assetId:'candidate'}]);
 for(const width of [1280,390]){await page.setViewportSize({width,height:950});await page.getByRole('region',{name:'Photo needs your review'}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,'review-'+width+'.png'),fullPage:true});}
 assert.deepEqual(errors,[]);console.log('Photo review UI passed: saved request survives reload, failed photo never auto-renders, explicit selection works, desktop/mobile layout fits. Screenshots: '+out);
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{await browser?.close();server?.close();});
