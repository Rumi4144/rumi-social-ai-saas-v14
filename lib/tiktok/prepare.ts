import {prisma} from "@/lib/prisma";
import {campaignVideoId} from "@/lib/publishing/facebook-video";
import {tikTokAccessToken,tikTokCreator} from "./client";
import {TikTokOptions,validateTikTokOptions} from "./options";
export async function prepareTikTokSettings(organizationId:string,item:{id:string;mediaUrl:string|null},connection:{id:string;organizationId:string;externalId:string|null;encryptedToken:string|null},raw:unknown){
 const parsed=TikTokOptions.safeParse(raw);
 if(!parsed.success)throw new Error("Review TikTok privacy, disclosure and music permissions before scheduling.");
 const assetId=campaignVideoId(item.mediaUrl);
 const asset=assetId?await prisma.mediaAsset.findFirst({where:{id:assetId,organizationId,contentItemId:item.id,kind:"campaign_video",status:"ready"}}):null;
 const meta=asset?.metadata as {duration?:number;contentType?:string}|null;
 if(!asset||meta?.contentType!=="video/mp4")throw new Error("Select a finished MP4 reel for TikTok.");
 const creator=await tikTokCreator(await tikTokAccessToken(connection));
 validateTikTokOptions(parsed.data,creator,meta.duration||0);
 return {options:parsed.data,assetId:asset.id,accountId:connection.externalId};
}
