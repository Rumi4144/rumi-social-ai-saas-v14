const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function fixture(){
 const workflows=[];const deps={
 '@/lib/studio/page-context':{studioPageContext:async()=>({context:{organizationId:'org',role:'owner',organization:{name:'Rumi Guitars'}}})},
 '@/components/StudioRecovery':()=>null,
 '@/lib/prisma':{prisma:{campaign:{findMany:async q=>{assert.equal(q.where.brand.organizationId,'org');return[{id:'campaign',title:'Guitars',items:[]}];}}}},
 './PresenterStudio':p=>{workflows.push({provider:'runway',...p});return React.createElement('div',{'data-workflow':'runway'});},
 '@/app/ai-test-lab/TestLab':p=>{workflows.push({provider:'wavespeed',...p});return React.createElement('div',{'data-workflow':'wavespeed'});},
 '@/lib/ai-lab/catalog':{labCanRun:()=>true},'./gallery.module.css':{},
 };
 const module={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/studio/presenters/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{module,exports:module.exports,URLSearchParams,require:n=>n in deps?deps[n]:require(n)});
 return {workflows,render:async provider=>renderToStaticMarkup(await module.exports.default({searchParams:Promise.resolve({provider,campaignId:'campaign',contentItemId:'post'})}))};
}
test('provider choice defaults to lower-cost studio and keeps premium options visible with campaign context',async()=>{
 const f=fixture(),html=await f.render();assert.match(html,/WaveSpeed · lower cost/);assert.match(html,/Runway · premium/);assert.match(html,/25 included presenter photos/);assert.match(html,/accent and delivery options/);assert.match(html,/href="\/studio\/presenters\?campaignId=campaign&amp;contentItemId=post" aria-current="page"/);assert.match(html,/provider=runway/);assert.equal(f.workflows.length,1);assert.equal(f.workflows[0].provider,'wavespeed');assert.equal(f.workflows[0].initialCampaignId,'campaign');assert.equal(f.workflows[0].initialContentItemId,'post');
});
test('Runway is rendered only when explicitly selected and retains the lower-cost return choice',async()=>{
 const f=fixture(),html=await f.render('runway');assert.match(html,/provider=runway" aria-current="page"/);assert.equal(f.workflows.length,1);assert.equal(f.workflows[0].provider,'runway');assert.equal(f.workflows[0].initialCampaignId,'campaign');assert.equal(f.workflows[0].initialContentItemId,'post');assert.match(html,/Opening either studio or browsing presenters does not start a paid generation/);
});
