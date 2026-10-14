const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, cache = new Map()) {
  file = path.resolve(root, file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js, {module, exports: module.exports, HTMLVideoElement: class {}, require(name) { return load(path.resolve(path.dirname(file), `${name}.ts`), cache); }});
  return module.exports;
}
const { photoMotion } = load('lib/reels/animation.ts');
const { REEL_STYLES } = load('lib/reels/timeline.ts');
test('whole product stays inside its panel throughout every motion preset', () => {
  for (const animation of ['none', 'gentle', 'pan', 'lively']) for (let p = 0; p <= 1; p += .05) {
    const {zoom, x, y} = photoMotion(animation, p, 0, true);
    assert.ok(zoom + 2 * Math.abs(x) <= 1, `${animation} product width clips`);
    assert.ok(zoom + 2 * Math.abs(y) <= 1, `${animation} product height clips`);
  }
  for (const animation of ['gentle', 'pan', 'lively']) for (let p = 0; p <= 1; p += .05) {
    const {zoom, x, y} = photoMotion(animation, p, 0, false);
    assert.ok(zoom >= 1 + 2 * Math.abs(x) && zoom >= 1 + 2 * Math.abs(y), `${animation} exposes background during cover motion`);
  }
  assert.deepEqual({...photoMotion('none', .6, 0, true)}, {zoom:1, x:0, y:0});
});
// Canvas is an optional QA runtime, not an application dependency.
const canvasPath = process.env.REEL_QA_CANVAS;
const visual = canvasPath ? test : test.skip;
visual('actual frames preserve short captions, whole products, transitions and older long drafts', async () => {
  const { createCanvas, Image, GlobalFonts } = require(canvasPath);
  GlobalFonts.registerFromPath(path.join(root, 'public/fonts/Arial.ttf'), 'Arial');
  function canvas() { const c = createCanvas(1080, 1920); c.ownerDocument = {createElement:canvas}; return c; }
  const fixture = createCanvas(600, 1000), f = fixture.getContext('2d');
  f.fillStyle = '#f6f4eb'; f.fillRect(0,0,600,1000);
  f.fillStyle = '#23b6a3'; f.fillRect(0,0,600,18); f.fillRect(0,982,600,18); f.fillRect(0,0,18,1000); f.fillRect(582,0,18,1000);
  f.fillStyle = '#b08b58'; f.beginPath(); f.ellipse(300,600,170,240,0,0,Math.PI*2); f.fill(); f.fillRect(270,100,60,500);
  const image = new Image(); image.src = fixture.toBuffer('image/png'); await image.decode();
  // Native Image exposes width/height; the browser renderer expects natural dimensions.
  Object.defineProperties(image,{naturalWidth:{value:image.width},naturalHeight:{value:image.height}});
  const {drawReel} = load('lib/reels/draw.ts');
  const base = {brand:'RUMI STUDIO', website:'rumi.example', cta:'Explore the collection', color:'#142b2c', accent:'#ead7ad', animation:'gentle', closingSeconds:3,
    scenes:[{id:'a',src:'qa-product-a',kind:'image',headline:'Crafted to be heard',detail:'A quieter kind of quality.',seconds:4},{id:'b',src:'qa-product-b',kind:'image',headline:'Every detail matters',detail:'Discover your next favorite.',seconds:4},{id:'c',src:'qa-product-c',kind:'image',headline:'Make room for music',detail:'',seconds:4}]};
  const output = process.env.REEL_QA_OUTPUT;
  const sheet = createCanvas(1080,2560), sheetCtx = sheet.getContext('2d');
  let tile=0;
  for (const {value:style} of REEL_STYLES) {
    for (const long of [false,true]) {
      const project = {...base,style,scenes:base.scenes.map(scene=>long?{...scene,headline:'A longer saved headline that still needs to fit safely inside the caption area without colliding with the next line',detail:'Older saved drafts can contain much more detail than a newly planned concise reel. Captions should stay within their reserved area.'}:scene)};
      for (const time of [1.2,4.2,12.8]) {
        const c=canvas(), ctx=c.getContext('2d'), texts=[], pictures=[];
        const fillText=ctx.fillText.bind(ctx), drawImage=ctx.drawImage.bind(ctx);
        ctx.fillText=(text,x,y)=>{texts.push({text,x,y,font:ctx.font,width:ctx.measureText(text).width,align:ctx.textAlign});fillText(text,x,y);};
        ctx.drawImage=(...args)=>{pictures.push(args);drawImage(...args);};
        drawReel(ctx,project,[image,image,image],time);
        assert.ok(texts.every(t=>t.y>=0 && t.y<1880), `${style} caption exceeds frame`);
        assert.ok(texts.every(t=>t.align==='center'?t.x-t.width/2>=0&&t.x+t.width/2<=1080:t.x>=0&&t.x+t.width<=1080),`${style} text clips horizontally`);
        if(time===1.2 && !long) assert.ok(texts.some(t=>t.text==='Crafted to be heard'),`${style} lost short caption`);
        if(time===12.8 && !long) assert.ok(texts.some(t=>t.text==='Explore the collection'),`${style} lost end CTA`);
        if(time===1.2 && style==='spotlight') {
          const args=pictures.find(p=>p[0]===image); assert.ok(args[1]>=104 && args[2]>=272); assert.ok(args[1]+args[3]<=976 && args[2]+args[4]<=1208);
          const pixels=ctx.getImageData(0,0,1080,1920).data; let green=0;
          for(let i=0;i<pixels.length;i+=4) if(pixels[i+1]>100 && pixels[i]<80 && pixels[i+2]>90)green++;
          assert.ok(green>12000,'contained product border missing');
        }
        if(!long && time!==4.2){sheetCtx.drawImage(c,(tile%3)*360,Math.floor(tile/3)*640,360,640);tile++;}
      }
    }
  }
  for(const {value:style} of REEL_STYLES){
    const still={...base,style,animation:'none'}, first=canvas(), second=canvas();
    drawReel(first.getContext('2d'),still,[image,image,image],.1);
    drawReel(second.getContext('2d'),still,[image,image,image],3.7);
    assert.deepEqual(first.toBuffer('image/png'),second.toBuffer('image/png'),`${style} moves with animation disabled`);
  }
  if(output){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'renderer-contact-sheet.png'),sheet.toBuffer('image/png'));
    if(process.env.REEL_QA_PHOTO){
      const photo=new Image();photo.src=fs.readFileSync(process.env.REEL_QA_PHOTO);await photo.decode();
      Object.defineProperties(photo,{naturalWidth:{value:photo.width},naturalHeight:{value:photo.height}});
      const treatments=createCanvas(1080,640), treatmentsCtx=treatments.getContext('2d');
      for(const [index,style] of ['cinematic','spotlight','editorial'].entries()){
        const c=canvas();drawReel(c.getContext('2d'),{...base,style,scenes:[{...base.scenes[0],headline:'A moment to reconnect',detail:'Notice what supports you.'}]},[photo],1.2);
        treatmentsCtx.drawImage(c,index*360,0,360,640);
      }
      fs.writeFileSync(path.join(output,'real-presenter-treatments.png'),treatments.toBuffer('image/png'));
    }
    fs.writeFileSync(path.join(output,'README.txt'),'Actual drawReel frames: rows pair scene/end card per supported style. Synthetic bordered product fixture is QA only; no generated asset is included in the product. Native canvas rendering, not a browser capture.\n');}
});
