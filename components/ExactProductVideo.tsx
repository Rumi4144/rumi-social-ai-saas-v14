"use client";
import {useEffect,useRef,useState} from 'react';
import {drawExactProduct} from '@/lib/video/product-layout';
import {recorderMime} from '@/lib/reels/timeline';

export default function ExactProductVideo({src,productSrc=""}:{src:string;productSrc?:string}){
 const [logo,setLogo]=useState(productSrc),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[message,setMessage]=useState(''),[result,setResult]=useState<{url:string;ext:string}|null>(null);
 const preview=useRef<HTMLVideoElement>(null),picture=useRef<HTMLImageElement>(null),canvas=useRef<HTMLCanvasElement>(null),abort=useRef<AbortController|null>(null),owned=useRef(new Set<string>());
 function url(blob:Blob){const value=URL.createObjectURL(blob);owned.current.add(value);return value;}
 function clearResult(){setResult(old=>{if(old){URL.revokeObjectURL(old.url);owned.current.delete(old.url);}return null;});}
 useEffect(()=>()=>{abort.current?.abort();owned.current.forEach(value=>URL.revokeObjectURL(value));},[]);
 useEffect(()=>{clearResult();},[src,logo]);
 useEffect(()=>{if(!logo)return;let frame=0;const draw=()=>{const video=preview.current,img=picture.current,c=canvas.current;if(video&&c&&video.readyState>=2&&video.videoWidth){if(c.width!==1080){c.width=1080;c.height=1350;}const ctx=c.getContext('2d');if(ctx){if(img?.complete&&img.naturalWidth)drawExactProduct(ctx,video,img);}}frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);},[src,logo]);
 async function exportVideo(){
  const img=picture.current;if(!img?.naturalWidth)return;
  if(!window.MediaRecorder){setMessage('Please use a recent Chrome or Safari browser to export.');return;}
  const mime=recorderMime(type=>MediaRecorder.isTypeSupported(type));if(!mime){setMessage('This browser cannot export video. Try Chrome or Safari.');return;}
  const controller=new AbortController();abort.current=controller;setBusy(true);setProgress(0);setMessage('Keep this tab visible while the video exports.');clearResult();
  let context:AudioContext|undefined,stream:MediaStream|undefined,recorder:MediaRecorder|undefined,source:MediaElementAudioSourceNode|undefined;
  const recording=document.createElement('video');recording.crossOrigin='anonymous';recording.playsInline=true;recording.preload='auto';
  try{
   context=new AudioContext();await context.resume();
   await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>finish(new Error('Video loading timed out. Try again.')),30000);const finish=(error?:Error)=>{clearTimeout(timeout);recording.onloadeddata=null;recording.onerror=null;controller.signal.removeEventListener('abort',cancel);error?reject(error):resolve();};const cancel=()=>finish(new Error('Export cancelled.'));controller.signal.addEventListener('abort',cancel,{once:true});recording.onloadeddata=()=>finish();recording.onerror=()=>finish(new Error('Could not load the video for export.'));recording.src=src;recording.load();});
   if(controller.signal.aborted)throw new Error('Export cancelled.');
   if(!Number.isFinite(recording.duration)||recording.duration<=0)throw new Error('Video duration is unavailable. Please reload the video.');
   const output=document.createElement('canvas');output.width=1080;output.height=1350;const ctx=output.getContext('2d');if(!ctx||!output.captureStream)throw new Error('Video export unavailable in this browser.');
   drawExactProduct(ctx,recording,img);
   const destination=context.createMediaStreamDestination();source=context.createMediaElementSource(recording);source.connect(destination);
   stream=output.captureStream(30);destination.stream.getAudioTracks().forEach(track=>stream!.addTrack(track));
   recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000,audioBitsPerSecond:128000});const parts:Blob[]=[];
   const blob=await new Promise<Blob>((resolve,reject)=>{
    let frame=0,finished=false;const timeout=setTimeout(()=>finish(new Error('Export timed out. Keep this tab visible and try again.')),Math.max(60000,recording.duration*2000+15000));
    const cleanup=()=>{clearTimeout(timeout);cancelAnimationFrame(frame);recording.onended=null;recording.onerror=null;controller.signal.removeEventListener('abort',cancel);};
    const finish=(error?:Error)=>{if(finished)return;finished=true;cleanup();if(error){if(recorder?.state==='recording')recorder.stop();reject(error);}else if(recorder?.state==='recording')recorder.stop();};const cancel=()=>finish(new Error('Export cancelled.'));
    controller.signal.addEventListener('abort',cancel,{once:true});recorder!.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};recorder!.onerror=()=>finish(new Error('Video export failed.'));recorder!.onstop=()=>{cleanup();resolve(new Blob(parts,{type:mime.split(';')[0]}));};
    const draw=()=>{try{drawExactProduct(ctx,recording,img);setProgress(Math.min(99,Math.floor(recording.currentTime/recording.duration*100)));frame=requestAnimationFrame(draw);}catch{finish(new Error('Could not render this video.'));}};
    recording.onended=()=>finish();recording.onerror=()=>finish(new Error('Video playback failed during export.'));preview.current?.pause();try{recorder!.start(250);void recording.play().then(draw).catch(()=>finish(new Error('Playback could not start. Try exporting again.')));}catch{finish(new Error('Recording could not start. Try Chrome or Safari.'));}
   });
   if(controller.signal.aborted)throw new Error('Export cancelled.');if(!blob.size)throw new Error('The exported video was empty. Try again.');
   setResult({url:url(blob),ext:blob.type==='video/mp4'?'mp4':'webm'});setProgress(100);setMessage('Your presenter and original product photo are ready in one video.');
  }catch(error){setMessage(error instanceof Error?error.message:'Export failed.');}finally{if(recorder?.state==='recording')recorder.stop();recording.pause();recording.removeAttribute('src');recording.load();source?.disconnect();stream?.getTracks().forEach(track=>track.stop());if(context)await context.close().catch(()=>{});setBusy(false);}
 }
 return <details open={Boolean(productSrc)} style={{marginTop:16}}><summary>Presenter beside my exact product photo</summary><p>Keep your actual guitar unchanged. We place its original photo beside the talking presenter and keep the voice. No image generation charge.</p><fieldset disabled={busy} style={{border:0,padding:0,display:'grid',gap:12}}><label>Original product photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>10000000||!['image/png','image/jpeg','image/webp'].includes(file.type)){setMessage('Choose a PNG, JPEG or WebP photo under 10 MB.');return;}if(owned.current.has(logo)){URL.revokeObjectURL(logo);owned.current.delete(logo);}setLogo(url(file));setMessage('');}}/></label>{logo&&<><img ref={picture} src={logo} alt="Original product photo" onError={()=>setMessage('This product photo could not be read. Choose the original photo again.')} style={{maxWidth:160,maxHeight:180,objectFit:'contain'}}/><video ref={preview} crossOrigin="anonymous" src={src} controls playsInline preload="auto" style={{maxWidth:240,width:'100%'}}/><canvas ref={canvas} aria-label="Presenter beside exact product preview" style={{width:'100%',maxWidth:420}}/><button type="button" onClick={exportVideo}>Create video beside my exact product</button></>}</fieldset>{busy&&<><progress aria-label="Product video export progress" value={progress} max={100}/><button type="button" onClick={()=>abort.current?.abort()}>Cancel export</button></>}{message&&<p role="status">{message}</p>}{result&&<><video controls playsInline src={result.url} style={{width:'100%',maxWidth:420}}/><p><a href={result.url} download={`presenter-and-exact-product.${result.ext}`}>Download finished product video ({result.ext.toUpperCase()})</a></p><p>This is a separate finished copy. Your saved campaign video remains unchanged. Nothing is published automatically.</p></>}</details>;
}
