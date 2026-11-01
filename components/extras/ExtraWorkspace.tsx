"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { extraOptions, presenterChoices, PRESENTER_SCRIPT_LIMIT, PRESENTER_WORD_LIMIT, type ExtraKind, type PresenterChoice } from "@/lib/extras/catalog";
import type { ExtrasResponse, ExtraSummary } from "@/lib/extras/types";
import WeeklyCard from "@/components/weekly/WeeklyCard";
import { finishWeeklyReel } from "@/components/weekly/finish-reel";
import weekly from "@/components/weekly/weekly.module.css";
import styles from "./extras.module.css";

export default function ExtraWorkspace(){
  const [data,setData]=useState<ExtrasResponse|null>(null),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [kind,setKind]=useState<ExtraKind>("ad"),[brandId,setBrandId]=useState(""),[productId,setProductId]=useState("");
  const [brief,setBrief]=useState(""),[script,setScript]=useState(""),[presenter,setPresenter]=useState<PresenterChoice>("alex");
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0);
  const controller=useRef<AbortController|null>(null),mounted=useRef(true);
  const refresh=useCallback(async()=>{const res=await fetch("/api/extras",{cache:"no-store"});const value=await res.json();if(!res.ok)throw new Error(value.error||"Could not load your creations.");if(mounted.current)setData(value);return value as ExtrasResponse;},[]);
  useEffect(()=>{mounted.current=true;void refresh().catch(e=>setError(e.message));return()=>{mounted.current=false;controller.current?.abort();};},[refresh]);
  const changed=()=>{void refresh().catch(e=>setError(e.message));};
  const brand=data?.brands.find(b=>b.id===brandId)||data?.brands[0],option=extraOptions[kind];
  const words=script.trim()?script.trim().split(/\s+/).length:0;
  const valid=(kind==="presenter"?script.trim().length>=3&&script.length<=PRESENTER_SCRIPT_LIMIT&&words<=PRESENTER_WORD_LIMIT:brief.trim().length>=3);
  const product=brand?.products.find(p=>p.id===productId);
  const unavailable=!!data&&!data.configured[kind];
  const needsPhotos=kind==="reel"&&!!product&&!product.reelAvailable;
  const insufficient=!!data&&data.availableCredits<option.credits;
  const canCreate=!!data?.canCreate&&!!brand&&valid&&!unavailable&&!needsPhotos&&!insufficient&&!busy;

  async function run(saved?:ExtraSummary){
    if(!data||!data.canManage||controller.current||(!saved&&!canCreate))return;
    const active=new AbortController();controller.current=active;setBusy(true);setError("");setProgress(0);setMessage(saved?"Resuming your saved creation…":"Preparing your creation…");
    const pause=()=>{if(document.hidden)active.abort();};document.addEventListener("visibilitychange",pause);
    let audio:AudioContext|undefined;
    try{audio=new AudioContext();await audio.resume();}catch{/* Images and presenters do not need browser audio. */}
    const request=async(url:string,body?:unknown)=>{const response=await fetch(url,{...(body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{cache:"no-store"}),signal:active.signal});const value=await response.json();if(!response.ok)throw new Error(value.error||"Could not finish this step.");return value;};
    const sleep=()=>new Promise<void>((resolve,reject)=>{if(active.signal.aborted){reject(new Error("Paused"));return;}const abort=()=>{clearTimeout(timer);reject(new Error("Paused"));};const timer=setTimeout(()=>{active.signal.removeEventListener("abort",abort);resolve();},12000);active.signal.addEventListener("abort",abort,{once:true});});
    try{
      let id=saved?.id;
      if(!id){
        const input={brandId:brand!.id,kind,brief:(kind==="presenter"?script:brief).trim(),...(kind==="presenter"?{presenter}:productId?{productId}:{})};
        const key=`rumi-extra:${data.organizationId}:${JSON.stringify(input)}`;
        const requestId=localStorage.getItem(key)||crypto.randomUUID();localStorage.setItem(key,requestId);
        const result=await request("/api/extras",{action:"create",...input,requestId,expectedCredits:option.credits});id=result.id;
        // Clear only after a confirmed parent is saved. Ambiguous requests reuse
        // the key on another click; an intentional next creation gets a new key.
        localStorage.removeItem(key);
      }
      let current:ExtraSummary=await request(`/api/extras?id=${encodeURIComponent(id!)}`);
      for(let step=0;step<100&&!current.item?.isReady;step++){
        if(active.signal.aborted)throw new Error("Paused");
        if(current.error&&current.kind!=="presenter")throw new Error(current.error);
        if(current.kind==="presenter"){
          current=await request("/api/extras",{action:"advance",id});
          if(current.error)throw new Error(current.error);
          if(current.item?.isReady)break;
          setMessage("Creating your presenter’s voice and video. Keep this tab open; you can resume later.");setProgress(40);await sleep();
        }else if(current.nextJobId){
          setMessage(current.kind==="reel"?"Preparing three scene photos and captions…":"Creating your branded design and caption…");
          await request("/api/campaigns/process",{jobId:current.nextJobId});setProgress(p=>Math.min(70,p+15));
        }else if(current.pendingJobs){setMessage("Your creation is processing. Its progress is saved.");await sleep();}
        else if(current.item?.nextAction==="finish_motion_reel"){
          if(!audio)throw new Error("Use a recent Chrome or Safari browser to finish the reel.");
          await finishWeeklyReel({item:current.item,organizationId:data.organizationId,audio,signal:active.signal,progress:(value,text)=>{setProgress(value);setMessage(text);}});
        }else throw new Error("This creation needs Admin attention. Its saved work is preserved.");
        current=await request(`/api/extras?id=${encodeURIComponent(id!)}`);
      }
      if(!current.item?.isReady)throw new Error("Your creation is still processing. Use Resume to continue this saved request.");
      setProgress(100);setMessage("Ready to review below. Approve it, then download, post or schedule.");
    }catch(e){if(mounted.current)setError(active.signal.aborted?"Paused. Your work is saved below. Resume the same creation to continue.":e instanceof Error?e.message:"Could not finish your creation.");}
    finally{document.removeEventListener("visibilitychange",pause);await audio?.close().catch(()=>{});controller.current=null;if(mounted.current){setBusy(false);void refresh().catch(e=>setError(e.message));}}
  }

  return <div className={weekly.workspace}>
    <header className={weekly.header}><div><h1>Create extra</h1><p>One extra ad, reel or presenter. Use your available Rumi credits and review it before posting.</p></div><a href="/dashboard">← This Week</a></header>
    {error&&<div role="alert" className={weekly.failure}>{error}{!data&&<button onClick={changed}>Try again</button>}</div>}
    {!data?<p role="status">Loading your credits…</p>:<>
      <section className={styles.creator} aria-label="Create an extra post">
        <div className={styles.top}><strong>{data.availableCredits} Rumi credits available</strong><a href="/billing">Plan & credits</a></div>
        {data.brands.length>1&&<label>Business<select aria-label="Business" value={brand?.id||""} disabled={busy} onChange={e=>{setBrandId(e.target.value);setProductId("");}}>{data.brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
        <div className={styles.choices} role="group" aria-label="What would you like to create?">{(Object.keys(extraOptions) as ExtraKind[]).map(key=><button key={key} aria-pressed={kind===key} disabled={busy} onClick={()=>setKind(key)}><strong>{extraOptions[key].label}</strong><span>{extraOptions[key].description}</span><b>{extraOptions[key].credits} credits</b></button>)}</div>
        {kind!=="presenter"&&!!brand?.products.length&&<label>Feature<select aria-label="Feature" value={productId} disabled={busy} onChange={e=>setProductId(e.target.value)}><option value="">My business · AI scene photos</option>{brand.products.map(p=><option key={p.id} value={p.id}>{p.name}{kind==="reel"&&!p.reelAvailable?" · needs more photos":""}</option>)}</select></label>}
        {kind==="presenter"&&<div className={styles.presenters} role="group" aria-label="Choose a presenter">{(Object.keys(presenterChoices) as PresenterChoice[]).map(key=><button key={key} aria-pressed={presenter===key} disabled={busy} onClick={()=>setPresenter(key)}><img src={presenterChoices[key].image} alt=""/><span>{presenterChoices[key].name}</span></button>)}</div>}
        <label htmlFor="extra-brief">{kind==="presenter"?"What should the presenter say?":"What would you like to promote?"}</label>
        <textarea id="extra-brief" disabled={busy} value={kind==="presenter"?script:brief} onChange={e=>kind==="presenter"?setScript(e.target.value):setBrief(e.target.value)} maxLength={kind==="presenter"?PRESENTER_SCRIPT_LIMIT:1000} rows={3} placeholder={kind==="presenter"?`Welcome to ${brand?.name || "our business"}. Discover what makes us special and find something you love.`:"For example: introduce a favourite product or service, with warm daylight and a welcoming tone."}/>
        {kind==="presenter"&&<small>{script.length}/{PRESENTER_SCRIPT_LIMIT} characters · {words}/{PRESENTER_WORD_LIMIT} words · Your exact script is spoken.</small>}
        {kind==="reel"&&<small>3 credits to prepare + 4 to finish = 7 total. Keep this tab visible while the reel finishes.</small>}
        <div className={styles.submit}><button className={styles.createButton} disabled={!canCreate} onClick={()=>void run()}>Create {kind==="ad"?"ad":kind==="reel"?"reel":"presenter"} · {option.credits} credits</button><span>Saved as a draft for your approval.</span></div>
        {(!data.canCreate||unavailable||needsPhotos||insufficient)&&<p role="status">{data.reason|| (unavailable?"This option is not available yet.":needsPhotos?"Choose a business scene, or ask Admin to add three product photos.":`You need ${option.credits} available credits. Your existing posts stay available.`)}</p>}
      </section>
      {(busy||message)&&<section className={weekly.progress} aria-live="polite"><p>{message}</p>{busy&&<><progress value={progress} max={100} aria-label="Creation progress"/><button onClick={()=>controller.current?.abort()}>Pause</button></>}</section>}
      <h2>Your extra creations</h2>
      {!data.extras.length&&<p>Your finished ads, reels and presenters will appear here.</p>}
      <div className={weekly.grid}>{data.extras.map(extra=><section key={extra.id} className={styles.saved}>
        {extra.item?<WeeklyCard item={extra.item} canManage={data.canManage} busy={busy} onChanged={changed} onFinish={()=>void run(extra)}/>:<p>{extra.title}</p>}
        {extra.error&&<p className={weekly.notice}>{extra.error}</p>}
        {!extra.item?.isReady&&data.canManage&&!["failed"].includes(extra.status)&&<button disabled={busy} onClick={()=>void run(extra)}>Resume {extraOptions[extra.kind].label.toLowerCase()}</button>}
        {extra.status==="failed"&&<p>This attempt ended. You can start a new creation above.</p>}
      </section>)}</div>
      {data.extras.length>=30&&<p>The latest 30 creations are shown. Earlier creations remain saved with this business.</p>}
    </>}
  </div>;
}
