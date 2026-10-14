const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
class Video{}
function load(file,cache=new Map()){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,{module,exports:module.exports,HTMLVideoElement:Video,require:n=>n.startsWith('.')?load(path.resolve(path.dirname(file),n+'.ts'),cache):require(n)});return module.exports;}
const motion=load('lib/reels/animation.ts'),draw=load('lib/reels/draw.ts');
function context(){const calls=[],stack=[];const ctx={globalAlpha:1,calls,canvas:{ownerDocument:{createElement:()=>{const child=context();return {width:1080,height:1920,getContext:()=>child,child};}}},save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();},drawImage(...args){calls.push({args,alpha:this.globalAlpha});},fillText(){},measureText:s=>({width:s.length*12}),createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}})};for(const name of ['beginPath','roundRect','fill','rect','clip','translate','clearRect','fillRect','strokeRect','moveTo','lineTo','stroke'])ctx[name]=()=>{};return ctx;}
const photo={naturalWidth:1000,naturalHeight:1600};const project={brand:'Master Mind',website:'example.com',color:'#123456',accent:'#abcdef',cta:'Learn more',style:'cinematic',closingSeconds:2,scenes:[{id:'one',src:'/one',kind:'image',seconds:4,headline:'Slow down',detail:''},{id:'two',src:'/two',kind:'image',seconds:4,headline:'Take a moment',detail:''}]};
test('contained photos stay inside their frames throughout every animation; cover photos fill their frames',()=>{
 for(const animation of ['gentle','pan','lively','none'])for(let index=0;index<6;index++)for(let i=0;i<=100;i++){
  const p=i/100,c=motion.photoMotion(animation,p,index,true),cover=motion.photoMotion(animation,p,index,false);
  assert.ok(c.zoom/2+Math.abs(c.x)<=.5);assert.ok(c.zoom/2+Math.abs(c.y)<=.5);
  assert.ok(cover.zoom/2-Math.abs(cover.x)>=.5);assert.ok(cover.zoom/2-Math.abs(cover.y)>=.5);
 }
});
test('default animation changes photo framing while disabled animation stays still',()=>{
 const start=context(),end=context();draw.drawReel(start,project,[photo,photo],1);draw.drawReel(end,project,[photo,photo],3);assert.notDeepEqual(start.calls[0].args.slice(1),end.calls[0].args.slice(1));
 const a=context(),b=context();draw.drawReel(a,{...project,animation:'none'},[photo,photo],1);draw.drawReel(b,{...project,animation:'none'},[photo,photo],3);assert.deepEqual(a.calls[0].args.slice(1),b.calls[0].args.slice(1));
});
test('scene and closing transitions composite smoothly without changing timeline duration; off cuts directly',()=>{
 const ctx=context();draw.drawReel(ctx,project,[photo,photo],4.2);const composite=ctx.calls.at(-1);assert.ok(composite.args[0].child);assert.ok(composite.alpha>0&&composite.alpha<1);assert.equal(ctx.globalAlpha,1);
 draw.drawReel(ctx,project,[photo,photo],8.2);assert.ok(ctx.calls.at(-1).args[0].child);
 const cut=context();draw.drawReel(cut,{...project,animation:'none'},[photo,photo],4.2);assert.equal(cut.calls.length,1);assert.equal(cut.calls[0].args[0],photo);
 const lively=context();draw.drawReel(lively,{...project,animation:'lively'},[photo,photo],4.2);assert.ok(lively.calls.at(-1).args[1]>0);
});
test('text entrances settle and video clips retain stable framing',()=>{
 assert.equal(motion.entrance('gentle',0).opacity,0);assert.equal(motion.entrance('gentle',1).lift,0);assert.equal(motion.entrance('none',0).opacity,1);
 const video=new Video();video.videoWidth=1000;video.videoHeight=1600;const a=context(),b=context();draw.drawReel(a,project,[video,photo],1);draw.drawReel(b,project,[video,photo],3);assert.deepEqual(a.calls[0].args.slice(1),b.calls[0].args.slice(1));
 for(const style of ['cinematic','editorial','gallery','spotlight','minimal','split'])draw.drawReel(context(),{...project,style},[photo,photo],1);
 draw.drawReel(context(),{...project,scenes:[]},[],0);
});
