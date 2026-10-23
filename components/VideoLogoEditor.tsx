"use client";
import {useEffect,useRef,useState} from 'react';
import {drawVideoLogo,type LogoPosition} from '@/lib/video/logo';
import {recorderMime} from '@/lib/reels/timeline';

export default function VideoLogoEditor({src}:{src:string}){
 const [logo,setLogo]=useState(''),[position,setPosition]=useState<LogoPosition>('top-right'),[size,setSize]=useState(20),[busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[message,setMessage]=useState(''),[result,setResult]=useState<{url:string;ext:string}|null>(null);
 const preview=useRef<HTMLVideoElement>(null),picture=useRef<HTMLImageElement>(null),canvas=useRef<HTMLCanvasElement>(null),abort=useRef<AbortController|null>(null),owned=useRef(new Set<string>());
 function url(blob:Blob){const value=URL.createObjectURL(blob);owned.current.add(value);return value;}
 function clearResult(){setResult(old=>{if(old){URL.revokeObjectURL(old.url);owned.current.delete(old.url);}return null;});}
 useEffect(()=>()=>{abort.current?.abort();owned.current.forEach(value=>URL.revokeObjectURL(value));},[]);
 useEffect(()=>{clearResult();},[src,logo,position,size]);
 useEffect(()=>{if(!logo)return;let frame=0;const draw=()=>{const video=preview.current,img=picture.current,c=canvas.current;if(video&&c&&video.readyState>=2&&video.videoWidth){if(c.width!==video.videoWidth){c.width=video.videoWidth;c.height=video.videoHeight;}const ctx=c.getContext('2d');if(ctx){ctx.drawImage(video,0,0,c.width,c.height);if(img?.complete&&img.naturalWidth)drawVideoLogo(ctx,img,c.width,c.height,position,size);}}frame=requestAnimationFrame(draw);};frame=requestAnimationFrame(draw);return()=>cancelAnimationFrame(frame);},[src,logo,position,size]);
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
   const output=document.createElement('canvas');output.width=recording.videoWidth;output.height=recording.videoHeight;const ctx=output.getContext('2d');if(!ctx||!output.captureStream)throw new Error('Video export unavailable in this browser.');
   ctx.drawImage(recording,0,0,output.width,output.height);drawVideoLogo(ctx,img,output.width,output.height,position,size);
   const destination=context.createMediaStreamDestination();source=context.createMediaElementSource(recording);source.connect(destination);
   stream=output.captureStream(30);destination.stream.getAudioTracks().forEach(track=>stream!.addTrack(track));
   recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000,audioBitsPerSecond:128000});const parts:Blob[]=[];
   const blob=await new Promise<Blob>((resolve,reject)=>{
    let frame=0,finished=false;const timeout=setTimeout(()=>finish(new Error('Export timed out. Keep this tab visible and try again.')),Math.max(60000,recording.duration*2000+15000));
    const cleanup=()=>{clearTimeout(timeout);cancelAnimationFrame(frame);recording.onended=null;recording.onerror=null;controller.signal.removeEventListener('abort',cancel);};
    const finish=(error?:Error)=>{if(finished)return;finished=true;cleanup();if(error){if(recorder?.state==='recording')recorder.stop();reject(error);}else if(recorder?.state==='recording')recorder.stop();};const cancel=()=>finish(new Error('Export cancelled.'));
    controller.signal.addEventListener('abort',cancel,{once:true});recorder!.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};recorder!.onerror=()=>finish(new Error('Video export failed.'));recorder!.onstop=()=>{cleanup();resolve(new Blob(parts,{type:mime.split(';')[0]}));};
    const draw=()=>{try{ctx.drawImage(recording,0,0,output.width,output.height);drawVideoLogo(ctx,img,output.width,output.height,position,size);setProgress(Math.min(99,Math.floor(recording.currentTime/recording.duration*100)));frame=requestAnimationFrame(draw);}catch{finish(new Error('Could not render this video.'));}};
    recording.onended=()=>finish();recording.onerror=()=>finish(new Error('Video playback failed during export.'));preview.current?.pause();try{recorder!.start(250);void recording.play().then(draw).catch(()=>finish(new Error('Playback could not start. Try exporting again.')));}catch{finish(new Error('Recording could not start. Try Chrome or Safari.'));}
   });
   if(controller.signal.aborted)throw new Error('Export cancelled.');if(!blob.size)throw new Error('The exported video was empty. Try again.');
   setResult({url:url(blob),ext:blob.type==='video/mp4'?'mp4':'webm'});setProgress(100);setMessage('Your video with logo is ready to download.');
  }catch(error){setMessage(error instanceof Error?error.message:'Export failed.');}finally{if(recorder?.state==='recording')recorder.stop();recording.pause();recording.removeAttribute('src');recording.load();source?.disconnect();stream?.getTracks().forEach(track=>track.stop());if(context)await context.close().catch(()=>{});setBusy(false);}
 }
 return <details style={{marginTop:16}}><summary>Add your business logo</summary><p>Add your logo without another AI generation charge. A transparent PNG works best.</p><fieldset disabled={busy} style={{border:0,padding:0,display:'grid',gap:12}}><label>Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>5000000||!['image/png','image/jpeg','image/webp'].includes(file.type)){setMessage('Choose a PNG, JPEG or WebP logo under 5 MB.');return;}if(logo){URL.revokeObjectURL(logo);owned.current.delete(logo);}setLogo(url(file));setMessage('');}}/></label>{logo&&<><img ref={picture} src={logo} alt="Selected business logo" onError={()=>setMessage('This logo could not be read. Choose another image.')} style={{maxWidth:120,maxHeight:80,objectFit:'contain'}}/><label>Logo position<select value={position} onChange={e=>setPosition(e.target.value as LogoPosition)}><option value="top-right">Top right</option><option value="top-left">Top left</option><option value="bottom-right">Bottom right</option><option value="bottom-left">Bottom left</option></select></label><label>Logo size · {size}%<input type="range" min={10} max={35} value={size} onChange={e=>setSize(Number(e.target.value))}/></label><video ref={preview} crossOrigin="anonymous" src={src} controls playsInline preload="auto" style={{maxWidth:320,width:'100%'}}/><canvas ref={canvas} aria-label="Video preview with business logo" style={{width:'100%',maxWidth:320}}/><p>The canvas shows logo placement. Use the video controls to preview motion.</p><button type="button" onClick={exportVideo}>Export video with logo</button><button type="button" onClick={()=>setLogo('')}>Remove logo</button></>}</fieldset>{busy&&<><progress aria-label="Logo video export progress" value={progress} max={100}/><button type="button" onClick={()=>abort.current?.abort()}>Cancel export</button></>}{message&&<p role="status">{message}</p>}{result&&<><video controls playsInline src={result.url} style={{width:'100%',maxWidth:320}}/><p><a href={result.url} download={`rumi-video-with-logo.${result.ext}`}>Download video with logo ({result.ext.toUpperCase()})</a></p><p>This is a separate download. Your saved campaign video stays unchanged until you upload the new copy.</p></>}</details>;
}
