"use client";
import {useEffect,useRef,useState} from "react";
import type {ReelSource} from "@/lib/reels/post-context";
type PhotoRequest={organizationId:string;campaignId:string;contentItemId:string;sceneId:string;sceneNumber:number;requestId:string;direction:string};
export default function ScenePhotoControls({organizationId,campaignId,contentItemId,sceneId,sceneNumber,direction,disabled,onDirection,onPhoto,onBusy}:{organizationId:string;campaignId:string;contentItemId:string;sceneId:string;sceneNumber:number;direction:string;disabled:boolean;onDirection:(value:string)=>void;onPhoto:(source:ReelSource)=>void;onBusy:(busy:boolean)=>void}){
 const key=`rumi-scene-photo:${organizationId}:${campaignId}:${contentItemId}:${sceneId}`;
 const [message,setMessage]=useState(""),[pending,setPending]=useState(false),[working,setWorking]=useState(false);
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;try{setPending(Boolean(localStorage.getItem(key)));}catch{}return()=>{mounted.current=false;};},[key]);
 async function generate(){
  if(disabled || working)return;
  setWorking(true);onBusy(true);setMessage(pending?"Checking your previous photo request…":"Generating this scene’s photo…");
  try {
   let request:PhotoRequest;const stored=localStorage.getItem(key);
   if(stored){request=JSON.parse(stored);if(request.organizationId!==organizationId||request.contentItemId!==contentItemId||request.sceneId!==sceneId)throw new Error("This saved photo request belongs to another scene.");}
   else {request={organizationId,campaignId,contentItemId,sceneId,sceneNumber,requestId:crypto.randomUUID(),direction:direction.trim()};localStorage.setItem(key,JSON.stringify(request));}
   setPending(true);
   const response=await fetch("/api/reels/scene-photo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request),signal:AbortSignal.timeout(180000)});
   let data=await response.json();
   if(data.status==="failed"){localStorage.removeItem(key);setPending(false);throw new Error(data.error||"The photo failed; its Rumi credit was returned.");}
   if(!response.ok){if([400,402,404,409,503].includes(response.status)){localStorage.removeItem(key);setPending(false);}throw new Error(data.error||"Could not create this scene photo.");}
   for(let attempt=0;data.status==="starting"||data.status==="running";attempt++){
    if(attempt>=6)break;
    await new Promise(resolve=>setTimeout(resolve,4000));if(!mounted.current)return;
    const status=await fetch(`/api/reels/scene-photo?contentItemId=${encodeURIComponent(contentItemId)}&requestId=${request.requestId}`,{cache:"no-store"});data=await status.json();if(!status.ok && data.status!=="failed")throw new Error(data.error||"Could not check this photo.");
   }
   if(!mounted.current)return;
   if(data.status==="succeeded" && data.source){onPhoto(data.source);localStorage.removeItem(key);setPending(false);setMessage("AI photo selected for this scene. Preview it, then save your draft.");}
   else if(data.status==="failed"){localStorage.removeItem(key);setPending(false);setMessage(data.error||"The photo failed; its Rumi credit was returned.");}
   else setMessage(data.error||"Your request is still processing. Check its status again; this reuses the same request.");
  }catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:"Could not create the photo. Check the same request again before starting another.");}
  finally{if(mounted.current){setWorking(false);onBusy(false);}}
 }
 return <div style={{marginBottom:16}}><label htmlFor={`scene-photo-${sceneId}`}>Describe this scene’s photo<textarea id={`scene-photo-${sceneId}`} value={direction} maxLength={1200} disabled={disabled || working || pending} onChange={event=>onDirection(event.target.value)} placeholder="For example: close-up of hands beside a closed laptop, soft natural light"/></label><button type="button" disabled={disabled || working || !organizationId || direction.trim().length<10} onClick={generate}>{working?"Working…":pending?"Check photo status":"Generate AI photo · 1 Rumi credit"}</button><p>Creates a separate photo for this scene and selects it here. Your post’s main photo stays unchanged.</p>{message && <p role="status">{message}</p>}</div>;
}
