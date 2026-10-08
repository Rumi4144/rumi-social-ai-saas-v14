import {isWeeklyVideo} from "@/lib/campaigns/formats";
export type ReviewItem={id:string;headline:string|null;caption:string|null;platform:string;type:string;mediaUrl:string|null};
export function portalMedia(item:ReviewItem):{kind:"image"|"video"|"none";url:string|null;blocked:boolean}{
 const url=item.mediaUrl;
 if(url?.startsWith('/api/video/'))return {kind:"video",url:null,blocked:true};
 if(!url)return {kind:"none",url:null,blocked:isWeeklyVideo(item.type)||item.type==='reel'};
 const safe=/^\/api\/media\/[a-zA-Z0-9_-]+(?:\/publish)?$/.test(url)||/^https:\/\//.test(url);
 if(!safe)return {kind:"none",url:null,blocked:true};
 const video=isWeeklyVideo(item.type)||item.type==='reel'||/\.(mp4|webm)(?:[?#]|$)/i.test(url);
 return {kind:video?"video":"image",url,blocked:false};
}
export function portalBlockers(items:ReviewItem[]){return items.filter(item=>portalMedia(item).blocked).map(item=>item.id);}
