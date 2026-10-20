"use client";
import { useEffect, useState } from "react";
type Delivery = {id:string;platform:string;status:string;scheduledFor:string;publishedAt:string|null;lastError:string|null;socialConnection:{accountName:string|null}};
export default function PostDeliveryStatus({contentItemId,refreshKey=0}:{contentItemId:string;refreshKey?:number}) {
  const [jobs,setJobs]=useState<Delivery[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    const controller=new AbortController();setJobs([]);
    async function check(){
      try {
        if(document.hidden){timer=setTimeout(check,30000);return;}
        const response=await fetch(`/api/publishing/status?contentItemId=${encodeURIComponent(contentItemId)}`,{cache:"no-store",signal:controller.signal});
        if(!response.ok)throw new Error("Could not refresh delivery status. Check Publishing for the latest result.");
        const data=await response.json();if(stopped)return;setJobs(data.jobs||[]);setError("");
      }catch(e){if(!stopped)setError(e instanceof Error?e.message:"Could not refresh delivery status.");}
      if(!stopped)timer=setTimeout(check,30000);
    }
    void check();return()=>{stopped=true;clearTimeout(timer);controller.abort();};
  },[contentItemId,refreshKey]);
  return <div aria-live="polite">{jobs.map(job=><p key={job.id}><strong>{job.platform}{job.socialConnection?.accountName?` · ${job.socialConnection.accountName}`:""}: </strong>{job.status==="published"?"Posted":job.status==="processing"?"Facebook processing · playback not yet confirmed":job.status==="verification_pending"?"Playback status unavailable":job.status==="publishing"?"Posting…":job.status==="retry"?(job.platform==="tiktok"&&job.lastError?.includes("processing")?"TikTok processing":"Waiting to retry"):job.status==="failed"?"Posting failed":job.status==="scheduled"?`Scheduled · ${new Date(job.scheduledFor).toLocaleString()}`:job.status}{job.status==="published"&&job.publishedAt?` · ${new Date(job.publishedAt).toLocaleString()}`:""}{["failed","verification_pending"].includes(job.status)&&job.lastError?` · ${job.lastError}`:""}</p>)}{error&&<p>{error}</p>}</div>;
}
