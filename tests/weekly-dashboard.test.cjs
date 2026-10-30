const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function dashboard({completed=false,legacyBrand=false,isSuperAdmin=false}={}){
  const reads=[];
  const prisma={onboardingState:{findUnique:async q=>{reads.push(q.where.organizationId);return{completed}}},brand:{findFirst:async q=>{assert.equal(q.where.organizationId,'org');assert.equal(q.where.onboardingCompleted,true);reads.push(q.where.organizationId);return legacyBrand?{id:'existing'}:null}}};
  const module={exports:{}},mocks={
    'next/navigation':{redirect:path=>{throw new Error('redirect:'+path)}},
    '@/lib/studio/page-context':{studioPageContext:async()=>({context:{organizationId:'org',isSuperAdmin},recovery:null})},
    '@/components/StudioRecovery':()=>null,'@/components/weekly/WeeklyWorkspace':()=>null,'@/lib/prisma':{prisma},
  };
  const source=ts.transpileModule(fs.readFileSync(path.join(root,'app/dashboard/page.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(source,{module,exports:module.exports,require:name=>mocks[name]||require(name)});
  return{render:module.exports.default,reads};
}
test('established customer brand opens the weekly dashboard without restarting onboarding',async()=>{
  const f=dashboard({legacyBrand:true});assert.ok(await f.render());assert.deepEqual(f.reads,['org','org']);
});
test('completed new onboarding opens weekly dashboard and incomplete business goes to setup',async()=>{
  assert.ok(await dashboard({completed:true}).render());await assert.rejects(dashboard().render(),/redirect:\/onboarding/);
});
test('Admin preview needs no customer onboarding reads',async()=>{const f=dashboard({isSuperAdmin:true});assert.ok(await f.render());assert.equal(f.reads.length,0);});
