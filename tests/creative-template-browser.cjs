// Checks actual template controls with synthetic media; never saves or publishes creative.
const {chromium}=require('playwright'),esbuild=require('esbuild'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'creative-templates-'));
let browser,server;const writes=[];
(async()=>{
 fs.writeFileSync(path.join(out,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Studio from ${JSON.stringify(repo+'/app/studio/CreativeStudio')};import Campaign from ${JSON.stringify(repo+'/components/RenderCreativeButton')};import ${JSON.stringify(repo+'/app/globals.css')};const brand={name:'Local Practice',primaryColor:'#152846',secondaryColor:'#ffffff',accentColor:'#9b3175',headingFont:'Arial',bodyFont:'Arial'};createRoot(document.getElementById('root')!).render(<><Studio brand={brand}/><section id="campaign"><Campaign campaignId="camp" contentItemId="post" headline="Make room for a calmer day" imageUrl="/photo.svg" displayUrl="/saved-creative.svg" initialDesignStyle="geometric-focus" existingCreative brand={brand}/></section></>);`);
 await esbuild.build({entryPoints:[path.join(out,'entry.tsx')],bundle:true,outfile:path.join(out,'app.js'),nodePaths:[repo+'/node_modules'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 server=http.createServer((req,res)=>{
  if(req.method==='POST'){writes.push(req.url);res.statusCode=500;res.end('Choosing a preview must not save or generate media');return;}
  if(['/app.js','/app.css'].includes(req.url)){res.setHeader('Content-Type',req.url.endsWith('css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(out,req.url.slice(1))));return;}
  if(req.url==='/api/video/queue'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({configured:false,credits:0,images:[],jobs:[]}));return;}
  if(req.url==='/photo.svg'||req.url==='/saved-creative.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="700"><rect width="500" height="700" fill="#c6a67b"/><circle cx="250" cy="250" r="100" fill="#d5e9e3"/></svg>');return;}
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body class="public-page"><main id="root"></main><script src="/app.js"></script>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByLabel('Headline',{exact:true}).fill('Make room for a calmer day');
 await page.getByLabel('Subheadline',{exact:true}).fill('Explore your options.');
 const picker=page.getByRole('group',{name:'Creative treatment'});
 for(const style of ['Modern Gradient','Framed Editorial','Geometric Focus']){
  const button=picker.getByRole('button',{name:new RegExp('^'+style)});await button.click();assert.equal(await button.getAttribute('aria-pressed'),'true');
  assert.ok(await page.getByRole('img',{name:/Local Practice creative/}).locator('svg').count());
 }
 await picker.getByRole('button',{name:/More layouts/}).click();assert.ok(await picker.getByRole('button',{name:/^Cinematic Showcase/}).count());
 const campaign=page.locator('#campaign');
 const large=campaign.getByRole('img',{name:'Make room for a calmer day design preview'});
 assert.equal(await large.locator('img').getAttribute('src'),'/saved-creative.svg','Show the saved creative until a design is selected');
 assert.equal(await campaign.getByRole('button',{name:/^Geometric Focus/}).getAttribute('aria-pressed'),'true','Select the saved design initially');
 const normalize=svg=>svg.replace(/id="[^"]+"/g,'id="scoped"').replace(/url\(#[^)]+\)/g,'url(#scoped)');
 let previous='';
 for(const style of ['Modern Gradient','Framed Editorial','Geometric Focus']){
  const choice=campaign.getByRole('button',{name:new RegExp('^'+style)});await choice.click();assert.equal(await choice.getAttribute('aria-pressed'),'true');
  assert.equal(await choice.locator('svg image[href="/photo.svg"]').count(),1,'Real source image must appear once in the preview');
  const artwork=await large.locator('svg').evaluate(node=>node.outerHTML);
  assert.notEqual(artwork,previous,'The large preview must change immediately with the selected design');previous=artwork;
  assert.equal(normalize(artwork),normalize(await choice.locator('svg').evaluate(node=>node.outerHTML)),'Large preview must match the selected card');
  assert.equal(await large.locator('svg image[href="/photo.svg"]').count(),1,'Keep the original photo in the large preview');
 }
 await campaign.getByRole('button',{name:/More layouts/}).click();
 for(const label of ['Classic photo overlay','Automatic variety']){
  const choice=campaign.getByRole('button',{name:new RegExp('^'+label)});await choice.click();
  assert.equal(normalize(await large.locator('svg').evaluate(node=>node.outerHTML)),normalize(await choice.locator('svg').evaluate(node=>node.outerHTML)));
 }
 assert.deepEqual(writes,[],'Changing designs must not generate, save or publish anything');
 const ids=await page.locator('svg [id]').evaluateAll(nodes=>nodes.map(n=>n.id));assert.equal(new Set(ids).size,ids.length,'SVG gradient and mask IDs must be isolated between cards');
 await page.setViewportSize({width:390,height:844});await picker.getByRole('button',{name:'Show fewer layouts'}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'Mobile controls must not overflow horizontally');
 assert.deepEqual(errors,[]);console.log('PASS: live campaign previews, saved design, source photos, no writes, isolated SVG IDs and mobile width.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));});
