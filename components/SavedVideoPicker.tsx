"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
type Video={id:string;title:string;campaign:string;src:string};
export default function SavedVideoPicker({contentItemId,children}:{contentItemId:string;children?:ReactNode}){
 const [playbackErrors,setPlaybackErrors]=useState<Record<string,string>>({});
 const router=useRouter();const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[videos,setVideos]=useState<Video[]>([]),[search,setSearch]=useState(""),[error,setError]=useState("");
 async function browse(){setOpen(true);setLoading(true);setError("");try{const r=await fetch(`/api/video/reuse?contentItemId=${encodeURIComponent(contentItemId)}`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"Could not load saved videos.");setVideos(d.videos||[]);}catch(e){setError(e instanceof Error?e.message:"Could not load videos.");}finally{setLoading(false);}}
 async function choose(assetId:string){setBusy(true);setError("");try{const r=await fetch("/api/video/reuse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contentItemId,assetId})});const d=await r.json();if(!r.ok)throw Error(d.error||"Could not reuse video.");setOpen(false);router.refresh();}catch(e){setError(e instanceof Error?e.message:"Could not reuse video.");}finally{setBusy(false);}}
 async function playbackFailed(video:Video,code?:number){
  if(code===1)return;
  setPlaybackErrors(previous=>({...previous,[video.id]:"This saved video could not be played. Checking whether its file can be downloaded…"}));
  let message="The saved file could not be checked. Download it below so we can inspect it before posting again.";
  try{
   const response=await fetch(video.src,{headers:{Range:"bytes=0-127"},cache:"no-store"});
   if(!response.ok)message=`The saved video could not be loaded (HTTP ${response.status}). This may be a storage or access problem.`;
   else{
    const reader=response.body?.getReader();
    const first=reader?await reader.read():undefined;await reader?.cancel();
    if(!first?.value?.length)message="The saved video returned no file data. It is not ready to publish.";
    else message=`The saved file is reachable, but this browser could not play it${code===3?" (decoding error)":code===4?" (unsupported or invalid video)":""}. Download it below for inspection before reposting.`;
   }
  }catch{}
  setPlaybackErrors(previous=>({...previous,[video.id]:message}));
 }
 return <section style={{margin:"16px 0"}}><div style={{display:"flex",flexWrap:"wrap",gap:12}}><button type="button" disabled={busy||loading} onClick={browse}>Choose saved video</button>{children}</div>{open&&<div className="presenter-picker"><h3>Videos already in this business</h3><p>Preview a saved video and use it for this post. Its original post stays unchanged. No new generation credits.</p><label>Search by post or campaign<input value={search} onChange={e=>setSearch(e.target.value)}/></label>{loading&&<p role="status">Loading saved videos…</p>}<div className="presenter-choices">{videos.filter(v=>`${v.title} ${v.campaign}`.toLowerCase().includes(search.toLowerCase())).map(v=><article key={v.id}><video controls playsInline preload="none" src={v.src} onError={event=>void playbackFailed(v,event.currentTarget.error?.code)} onLoadedData={()=>setPlaybackErrors(previous=>{const next={...previous};delete next[v.id];return next;})} style={{width:"100%",maxHeight:300}}/><h4>{v.title}</h4><p>{v.campaign}</p><p><a href={`${v.src}${v.src.includes("?")?"&":"?"}download=1`} download>Download this video</a></p>{playbackErrors[v.id]&&<p role="alert">{playbackErrors[v.id]}</p>}<button type="button" disabled={busy||!!playbackErrors[v.id]} onClick={()=>choose(v.id)}>{busy?"Selecting…":"Use this video for this post"}</button></article>)}</div>{!loading&&!videos.length&&<p>No saved videos found for this business.</p>}<button type="button" disabled={busy} onClick={()=>setOpen(false)}>Close saved videos</button></div>}{error&&<p role="alert">{error}</p>}</section>;
}
