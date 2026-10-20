import { z } from "zod";
export const TikTokOptions = z.object({
  consent:z.literal(true), privacy:z.enum(["PUBLIC_TO_EVERYONE","MUTUAL_FOLLOW_FRIENDS","FOLLOWER_OF_CREATOR","SELF_ONLY"]),
  title:z.string().max(2200), allowComment:z.boolean(),allowDuet:z.boolean(),allowStitch:z.boolean(),
  commercial:z.boolean(),ownBrand:z.boolean(),brandedContent:z.boolean(),aiGenerated:z.boolean(),
}).superRefine((p,ctx)=>{
  if(p.commercial && !p.ownBrand && !p.brandedContent)ctx.addIssue({code:"custom",message:"Choose your brand, branded content, or both."});
  if(!p.commercial && (p.ownBrand || p.brandedContent))ctx.addIssue({code:"custom",message:"Enable commercial disclosure for brand content."});
  if(p.brandedContent && p.privacy==="SELF_ONLY")ctx.addIssue({code:"custom",message:"Paid partnerships cannot be private."});
});
export type TikTokPostOptions=z.infer<typeof TikTokOptions>;
export type TikTokCreator={creator_nickname:string;creator_username:string;privacy_level_options:string[];comment_disabled:boolean;duet_disabled:boolean;stitch_disabled:boolean;max_video_post_duration_sec:number};
export function validateTikTokOptions(options:TikTokPostOptions,creator:TikTokCreator,duration:number){
  TikTokOptions.parse(options);
  if(!creator.privacy_level_options.includes(options.privacy))throw new Error("Choose an available TikTok privacy option again.");
  if(!Number.isFinite(duration)||duration<3||duration>creator.max_video_post_duration_sec)throw new Error("This video's length is not supported by the TikTok account. Export a shorter reel.");
  if((options.allowComment&&creator.comment_disabled)||(options.allowDuet&&creator.duet_disabled)||(options.allowStitch&&creator.stitch_disabled))throw new Error("TikTok interaction permissions changed. Review the posting options again.");
}
