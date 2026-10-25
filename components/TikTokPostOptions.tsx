"use client";
import {useEffect,useState} from "react";
import {TikTokOptions,type TikTokPostOptions as Options,type TikTokCreator,validateTikTokOptions} from "@/lib/tiktok/options";
const privacyLabels:Record<string,string>={PUBLIC_TO_EVERYONE:"Everyone",MUTUAL_FOLLOW_FRIENDS:"Friends",FOLLOWER_OF_CREATOR:"Followers",SELF_ONLY:"Only me"};
type Draft=Omit<Options,"consent"|"privacy">&{consent:boolean;privacy:string};
const empty:Draft={title:"",privacy:"",allowComment:false,allowDuet:false,allowStitch:false,commercial:false,ownBrand:false,brandedContent:false,aiGenerated:false,consent:false};
export default function TikTokPostOptions({connectionId,contentItemId,assetId,disabled,onChange,sandbox=false,accountId}:{connectionId:string;contentItemId:string;assetId?:string;accountId?:string;sandbox?:boolean;disabled:boolean;onChange:(options:Options|null)=>void}){
 const [info,setInfo]=useState<{creator:TikTokCreator;post:{title:string;duration:number;videoUrl:string};publicPostingApproved:boolean}>();
 const [value,setValue]=useState<Draft>(empty),[error,setError]=useState("");
 useEffect(()=>{
  const controller=new AbortController();setInfo(undefined);setValue(empty);setError("");onChange(null);
  fetch(`/api/social/${sandbox?"tiktok-test":"tiktok"}/creator?connectionId=${encodeURIComponent(connectionId)}&contentItemId=${encodeURIComponent(contentItemId)}${assetId?`&assetId=${encodeURIComponent(assetId)}`:""}${sandbox?`&accountId=${encodeURIComponent(accountId||"")}`:""}`,{cache:"no-store",signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Could not load TikTok options.");if(controller.signal.aborted)return;setInfo(data);setValue({...empty,title:data.post.title});}).catch(error=>{if(!controller.signal.aborted)setError(error.message);});
  return()=>controller.abort();
 },[connectionId,contentItemId,assetId,onChange,sandbox,accountId]);
 useEffect(()=>{
  const parsed=TikTokOptions.safeParse(value);
  if(!info||!parsed.success){onChange(null);return;}
  try{validateTikTokOptions(parsed.data,info.creator,info.post.duration);onChange(parsed.data);}catch{onChange(null);}
 },[value,info,onChange]);
 const change=(update:Partial<Draft>)=>setValue(old=>({...old,...update,consent:false}));
 if(error)return <section aria-label="TikTok posting settings"><p role="alert">{error}</p><p>Your post stays here. You can deselect TikTok and continue with another account, or download the video and upload it in TikTok.</p><a href={sandbox?"/settings/tiktok-test":"/settings"} target="_blank" rel="noopener noreferrer">Check TikTok setup in a new tab</a></section>;
 if(!info)return <p role="status">Checking TikTok posting options…</p>;
 const creator=info.creator;
 const tooLong=info.post.duration>creator.max_video_post_duration_sec;
 return <section aria-label="TikTok posting settings" style={{marginTop:16}}><h3>Post to TikTok · {creator.creator_nickname}</h3>
  <video controls playsInline preload="metadata" src={info.post.videoUrl} style={{width:"100%",maxWidth:300}}/>
  {!info.publicPostingApproved&&<p>Private test posts only. Public posting is waiting for TikTok approval.</p>}
  {tooLong&&<p role="alert">This reel is {info.post.duration} seconds. This TikTok account allows up to {creator.max_video_post_duration_sec} seconds. Export a shorter reel.</p>}
  <fieldset disabled={disabled||tooLong} style={{border:0,padding:0}}>
   <label>TikTok caption<textarea value={value.title} onChange={event=>change({title:event.target.value})} maxLength={2200} rows={4}/></label><p>{value.title.length}/2200 characters</p>
   <label>Who can watch<select value={value.privacy} onChange={event=>change({privacy:event.target.value})}><option value="" disabled>Choose visibility</option>{creator.privacy_level_options.map(option=><option key={option} value={option} disabled={value.brandedContent&&option==="SELF_ONLY"}>{privacyLabels[option]||option}</option>)}</select></label>
   <label><input type="checkbox" checked={value.allowComment} disabled={creator.comment_disabled} onChange={event=>change({allowComment:event.target.checked})}/> Allow comments{creator.comment_disabled?" · disabled in TikTok settings":""}</label>
   <label><input type="checkbox" checked={value.allowDuet} disabled={creator.duet_disabled} onChange={event=>change({allowDuet:event.target.checked})}/> Allow Duet{creator.duet_disabled?" · disabled in TikTok settings":""}</label>
   <label><input type="checkbox" checked={value.allowStitch} disabled={creator.stitch_disabled} onChange={event=>change({allowStitch:event.target.checked})}/> Allow Stitch{creator.stitch_disabled?" · disabled in TikTok settings":""}</label>
   <label><input type="checkbox" checked={value.aiGenerated} onChange={event=>change({aiGenerated:event.target.checked})}/> Label as AI-generated content</label>
   <label><input type="checkbox" checked={value.commercial} onChange={event=>change({commercial:event.target.checked,ownBrand:false,brandedContent:false})}/> This content promotes a business, product or service</label>
   {value.commercial&&<><label><input type="checkbox" checked={value.ownBrand} onChange={event=>change({ownBrand:event.target.checked})}/> Your brand · promoting your own business</label><label><input type="checkbox" checked={value.brandedContent} disabled={value.privacy==="SELF_ONLY"} onChange={event=>change({brandedContent:event.target.checked})}/> Branded content · a paid partnership with a third party</label>{value.privacy==="SELF_ONLY"&&<p>Paid partnership visibility cannot be private.</p>}{!value.ownBrand&&!value.brandedContent&&<p>Choose your brand, branded content, or both to continue.</p>}{(value.ownBrand||value.brandedContent)&&<p>Your video will be labeled “{value.brandedContent?"Paid partnership":"Promotional content"}”.</p>}</>}
   <label><input type="checkbox" checked={value.consent} onChange={event=>setValue(old=>({...old,consent:event.target.checked}))}/> I authorize uploading this video with these settings. By posting, I agree to TikTok’s {value.brandedContent&&<><a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer">Branded Content Policy</a> and </>}<a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer">Music Usage Confirmation</a>.</label>
  </fieldset><p>TikTok may take a few minutes to process the video before it appears on your profile.</p>
 </section>;
}
