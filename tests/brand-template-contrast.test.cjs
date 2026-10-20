const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const moduleShim={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../lib/render/brand-templates.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleShim,exports:moduleShim.exports});
const {renderBrandTemplate}=moduleShim.exports;
function lum(hex){const c=hex.slice(1).match(/../g).map(v=>{const n=parseInt(v,16)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];}
test('light brand palettes keep white headlines legible on dark template backgrounds',()=>{
 for(const style of ['modern-gradient','geometric-focus'])for(const color of ['#ffffff','#eef7cf','#ffaaee','#151b35']){
  const svg=renderBrandTemplate({brand:'Example business',headline:'A clear message',primaryColor:color,accentColor:'#fff9a0'},style);
  const stops=[...svg.matchAll(/<stop(?: offset="1")? stop-color="(#[a-f0-9]{6})"/gi)].slice(0,2).map(m=>m[1]);
  assert.equal(stops.length,2);
  for(const background of stops)assert.ok(1.05/(lum(background)+.05)>=4.5,`headline contrast on ${background}`);
  assert.ok(svg.includes('fill="#111827"'),'light call to action uses dark lettering');
 }
});
