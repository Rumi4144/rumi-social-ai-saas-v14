const {test}=require('node:test');
const assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), ts=require('typescript');
function resolveSource(base){return ['.ts','.tsx'].map(ext=>require('node:path').resolve(base+ext)).find(file=>fs.existsSync(file));}
function load(file,deps={}) {
 const module={exports:{}};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 vm.runInNewContext(js,{module,exports:module.exports,require:n=>n in deps?deps[n]:n.startsWith('@/')?load(resolveSource(n.slice(2)),deps):n.startsWith('.')?load(resolveSource(require('node:path').resolve(require('node:path').dirname(file),n)),deps):require(n),URL,Blob,setTimeout});
 return module.exports;
}
test('Studio looks up only the selected organization and uses its brand',async()=>{
 const queries=[];
 const api=load('lib/studio/creative-context.ts',{'@/lib/prisma':{prisma:{brand:{findFirst:async query=>{
  queries.push(query);return query.where.organizationId==='master-mind'?{name:'Master Mind Advanced Hypnosis',primaryColor:'#123456',logoUrl:'https://master.example/logo.png'}:{name:'Rumi Guitars'};
 }}}}});
 const master=await api.studioBrand('master-mind','Master Mind');
 const guitar=await api.studioBrand('guitars','Guitars');
 assert.equal(master.name,'Master Mind Advanced Hypnosis');assert.equal(master.primaryColor,'#123456');
 assert.equal(master.logoUrl,'https://master.example/logo.png');assert.equal(guitar.logoUrl,undefined);
 assert.equal(guitar.name,'Rumi Guitars');assert.equal(queries[0].where.organizationId,'master-mind');
 assert.equal(queries[1].where.organizationId,'guitars');assert.equal(Object.keys(queries[0].where).length,1);
});
test('workspace with no brand uses its own organization name',async()=>{
 const api=load('lib/studio/creative-context.ts',{'@/lib/prisma':{prisma:{brand:{findFirst:async()=>null}}}});
 assert.equal((await api.studioBrand('new-workspace','New business')).name,'New business');
});
test('signed-out Studio recovers before loading any workspace data',async()=>{
 let reads=0;const Recovery=()=>null;
 const page=load('app/studio/page.tsx',{
  '@/lib/studio/page-context':{studioPageContext:async()=>({context:null,recovery:{title:'Sign in'}})},
  '@/lib/studio/creative-context':{studioBrand:async()=>{reads++;throw Error('must not load');}},
  '@/components/StudioRecovery':{default:Recovery},'./CreativeStudio':{default:()=>null},
 });
 const result=await page.default();assert.equal(result.type,Recovery);assert.equal(reads,0);
});
test('Master Mind starts with empty copy and its own preview, with no guitar demo',()=>{
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const svg=load('lib/render/svg.ts');
 const Studio=load('app/studio/CreativeStudio.tsx',{'@/lib/render/svg':svg,'./RunwayVideo':{default:()=>null}}).default;
 const html=renderToStaticMarkup(React.createElement(Studio,{brand:{name:'Master Mind Advanced Hypnosis',primaryColor:'#123456',secondaryColor:'#ffffff',accentColor:'#abcdef',headingFont:'Arial',bodyFont:'Arial'}}));
 assert.match(html,/Master Mind Advanced Hypnosis/);assert.match(html,/value=""/);
 assert.doesNotMatch(html,/Crafted to be heard|distinctive instrument|Rumi Guitars/);
 assert.match(html,/<svg /);
 assert.match(html,/Master Mind Advanced Hypnosis/i);
 assert.match(html,/#123456/);
 assert.doesNotMatch(html,/src="data:image\/svg/);

});

test('classic palette cannot inject markup into inline template previews',()=>{
 const {renderSocialSvg}=load('lib/render/svg.ts');
 const svg=renderSocialSvg({brand:'A business',headline:'A message',designStyle:'classic',primaryColor:'red" onload="alert(1)',secondaryColor:'"><script>alert(1)</script>',accentColor:'url(https://untrusted.example)'});
 assert.doesNotMatch(svg,/onload=|<script|untrusted.example/);
});
