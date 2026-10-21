const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const moduleShim={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../lib/video/mp4.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleShim,exports:moduleShim.exports});
const {assertMp4Video}=moduleShim.exports;
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const box=(type,...parts)=>{const body=Buffer.concat(parts);return Buffer.concat([u32(body.length+8),Buffer.from(type),body]);};
const track=(handler,id,count)=>box('trak',box('tkhd',Buffer.alloc(12),u32(id)),box('mdia',box('hdlr',Buffer.alloc(8),Buffer.from(handler)),box('minf',box('stbl',box('stsz',Buffer.alloc(8),u32(count))))));
const mp4=(tracks,fragments=[])=>Buffer.concat([box('ftyp',Buffer.from('isom0000')),box('moov',...tracks),...fragments,box('mdat',Buffer.from([1,2,3,4]))]);
test('audio in an MP4 container is rejected even with media payload and positive duration metadata',()=>{
 assert.throws(()=>assertMp4Video(mp4([track('soun',2,400)])),/audio only/);
 assert.doesNotThrow(()=>assertMp4Video(mp4([track('soun',2,400),track('vide',1,450)])));
});
test('fragment samples must belong to the video track, not just the soundtrack',()=>{
 const fragment=id=>box('moof',box('traf',box('tfhd',Buffer.alloc(4),u32(id)),box('trun',Buffer.alloc(4),u32(30))));
 assert.throws(()=>assertMp4Video(mp4([track('vide',1,0),track('soun',2,0)],[fragment(2)])),/no complete recorded video/);
 assert.doesNotThrow(()=>assertMp4Video(mp4([track('vide',1,0),track('soun',2,0)],[fragment(1),fragment(2)])));
});
test('empty, truncated and oversized MP4 boxes cannot pass or loop forever',()=>{
 for(const data of [Buffer.alloc(0),Buffer.from('not an mp4'),Buffer.concat([u32(10000),Buffer.from('moov')]),Buffer.concat([u32(1),Buffer.from('moov'),u32(0xffffffff),u32(0xffffffff)]),box('ftyp',Buffer.from('isom0000')),mp4([track('vide',1,0)])])assert.throws(()=>assertMp4Video(data));
});
