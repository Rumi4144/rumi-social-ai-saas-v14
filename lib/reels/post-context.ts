import type {ReelProject} from './timeline';
import {parseReelScenePlan} from './scene-plan';
export type ReelSource={id:string;src:string;kind:'image'|'video';contentItemId?:string;sceneId?:string;seconds?:number;label?:string;libraryBrandId?:string;productVerified?:boolean};
export type ReelPost={id:string;headline:string|null;caption:string|null;visualDirection?:string|null;productSubject?:string};
export function reelDraftKey(organizationId:string,campaignId:string,postId:string){return `${organizationId}:${campaignId}:${postId}`;}
export function selectedPostProject(data:{posts:ReelPost[];sources:ReelSource[];brand:{name:string;color:string;accent:string;website:string;logo?:string}},requestedPostId:string):{post:ReelPost;project:ReelProject}{
 const post=requestedPostId?data.posts.find(p=>p.id===requestedPostId):data.posts[0];
 if(!post)throw new Error('This post is not available in the selected campaign. Return to the campaign and open its reel again.');
 const owned=data.sources.filter(s=>s.contentItemId===post.id && (!post.productSubject || s.productVerified===true));
 // Newest matching image is the authoritative source, not the campaign's first
 // photographs. Use a matching clip only when no photo is available.
 const source=owned.find(s=>s.kind==='image'&&!s.sceneId)||owned.find(s=>s.kind==='image')||owned.find(s=>s.kind==='video');
 const plan=parseReelScenePlan(post.visualDirection);
 if(plan && source) {
   const photos=owned.filter(s=>s.kind==='image'&&!s.sceneId);
   return {post,project:{brand:data.brand.name,website:data.brand.website,logo:data.brand.logo,color:data.brand.color,accent:data.brand.accent,cta:plan.cta,productSubject:post.productSubject,style:'cinematic',closingSeconds:0,scenes:plan.scenes.map((scene,index)=>{const id=`${post.id}-planned-${index+1}`;const media=owned.find(item=>item.sceneId===id)||photos[index]||source;return {id,src:media.src,kind:media.kind,seconds:scene.seconds,headline:scene.headline,detail:'',direction:scene.direction};})}};
 }
 return {post,project:{brand:data.brand.name,website:data.brand.website,logo:data.brand.logo,color:data.brand.color,accent:data.brand.accent,cta:'Explore more',productSubject:post.productSubject,style:'editorial',closingSeconds:3,scenes:source?[{id:post.id,src:source.src,kind:source.kind,seconds:source.seconds||4,headline:post.headline?.slice(0,120)||data.brand.name,detail:post.caption?.slice(0,160)||''}]:[]}};
}
export function matchingDraft<T extends {contentItemId:string;project?:{productSubject?:string}}>(draft:T|undefined,postId:string,productSubject?:string){return draft?.contentItemId===postId && (!productSubject || draft.project?.productSubject===productSubject)?draft:undefined;}
