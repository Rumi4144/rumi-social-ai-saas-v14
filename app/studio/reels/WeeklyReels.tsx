"use client";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { makeWeek, type WeekDay } from "@/lib/reels/week";
import { exportReel } from "@/lib/reels/export";
import { reelDuration, type ReelProject, type ReelStyle } from "@/lib/reels/timeline";
export default function WeeklyReels({project,campaignId,organizationId,music,originalAudio,musicFile,voiceFile}:{project:ReelProject;campaignId:string;organizationId:string;music:boolean;originalAudio:boolean;musicFile?:File;voiceFile?:File}){
 const [start,setStart]=useState(()=>new Date().toLocaleDateString("en-CA",{timeZone:"America/New_York"})),[days,setDays]=useState<WeekDay[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[progress,setProgress]=useState(0);
 const requestId=useRef(""),controller=useRef<AbortController | undefined>(undefined),urls=useRef<string[]>([]),snapshot=useRef<WeekDay[]>([]);
 useEffect(()=>()=>{controller.current?.abort();urls.current.forEach(URL.revokeObjectURL);},[]);
 function plan(){try{const next=makeWeek(project,start);setDays(next);snapshot.current=next;requestId.current=crypto.randomUUID();setMessage("Seven drafts planned. Edit their captions, then create and save the reels. Dates are suggestions; nothing is scheduled yet.");}catch(e){setMessage((e as Error).message);}}
 function edit(index:number,patch:Partial<WeekDay>){setDays(old=>{const next=old.map((day,i)=>i===index?{...day,...patch}:day);snapshot.current=next;return next;});}
 async function run(){
  setBusy(true);setProgress(0);controller.current=new AbortController();let audio:AudioContext|undefined;
  const hidden=()=>{if(document.hidden)controller.current?.abort();};document.addEventListener("visibilitychange",hidden);
  try{
   audio=new AudioContext();await audio.resume();let work=[...snapshot.current];
   if(!work.every(day=>day.contentItemId)){
    const response=await fetch("/api/reels/week",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:requestId.current,campaignId,startDate:start,days:work.map(day=>({headline:day.headline,caption:day.caption}))}),signal:controller.current.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not create drafts.");
    work=work.map((day,i)=>({...day,contentItemId:data.days[i].contentItemId}));snapshot.current=work;setDays(work);
   }
   for(let i=0;i<work.length;i++){
    if(controller.current.signal.aborted)throw new Error("Batch paused. Completed reels are saved; resume to finish the remaining days.");
    if(work[i].assetId)continue;const day=work[i];setMessage(`Creating ${day.label} (${i+1} of 7). Keep this tab visible.`);
    // Check a previously completed upload before recording again.
    if(day.pathname){const response=await fetch(`/api/reels/upload?pathname=${encodeURIComponent(day.pathname)}`);const data=response.ok?await response.json():{};if(data.assetId){work[i]={...day,assetId:data.assetId};snapshot.current=[...work];setDays([...work]);continue;}}
    const canvas=document.createElement("canvas");canvas.width=1080;canvas.height=1920;
    const dayProject={...day.project,scenes:day.project.scenes.map((scene,j)=>j===0?{...scene,headline:day.headline}:scene)};
    const blob=await exportReel({project:dayProject,canvas,audioContext:audio,audioFile:musicFile,voiceFile,music,originalAudio,signal:controller.current.signal,progress:value=>setProgress(Math.round((i*100+value)/7))});
    const ext=blob.type==="video/mp4"?"mp4":"webm",downloadUrl=URL.createObjectURL(blob);urls.current.push(downloadUrl);
    const pathname=day.pathname||`reels/${organizationId}/${day.contentItemId}/${crypto.randomUUID()}.${ext}`;
    work[i]={...day,downloadUrl,pathname};snapshot.current=[...work];setDays([...work]);
    await upload(pathname,blob,{access:"private",contentType:blob.type,multipart:true,handleUploadUrl:"/api/reels/upload",clientPayload:JSON.stringify({campaignId,contentItemId:day.contentItemId,title:day.headline,duration:reelDuration(dayProject)})});
    let assetId="";for(let attempt=0;attempt<20;attempt++){const response=await fetch(`/api/reels/upload?pathname=${encodeURIComponent(pathname)}`);const data=response.ok?await response.json():{};if(data.assetId){assetId=data.assetId;break;}await new Promise(resolve=>setTimeout(resolve,1000));}
    if(!assetId)throw new Error("Upload completed; the library is still updating. Resume shortly to check it and finish the remaining days.");
    work[i]={...work[i],assetId};snapshot.current=[...work];setDays([...work]);
   }
   setProgress(100);setMessage("All seven reels are saved as campaign drafts. Review each video and select it in the campaign before scheduling.");
  }catch(e){setMessage(controller.current?.signal.aborted?"Batch paused. Resume to finish the remaining days; completed drafts remain saved.":(e as Error).message);}finally{document.removeEventListener("visibilitychange",hidden);await audio?.close();controller.current=undefined;setBusy(false);}
 }
 return <section className="card" style={{marginTop:24}}><h2>Create a week of reels</h2><p>Seven varied drafts using the scenes above, with rotating layouts, captions, your sound choices and branded endings. No AI generation credits. Review before scheduling.</p><label>First day<input type="date" value={start} disabled={busy||days.some(day=>day.contentItemId)} onChange={event=>setStart(event.target.value)}/></label><button disabled={busy||!project.scenes.length||days.some(day=>day.contentItemId)} onClick={plan}>Plan seven days</button>
 {days.map((day,i)=><details key={day.date}><summary>{day.label} · {day.date} · {day.assetId?"Saved":day.headline}</summary><fieldset disabled={busy||!!day.contentItemId} style={{border:0}}><label>Daily headline<input value={day.headline} maxLength={120} onChange={event=>edit(i,{headline:event.target.value})}/></label><label>Daily caption<textarea value={day.caption} maxLength={2000} onChange={event=>edit(i,{caption:event.target.value})}/></label><label>Daily layout<select value={day.project.style} onChange={event=>edit(i,{project:{...day.project,style:event.target.value as ReelStyle}})}><option value="cinematic">Cinematic</option><option value="editorial">Photo collage</option><option value="gallery">Gallery</option></select></label></fieldset>{day.downloadUrl&&<><video controls playsInline src={day.downloadUrl} style={{maxWidth:220,width:"100%"}}/><a href={day.downloadUrl} download={`${day.date}-reel.${day.pathname?.endsWith(".mp4")?"mp4":"webm"}`}>Download {day.label}</a></>}</details>)}
 {!!days.length&&<button disabled={busy||days.every(day=>day.assetId)||days.some(day=>!day.headline.trim())} onClick={run}>{days.some(day=>day.contentItemId)?"Resume remaining reels":"Create and save seven reels"}</button>}{busy&&<><progress max={100} value={progress} aria-label="Weekly reel progress"/><button onClick={()=>controller.current?.abort()}>Pause batch</button></>}<p role="status">{message}</p>{days.some(day=>day.contentItemId)&&<a href={`/campaigns/${campaignId}`}>Review weekly campaign drafts</a>}
 </section>;
}
