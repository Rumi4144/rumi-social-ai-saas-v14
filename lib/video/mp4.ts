type Box={type:string;start:number;end:number;payload:number};
const u32=(b:Uint8Array,p:number)=>b[p]*16777216+b[p+1]*65536+b[p+2]*256+b[p+3];
const tag=(b:Uint8Array,p:number)=>String.fromCharCode(...b.subarray(p,p+4));
const invalid=()=>new Error('This MP4 has no complete recorded video. Export the reel again from its photos before saving or posting.');
/** Read a finite movie-header duration when the encoder provides one. */
export function mp4Duration(bytes:Uint8Array):number|undefined{
 try{
  const moov=boxes(bytes,0,bytes.length).find(box=>box.type==='moov');if(!moov)return;
  const header=boxes(bytes,moov.payload,moov.end).find(box=>box.type==='mvhd');if(!header)return;
  const v1=bytes[header.payload]===1,scaleOffset=header.payload+(v1?20:12),durationOffset=scaleOffset+4;
  if(durationOffset+(v1?8:4)>header.end)return;
  const scale=u32(bytes,scaleOffset),duration=v1?u32(bytes,durationOffset)*4294967296+u32(bytes,durationOffset+4):u32(bytes,durationOffset);
  const seconds=duration/scale;return Number.isFinite(seconds)&&seconds>0&&seconds<=3600?seconds:undefined;
 }catch{return undefined;}
}
function boxes(bytes:Uint8Array,start:number,end:number):Box[]{
 const result:Box[]=[];
 for(let p=start;p<end;){
  if(end-p<8)throw invalid();
  let size=u32(bytes,p),header=8;
  if(size===1){if(end-p<16)throw invalid();size=u32(bytes,p+8)*4294967296+u32(bytes,p+12);header=16;}
  else if(size===0)size=end-p;
  if(!Number.isSafeInteger(size)||size<header||p+size>end)throw invalid();
  result.push({type:tag(bytes,p+4),start:p,end:p+size,payload:p+header});p+=size;
 }
 return result;
}
/** An MP4 filename/MIME can contain audio alone. Require video samples, not just ftyp. */
export function assertMp4Video(bytes:Uint8Array):void{
 const top=boxes(bytes,0,bytes.length),moov=top.find(b=>b.type==='moov');
 if(!top.some(b=>b.type==='ftyp')||!moov||!top.some(b=>b.type==='mdat'&&b.end>b.payload))throw invalid();
 const children=(box:Box)=>boxes(bytes,box.payload,box.end);
 const tracks=children(moov).filter(b=>b.type==='trak');
 let hasVideo=false,hasSamples=false;const videoIds=new Set<number>();
 for(const track of tracks){
  const parts=children(track),mdia=parts.find(b=>b.type==='mdia');if(!mdia)continue;
  const media=children(mdia),handler=media.find(b=>b.type==='hdlr');
  if(!handler||handler.end-handler.payload<12||tag(bytes,handler.payload+8)!=='vide')continue;
  hasVideo=true;
  const tkhd=parts.find(b=>b.type==='tkhd');
  if(tkhd){const offset=bytes[tkhd.payload]===1?20:12;if(tkhd.payload+offset+4<=tkhd.end)videoIds.add(u32(bytes,tkhd.payload+offset));}
  const minf=media.find(b=>b.type==='minf'),stbl=minf&&children(minf).find(b=>b.type==='stbl');
  if(stbl)for(const sample of children(stbl))if(['stsz','stz2'].includes(sample.type)&&sample.end-sample.payload>=12&&u32(bytes,sample.payload+8)>0)hasSamples=true;
 }
 if(!hasVideo)throw new Error('This MP4 contains audio only, with no video track. Export the reel again from its photos before saving or posting.');
 // MediaRecorder commonly writes fragmented MP4s with samples in moof/traf/trun.
 for(const fragment of top.filter(b=>b.type==='moof'))for(const traf of children(fragment).filter(b=>b.type==='traf')){
  const parts=children(traf),tfhd=parts.find(b=>b.type==='tfhd');
  if(!tfhd||tfhd.end-tfhd.payload<8||!videoIds.has(u32(bytes,tfhd.payload+4)))continue;
  if(parts.some(b=>b.type==='trun'&&b.end-b.payload>=8&&u32(bytes,b.payload+4)>0))hasSamples=true;
 }
 if(!hasSamples)throw invalid();
}
