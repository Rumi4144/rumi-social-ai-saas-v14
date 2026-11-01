const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{Resvg}=require('@resvg/resvg-js'),sharp=require('sharp');
const {load}=require('./helpers/weekly-load.cjs');
const root=path.resolve(__dirname,'..'),out=process.env.WEEKLY_LIBRARY_QA_DIR||fs.mkdtempSync(path.join(os.tmpdir(),'weekly-library-'));
const {WEEKLY_DESIGN_CHOICES,renderWeeklyDesign}=load('lib/render/weekly-layouts.ts');
const {weeklyDesignFonts}=load('lib/render/raster.ts');
const fonts={fontFiles:['Arial.ttf','CormorantGaramond.ttf','BarlowCondensed-ExtraBold.ttf','CormorantGaramond-SemiBold.ttf','NotoSans-Regular.ttf'].map(f=>path.join(root,'public/fonts',f)),loadSystemFonts:false,defaultFontFamily:'Arial'};
const esc=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
let browser;
(async()=>{
 fs.mkdirSync(out,{recursive:true});const designFonts=await weeklyDesignFonts();
 browser=await chromium.launch(require('./browser-launch.cjs')());const page=await browser.newPage();
 await page.setContent(`<style>@font-face{font-family:'Barlow Condensed ExtraBold';font-weight:800;src:url('${designFonts.display}')}@font-face{font-family:'Cormorant Garamond Light';font-weight:600;src:url('${designFonts.editorial}')}@font-face{font-family:'Noto Sans';src:url('${designFonts.body}')}</style><div id="sample"></div>`);
 await page.evaluate(async()=>{await Promise.all([document.fonts.load('800 100px "Barlow Condensed ExtraBold"'),document.fonts.load('600 100px "Cormorant Garamond Light"'),document.fonts.load('100px "Noto Sans"')]);});
 let checks=0;
 for(const format of ['square','portrait','story'])for(const headline of ['Find your sound','Rumi 41” Acoustic Guitar — Premium Steel String Folk Guitar for Beginners & Professionals | Natural Wood Finish']){
  for(const item of WEEKLY_DESIGN_CHOICES){
   const svg=renderWeeklyDesign({brand:'Rumi Guitars',headline,format},item.value);
   const fits=await page.evaluate(svg=>{const host=document.getElementById('sample');host.innerHTML=svg;const title=host.querySelector('[data-role="headline"]'),[x,y,w,h]=title.getAttribute('data-box').split(',').map(Number),b=title.getBBox();return {ok:b.x>=x-3&&b.x+b.width<=x+w+3&&b.y>=y-12&&b.y+b.height<=y+h+12,box:{x:b.x,y:b.y,width:b.width,height:b.height},region:{x,y,w,h}};},svg);
   assert.ok(fits.ok,`${item.label} ${format}: ${JSON.stringify(fits)}`);checks++;
  }
 }
 // Export every composition with the same real assets, then build six contact
 // sheets. A change in wording or colors cannot hide a duplicate composition.
 const imageUrl='data:image/png;base64,'+fs.readFileSync(path.join(root,'public/design-formats/rumi-guitar.png')).toString('base64');
 const logoUrl='data:image/png;base64,'+fs.readFileSync(path.join(root,'public/design-formats/rumi-guitars-logo.png')).toString('base64');
 const thumbs=[],hashes=new Set();
 for(const [index,item] of WEEKLY_DESIGN_CHOICES.entries()){
  const svg=renderWeeklyDesign({brand:'Rumi Guitars',headline:'Find your flamenco sound',cta:'Explore the MF-17',imageUrl,logoUrl,format:'portrait',designFonts,primaryColor:'#172846',accentColor:'#bc8c35'},item.value);
  const png=new Resvg(svg,{font:fonts}).render().asPng();fs.writeFileSync(path.join(out,item.value+'.png'),png);
  hashes.add(require('node:crypto').createHash('sha256').update(png).digest('hex'));
  const image=await sharp(png).resize(240,300).png().toBuffer();
  const label=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="48"><rect width="240" height="48" fill="#f2efe8"/><text x="5" y="20" font-size="13" font-family="Arial" fill="#172846">${String(index+1).padStart(2,'0')} · ${esc(item.label)}</text><text x="5" y="39" font-size="11" font-family="Arial" fill="#53625b">${esc(item.family)}</text></svg>`);
  thumbs.push(await sharp({create:{width:240,height:348,channels:3,background:'#f2efe8'}}).composite([{input:image,left:0,top:0},{input:label,left:0,top:300}]).png().toBuffer());
 }
 assert.equal(hashes.size,90,'Every rendered composition must be different with identical assets, copy and palette');
 for(let sheet=0;sheet<6;sheet++){
  await sharp({create:{width:1280,height:1108,channels:3,background:'#f2efe8'}}).composite(thumbs.slice(sheet*15,(sheet+1)*15).map((input,i)=>({input,left:20+(i%5)*252,top:20+Math.floor(i/5)*360}))).png().toFile(path.join(out,`contact-${sheet+1}.png`));
 }
 const featured=[0,7,14,22,33,43];
 await sharp({create:{width:784,height:740,channels:3,background:'#f2efe8'}}).composite(featured.map((n,i)=>({input:thumbs[n],left:20+(i%3)*252,top:16+Math.floor(i/3)*360}))).png().toFile(path.join(out,'preview.png'));
 fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rumi · 90 layout preview</title><style>body{margin:24px;background:#f2efe8;color:#172846;font:16px Arial}h1{margin-bottom:8px}p{max-width:800px;line-height:1.5}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:20px}figure{margin:0}img{width:100%;border-radius:5px}figcaption{padding:10px 0;font-weight:600}a{color:inherit}small{display:block;font-weight:400;margin-top:5px}</style><h1>90 distinct weekly layouts</h1><p>The same original Martinez product photograph, website logo and wording in 90 compositions. Click a design for its full-size preview. New weekly packs use each business’s own saved layout history; preparation stays one week at a time.</p><div class="grid">${WEEKLY_DESIGN_CHOICES.map((item,i)=>`<figure><a href="${item.value}.png"><img loading="lazy" src="${item.value}.png" alt="${esc(item.label)}"></a><figcaption>${String(i+1).padStart(2,'0')} · ${esc(item.label)}<small>${esc(item.family)}</small></figcaption></figure>`).join('')}</div>`);
 console.log(`PASS: ${checks} browser typography checks; 90 complete original-photo exports, six contact sheets.\n${out}`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();});
