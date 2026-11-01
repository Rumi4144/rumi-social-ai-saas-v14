const {chromium}=require('playwright'),esbuild=require('esbuild'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.ADMIN_DESIGN_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'admin-design-formats-'));fs.mkdirSync(out,{recursive:true});let browser,server;
(async()=>{
 fs.writeFileSync(path.join(out,'entry.tsx'),`import React from 'react';import {createRoot} from 'react-dom/client';import Gallery from ${JSON.stringify(root+'/app/admin/design-formats/DesignFormats')};import ${JSON.stringify(root+'/app/globals.css')};createRoot(document.getElementById('root')).render(<Gallery/>);`);
 await esbuild.build({entryPoints:[path.join(out,'entry.tsx')],bundle:true,outfile:path.join(out,'app.js'),nodePaths:[root+'/node_modules'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'alias',setup(b){b.onResolve({filter:/^@\//},a=>({path:path.join(root,a.path.slice(2)+'.ts')}));}}]});
 const writes=[];server=http.createServer((req,res)=>{if(req.method!=='GET')writes.push(req.url);if(/^\/(design-formats|fonts)\/[a-zA-Z0-9_.-]+$/.test(req.url)){const file=path.join(root,'public',req.url);if(!fs.existsSync(file)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',req.url.endsWith('.png')?'image/png':req.url.endsWith('.woff2')?'font/woff2':'font/woff');res.end(fs.readFileSync(file));return;}if(['/app.js','/app.css'].includes(req.url)){res.setHeader('Content-Type',req.url.endsWith('css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(out,req.url.slice(1))));return;}res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><body class="public-page"><main style="max-width:1250px;margin:0 auto;padding:24px" id="root"></main><script src="/app.js"></script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch(require('./browser-launch.cjs')());const page=await browser.newPage({viewport:{width:1440,height:1100},acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 await page.getByRole('button',{name:'Download Color Banner',exact:true,disabled:false}).waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('article img')].length===12&&[...document.querySelectorAll('article img')].every(i=>i.complete&&i.naturalWidth===1080));
 assert.equal(await page.locator('article').count(),12);assert.equal(await page.getByAltText('Selected brand logo').isVisible(),true);const defaultSvg=decodeURIComponent((await page.locator('article img').first().getAttribute('src')).split(',').slice(1).join(','));assert.match(defaultSvg,/data-role="brand-logo"/);assert.match(defaultSvg,/@font-face/);assert.match(defaultSvg,/data:font\/woff2;base64,/);await page.screenshot({path:path.join(out,'gallery-desktop.png'),fullPage:true});

 const seen=new Set();
 for(let n=0;n<8;n++){
  await page.waitForFunction(()=>[...document.querySelectorAll('article img')].every(i=>i.complete&&i.naturalWidth===1080));
  const names=await page.locator('article h2').allTextContents();for(const name of names){assert.ok(!seen.has(name),'Every catalog entry should occur on one page');seen.add(name);}
  assert.ok(names.length<=12,'Render only one bounded page of full-resolution previews');
  if(n<7)await page.getByRole('button',{name:'Next designs',exact:true}).click();
 }
 assert.equal(seen.size,90);assert.equal(await page.getByRole('button',{name:'Next designs',exact:true}).isDisabled(),true);
 await page.getByLabel('Design family',{exact:true}).selectOption('Architecture');assert.equal(await page.locator('article').count(),6);
 await page.getByLabel('Find a layout',{exact:true}).fill('no-matching-design');assert.equal(await page.locator('article').count(),0);
 await page.getByLabel('Collection',{exact:true}).selectOption('all');
 async function choose(label){await page.getByLabel('Find a layout',{exact:true}).fill(label);await page.getByRole('button',{name:'Download '+label,exact:true,disabled:false}).waitFor();}
 for(const label of ['Bright & Bold','Vivid Overlay','Clean Editorial','Color Banner','Color Orbit','Editorial Feature','Diagonal Spotlight','Signature Frame','Ribbon Spotlight','Split Statement']){await choose(label);const saved=page.waitForEvent('download');await page.getByRole('button',{name:'Download '+label,exact:true}).click();const asset=await saved;await asset.saveAs(path.join(out,label.toLowerCase().replaceAll(' ','-')+'-branded-portrait.png'));await page.getByRole('button',{name:'Preview '+label,exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.locator('img').getAttribute('width'),'1080');await dialog.locator('img').screenshot({path:path.join(out,label.toLowerCase().replaceAll(' ','-')+'.png')});await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});}
 await choose('Bright & Bold');
 await page.getByLabel('Headline',{exact:true}).fill('A brighter way to play');
 await page.getByLabel('Use one brand accent').check();await page.getByLabel('Accent color').fill('#e82985');
 for(const [size,height] of [['portrait',1350],['square',1080],['story',1920]]){
  await page.getByLabel('Preview size').selectOption(size);const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download Bright & Bold',exact:true}).click();const download=await waiting;const file=path.join(out,download.suggestedFilename());await download.saveAs(file);const bytes=fs.readFileSync(file);assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),height);assert.ok(bytes.length>30000,'Downloaded PNG must contain the actual photo and artwork');
  const error=await page.evaluate(async({png,y})=>{const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});const [result,logo]=await Promise.all([load(png),load(document.querySelector('img[alt="Selected brand logo"]').src)]);const actual=document.createElement('canvas');actual.width=1080;actual.height=result.height;const a=actual.getContext('2d');a.drawImage(result,0,0);const expected=document.createElement('canvas');expected.width=366;expected.height=148;const b=expected.getContext('2d');b.fillStyle='#fff';b.fillRect(0,0,366,148);const scale=Math.min(366/logo.width,148/logo.height);b.drawImage(logo,(366-logo.width*scale)/2,(148-logo.height*scale)/2,logo.width*scale,logo.height*scale);const x=a.getImageData(64,y,366,148).data,z=b.getImageData(0,0,366,148).data;let total=0;for(let i=0;i<x.length;i+=4)for(let k=0;k<3;k++)total+=Math.abs(x[i+k]-z[i+k]);return total/(366*148*3);},{png:'data:image/png;base64,'+bytes.toString('base64'),y:size==='story'?150:58});assert.ok(error<3,'The actual website logo must survive export without being redrawn, stretched or covered: '+error);

 }

 for(const [size,height] of [['portrait',1350],['square',1080],['story',1920]]) {
  await page.getByLabel('Preview size').selectOption(size);
  for(const label of ['Color Banner','Color Orbit','Editorial Feature','Diagonal Spotlight','Signature Frame','Ribbon Spotlight','Split Statement','Crown Arch','Modern Pediment','Wide Margin','Scalloped Edge','Light Portal','Staggered Mosaic']) {
   await choose(label);
   const card=page.locator('article').filter({has:page.getByRole('heading',{name:label,exact:true})});
   const svg=decodeURIComponent((await card.locator('img').getAttribute('src')).split(',').slice(1).join(','));
   const bounds = await page.evaluate(async svg => {
    const host=document.createElement('div');host.style.cssText='position:absolute;left:-10000px;width:1080px';host.innerHTML=svg;document.body.append(host);
    try { await document.fonts.ready; const title=host.querySelector('[data-role="headline"]'),[x,y,w,h]=title.getAttribute('data-box').split(',').map(Number),box=title.getBBox();
     return {fits:box.x>=x-3&&box.x+box.width<=x+w+3&&box.y>=y-12&&box.y+box.height<=y+h+12,box:{x:box.x,y:box.y,width:box.width,height:box.height},region:{x,y,w,h}};
    } finally {host.remove();}
   },svg);
   assert.ok(bounds.fits,'Display lettering must fit its allocated region: '+label+' '+size+' '+JSON.stringify(bounds));
   assert.match(svg,/@font-face/);assert.match(svg,/data:font\/woff2;base64,/);assert.match(svg,/data:image\/png;base64,/);
   const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Download '+label,exact:true}).click();const download=await waiting;
   const file=path.join(out,download.suggestedFilename());await download.saveAs(file);const bytes=fs.readFileSync(file);
   assert.equal(bytes.readUInt32BE(16),1080);assert.equal(bytes.readUInt32BE(20),height);assert.ok(bytes.length>30000);
   const logoError=await page.evaluate(async png=>{const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});const [result,logo]=await Promise.all([load(png),load(document.querySelector('img[alt="Selected brand logo"]').src)]);const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=result.height;const ctx=canvas.getContext('2d');ctx.drawImage(result,0,0);const expected=document.createElement('canvas');expected.width=310;expected.height=126;const e=expected.getContext('2d');e.fillStyle='#fff';e.fillRect(0,0,310,126);const scale=Math.min(310/logo.width,126/logo.height);e.drawImage(logo,(310-logo.width*scale)/2,(126-logo.height*scale)/2,logo.width*scale,logo.height*scale);const a=ctx.getImageData(52,result.height===1920?120:48,310,126).data,b=e.getImageData(0,0,310,126).data;let sum=0;for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)sum+=Math.abs(a[i+c]-b[i+c]);return sum/(310*126*3);},'data:image/png;base64,'+bytes.toString('base64'));
   assert.ok(logoError<5,'Actual logo must remain unchanged in '+label+' '+size+': '+logoError);
   // Compare the actual server SVG renderer against the browser download,
   // including typography. Both receive the same licensed bundled fonts.
   const {Resvg}=require('@resvg/resvg-js'),sharp=require('sharp');
   const serverPng=new Resvg(svg,{font:{fontFiles:[root+'/public/fonts/Arial.ttf',root+'/public/fonts/CormorantGaramond.ttf',root+'/public/fonts/BarlowCondensed-ExtraBold.ttf',root+'/public/fonts/CormorantGaramond-SemiBold.ttf',root+'/public/fonts/NotoSans-Regular.ttf'],loadSystemFonts:false,defaultFontFamily:'Arial'}}).render().asPng();
   const area={left:40,top:height-275,width:980,height:170};
   const [a,b]=await Promise.all([sharp(bytes).extract(area).removeAlpha().raw().toBuffer(),sharp(serverPng).extract(area).removeAlpha().raw().toBuffer()]);let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);const difference=sum/a.length;
   // Linux Chromium and macOS Chrome differ by a few pixels in glyph hinting
   // and centered text advances. Allow under 3.2% mean channel difference;
   // exact font embedding and headline bounds remain independently checked.
   assert.ok(difference<8,'Server and browser typography must agree for '+label+' '+size+': '+difference);
   if(label==='Crown Arch'&&size==='square') {
    // Keep this cross-platform tolerance sensitive to a real font regression.
    const wrongFont=new Resvg(svg.replaceAll('Barlow Condensed ExtraBold','Arial'),{font:{fontFiles:[root+'/public/fonts/Arial.ttf',root+'/public/fonts/NotoSans-Regular.ttf'],loadSystemFonts:false,defaultFontFamily:'Arial'}}).render().asPng();
    const wrong=await sharp(wrongFont).extract(area).removeAlpha().raw().toBuffer();let wrongSum=0;for(let i=0;i<a.length;i++)wrongSum+=Math.abs(a[i]-wrong[i]);
    assert.ok(wrongSum/a.length>8,'Typography comparison must reject a substituted headline font');
   }
  }
 }
 await choose('Bright & Bold');
 await page.getByLabel('Headline',{exact:true}).fill('W'.repeat(64));await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button',{name:'Download Bright & Bold',exact:true}).isDisabled(),true);
 await page.getByLabel('Headline',{exact:true}).fill('Find your sound');
 await page.getByLabel('Try your own photo').setInputFiles({name:'unsafe.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await page.getByRole('status').filter({hasText:'Choose a JPG, PNG or WebP'}).waitFor();
 await page.getByLabel('Try your own photo').setInputFiles(path.join(root,'public/design-formats/rumi-guitar.png'));await page.getByText('Your photo is used only in this browser preview.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'Use Rumi Guitars sample',exact:true}).click();await page.getByText('Sample: an original Martinez MF-17 photo',{exact:false}).waitFor();
 await page.getByLabel('Brand name',{exact:true}).fill('Different Brand');await page.getByText('Upload this brand’s logo to finish its designs and enable downloads.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Download Bright & Bold',exact:true}).isDisabled(),true);assert.equal(await page.getByAltText('Selected brand logo').count(),0);await page.getByLabel('Use your own logo',{exact:true}).setInputFiles(path.join(root,'public/design-formats/rumi-guitars-logo.png'));await page.getByRole('button',{name:'Download Bright & Bold',exact:true,disabled:false}).waitFor();await page.getByRole('button',{name:'Use Rumi Guitars sample',exact:true}).click();await page.getByRole('button',{name:'Download Bright & Bold',exact:true,disabled:false}).waitFor();await page.getByLabel('Preview size').selectOption('portrait');await page.getByLabel('Collection',{exact:true}).selectOption('weekly');await page.getByLabel('Find a layout',{exact:true}).fill('');await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(out,'gallery-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[],'Previews and downloads must not alter customer records or trigger paid generation');console.log('PASS: 90 weekly layouts, pagination/family/search, studio studies, editable previews, full-size dialogs, portrait/square/story PNG downloads, headline safeguards, local upload/reset, mobile layout and no customer writes.');console.log(out);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(r=>server?.close(r)||r());});
