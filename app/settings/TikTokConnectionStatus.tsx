"use client";
import {useEffect,useState} from "react";
export default function TikTokConnectionStatus({connectionId}:{connectionId:string}){
 const [message,setMessage]=useState("Checking video-posting permission…");
 useEffect(()=>{const controller=new AbortController();fetch(`/api/social/tiktok/creator?connectionId=${encodeURIComponent(connectionId)}`,{cache:"no-store",signal:controller.signal}).then(async response=>{const data=await response.json();if(controller.signal.aborted)return;setMessage(response.ok?(data.publicPostingApproved?"Video posting is available. Review the settings when you post a reel.":"Private test posting is available. Public posting still needs TikTok approval."):(data.error||"Could not check TikTok posting permission."));}).catch(()=>{if(!controller.signal.aborted)setMessage("Could not check TikTok posting permission.");});return()=>controller.abort();},[connectionId]);
 return <><p role="status">{message}</p><a className="button" href="/api/social/tiktok/connect">Reconnect TikTok for posting</a></>;
}
