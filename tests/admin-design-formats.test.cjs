const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(file,mocks={}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,Error,require:name=>name in mocks?mocks[name]:require(name)});return module.exports;}
test('design gallery checks master-admin access before rendering, including signed-in customers',async()=>{
 for(const [error,target] of [['UNAUTHENTICATED','/login'],['FORBIDDEN','/dashboard'],['Database unavailable','/dashboard']]){
  const page=load('app/admin/design-formats/page.tsx',{'@/lib/admin/context':{superAdminContext:async()=>{throw new Error(error);}},'next/navigation':{redirect:url=>{throw new Error('redirect:'+url);}},'@/components/AdminTabs':()=>null,'./DesignFormats':()=>null});
  await assert.rejects(page.default(),{message:'redirect:'+target});
 }
 let checked=false;const page=load('app/admin/design-formats/page.tsx',{'@/lib/admin/context':{superAdminContext:async()=>{checked=true;}},'next/navigation':{redirect:()=>{throw new Error('Unexpected redirect');}},'@/components/AdminTabs':()=>null,'./DesignFormats':()=>null});
 assert.ok(await page.default());assert.equal(checked,true);
});
const renderer=load('lib/render/design-formats.ts');
test('new format previews escape supplied text and colors, and retain readable type for supported sizes',()=>{
 for(const format of renderer.DESIGN_FORMATS)for(const size of ['portrait','square','story']){
  const svg=renderer.renderDesignFormat({brand:'A & B',headline:'<script>alert(1)</script>',cta:'See <more>',photo:'/design-formats/rumi-guitar.png',size,accent:'"/><script>alert(1)</script>'},format.value);
  assert.doesNotMatch(svg,/<script/i);assert.match(svg,/A &amp; B/);assert.match(svg,/See &lt;more&gt;/);assert.match(svg,new RegExp('height="'+renderer.DESIGN_SIZES[size].height+'"'));assert.match(svg,/width="1080"/);
 }
 const short=renderer.designHeadline('Find your sound');assert.equal(short.overflow,false);assert.ok(short.size>=84);
 assert.equal(renderer.designHeadline('W'.repeat(64)).overflow,true,'Unfittable headlines must be flagged instead of exported as tiny text');
});
