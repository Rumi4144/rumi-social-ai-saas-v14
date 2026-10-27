"use client";
import {useEffect,useRef,useState} from "react";
import type {ReelSource} from "@/lib/reels/post-context";
type PhotoRequest={organizationId:string;campaignId:string;contentItemId:string;sceneId:string;sceneNumber:number;requestId:string;direction:string};
export default function ScenePhotoControls({organizationId,campaignId,contentItemId,sceneId,sceneNumber,direction,disabled,onDirection,onPhoto,onBusy}:{organizationId:string;campaignId:string;contentItemId:string;sceneId:string;sceneNumber:number;direction:string;disabled:boolean;onDirection:(value:string)=>void;onPhoto:(source:ReelSource)=>void;onBusy:(busy:boolean)=>void}){
 const key=`rumi-scene-photo:${organizationId}:${campaignId}:${contentItemId}:${sceneId}`;
 const [message,setMessage]=useState(""),[pending,setPending]=useState(false),[working,setWorking]=useState(false);
 const [review,setReview]=useState<{source:ReelSource;issues:string[]}>();
 const mounted=useRef(true);
 useEffect(()=>{mounted.current=true;try{setPending(Boolean(localStorage.getItem(key)));}catch{}return()=>{mounted.current=false;};},[key]);
 async function generate(){
  if(disabled || working)return;
  setWorking(true);onBusy(true);setMessage(pending?"Checking your previous photo request…":"Generating and reviewing this scene’s photo…");
  try {
   let request:PhotoRequest;const stored=localStorage.getItem(key);
   if(stored){request=JSON.parse(stored);if(request.organizationId!==organizationId||request.contentItemId!==contentItemId||request.sceneId!==sceneId)throw new Error("This saved photo request belongs to another scene.");}
   else {request={organizationId,campaignId,contentItemId,sceneId,sceneNumber,requestId:crypto.randomUUID(),direction:direction.trim()};localStorage.setItem(key,JSON.stringify(request));}
   setPending(true);
   const resume=()=>fetch("/api/reels/scene-photo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request),signal:AbortSignal.timeout(180000)});
   const response=await resume();
   let data=await response.json();
   if(data.status==="failed"){localStorage.removeItem(key);setPending(false);throw new Error(data.error||"The photo failed; its Rumi credit was returned.");}
   if(!response.ok){if([400,402,404,409,503].includes(response.status)){localStorage.removeItem(key);setPending(false);}throw new Error(data.error||"Could not create this scene photo.");}
   for(let attempt=0;["starting","running","continuing"].includes(data.status);attempt++){
    if(attempt>=6)break;
    await new Promise(resolve=>setTimeout(resolve,4000));if(!mounted.current)return;
    setMessage(data.error||"Reviewing the photo for this scene…");
    const status=data.status==="continuing" ? await resume() : await fetch(`/api/reels/scene-photo?contentItemId=${encodeURIComponent(contentItemId)}&requestId=${request.requestId}`,{cache:"no-store"});data=await status.json();if(!status.ok && data.status!=="failed")throw new Error(data.error||"Could not check this photo.");
   }
   if(!mounted.current)return;
   if(data.status==="succeeded" && data.source){
    if(data.needsReview){setReview({source:data.source,issues:data.review?.issues||["Please inspect this photo before using it."]});setMessage("Photo saved for your review. It has not been selected.");}
    else choose(data.source);
   }
   else if(data.status==="failed"){localStorage.removeItem(key);setPending(false);setMessage(data.error||"The photo failed; its Rumi credit was returned.");}
   else setMessage(data.error||"Your request is still processing. Check its status again; this reuses the same request.");
  }catch(error){if(mounted.current)setMessage(error instanceof Error?error.message:"Could not create the photo. Check the same request again before starting another.");}
  finally{if(mounted.current){setWorking(false);onBusy(false);}}
 }
 function choose(source:ReelSource){onPhoto({...source,reviewRequired:false});localStorage.removeItem(key);setReview(undefined);setPending(false);setMessage("AI photo selected for this scene. Preview it, then save your draft.");}
 function keepSaved(){localStorage.removeItem(key);setReview(undefined);setPending(false);setMessage("Photo kept in your past campaign photo library. You can change the scene description before trying again.");}
 return <div style={{marginBottom:16}}>
  <label htmlFor={`scene-photo-${sceneId}`}>Describe this scene’s photo<textarea id={`scene-photo-${sceneId}`} value={direction} maxLength={1200} disabled={disabled || working || pending} onChange={event=>onDirection(event.target.value)} placeholder="For example: close-up of hands beside a closed laptop, soft natural light"/></label>
  {!review && <button type="button" disabled={disabled || working || !organizationId || direction.trim().length<10} onClick={generate}>{working?"Working…":pending?"Check photo status":"Generate AI photo · 1 Rumi credit"}</button>}
  <p>Checks the photo against your post and its other scene photos. Includes at most one replacement if needed. Photos that need your review stay unselected.</p>
  {message && <p role="status">{message}</p>}
  {review && <section aria-label="Scene photo needs your review" style={{border:"1px solid #ca9c42",borderRadius:12,padding:16,background:"#fff8e8"}}>
   <strong>Photo needs your review</strong><ul>{review.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul>
   <img src={review.source.src} alt="Scene photo awaiting your review" style={{display:"block",width:"100%",maxWidth:240,maxHeight:320,objectFit:"contain",marginBottom:12}}/>
   <button type="button" disabled={disabled || working} onClick={()=>choose(review.source)}>Use this photo after review</button>{" "}
   <button type="button" disabled={disabled || working} onClick={keepSaved}>Keep saved and change description</button>
  </section>}
 </div>;
}
