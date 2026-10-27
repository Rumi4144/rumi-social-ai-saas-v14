const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,deps){const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module,exports:module.exports,URLSearchParams,require:n=>n in deps?deps[n]:require(n)});return module.exports;}
test('all ten public Predis models are listed while Alkai is closed and both Flare comparisons are available',()=>{
 const {AI_OPTIONS}=load('lib/ai-lab/options.ts',{'./catalog':{labModels:{flux:{},'flare-medium':{},'flare-high':{},holding:{},infinitetalk:{},kling:{},speech:{},veo:{}},labConfigured:()=>true}});
 assert.equal(AI_OPTIONS.filter(o=>o.predis).length,10);assert.equal(new Set(AI_OPTIONS.map(o=>o.id)).size,AI_OPTIONS.length);
 assert.equal(AI_OPTIONS.find(o=>o.id==='alkai').availability,'closed');assert.equal(AI_OPTIONS.find(o=>o.id==='alkai').href,undefined);
 assert.equal(AI_OPTIONS.find(o=>o.id==='gpt-image').availability,'rumi');assert.equal(AI_OPTIONS.find(o=>o.id==='gpt-image').href,'/ai-test-lab?model=flare-medium');assert.equal(AI_OPTIONS.find(o=>o.id==='flare-high').href,'/ai-test-lab?model=flare-high');
 for(const o of AI_OPTIONS.filter(o=>o.availability==='external'))assert.ok(o.href.startsWith('https://'));
});
test('catalog page never renders options or supplier prices for customer roles',async()=>{
 for(const role of ['owner','admin','member','viewer','superadmin']){
  let rendered=0;const module=load('app/ai-test-lab/options/page.tsx',{'@/lib/studio/page-context':{studioPageContext:async()=>({context:{role,isSuperAdmin:role==='superadmin'}})},'@/components/StudioRecovery':()=>null,'@/lib/ai-lab/catalog':{labCanRun:(r,admin)=>admin===true||r==='superadmin'},'@/lib/ai-lab/options':{AI_OPTIONS:[],optionReady:()=>true},'./OptionsCatalog':()=>{rendered++;return React.createElement('p',null,'comparison catalog');}});
  const html=renderToStaticMarkup(await module.default());assert.equal(rendered,role==='superadmin'?1:0);if(role!=='superadmin')assert.doesNotMatch(html,/comparison catalog|\$0/);
 }
});
test('test links preselect only supported models and do not accept arbitrary provider names',async()=>{
 for(const model of ['veo','kling','flux','flare-medium','flare-high','infinitetalk','speech','https://malicious.test']){
  let chosen;const module=load('app/ai-test-lab/page.tsx',{'@/lib/studio/page-context':{studioPageContext:async()=>({context:{role:'superadmin',isSuperAdmin:true,organizationId:'own',organization:{name:'Test'}}})},'@/components/StudioRecovery':()=>null,'@/lib/ai-lab/catalog':{labCanRun:()=>true},'@/lib/prisma':{prisma:{campaign:{findMany:async()=>[]}}},'./TestLab':p=>{chosen=p.initialModel;return React.createElement('p');}});
  renderToStaticMarkup(await module.default({searchParams:Promise.resolve({model})}));assert.equal(chosen,['veo','kling','flux','flare-medium','flare-high','infinitetalk'].includes(model)?model:undefined);
 }
});
