import type {ReelProject} from './timeline';
export type ReelSource={id:string;src:string;kind:'image'|'video';contentItemId?:string;seconds?:number};
export type ReelPost={id:string;headline:string|null;caption:string|null};
export function reelDraftKey(organizationId:string,campaignId:string,postId:string){return `${organizationId}:${campaignId}:${postId}`;}
export function selectedPostProject(data:{posts:ReelPost[];sources:ReelSource[];brand:{name:string;color:string;accent:string;website:string;logo?:string}},requestedPostId:string):{post:ReelPost;project:ReelProject}{
 const post=requestedPostId?data.posts.find(p=>p.id===requestedPostId):data.posts[0];
 if(!post)throw new Error('This post is not available in the selected campaign. Return to the campaign and open its reel again.');
 const owned=data.sources.filter(s=>s.contentItemId===post.id);
 // Newest matching image is the authoritative source, not the campaign's first
 // photographs. Use a matching clip only when no photo is available.
 const source=owned.find(s=>s.kind==='image')||owned.find(s=>s.kind==='video');
 return {post,project:{brand:data.brand.name,website:data.brand.website,logo:data.brand.logo,color:data.brand.color,accent:data.brand.accent,cta:'Explore more',style:'editorial',closingSeconds:3,scenes:source?[{id:post.id,src:source.src,kind:source.kind,seconds:source.seconds||4,headline:post.headline?.slice(0,120)||data.brand.name,detail:post.caption?.slice(0,160)||''}]:[]}};
}
export function matchingDraft<T extends {contentItemId:string}>(draft:T|undefined,postId:string){return draft?.contentItemId===postId?draft:undefined;}
