const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const path=require('node:path');
function load(file){const moduleShim={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleShim,exports:moduleShim.exports,require:name=>load(path.resolve(path.dirname(file),name+'.ts'))});return moduleShim.exports;}
const {renderBrandTemplate}=load(require.resolve('../lib/render/brand-templates.ts'));
function lum(hex){const c=hex.slice(1).match(/../g).map(v=>{const n=parseInt(v,16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];}
test('headlines retain readable contrast on lighter layouts across pale, saturated and dark brand colors',()=>{
 for(const style of ['modern-gradient','geometric-focus','framed-editorial'])for(const color of ['#ffffff','#eef7cf','#ffaaee','#151b35','#000000','#00ff00','#ffff00','#00ffff']){
  const svg=renderBrandTemplate({brand:'Example business',headline:'A clear message',primaryColor:color,accentColor:'#fff9a0'},style);
  const stops=[...svg.matchAll(/<stop(?: offset="1")? stop-color="(#[a-f0-9]{6})"/gi)].slice(0,2).map(m=>m[1]);
  assert.equal(stops.length,2);
  const headline=svg.match(/<text\b[^>]*fill="(#[a-f0-9]{6})"[^>]*>A clear message<\/text>/i);
  assert.ok(headline,'inspect the actual rendered headline color');
  for(const background of stops){
   assert.ok(lum(background)>.8,'background stays light even for a dark brand');
   assert.ok((lum(background)+.05)/(lum(headline[1])+.05)>=4.5,`headline ${headline[1]} contrast on ${background}`);
  }
  assert.ok(svg.includes('fill="#111827"'),'light call to action uses dark lettering');
 }
});
