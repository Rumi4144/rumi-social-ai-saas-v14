// Resolve IDs in the current tenant and brand. Never accept client-supplied image URLs for saved photos.
export async function campaignSetupPhotos(db:any,organizationId:string,brandId:string,ids:string[]){
 const campaigns=await db.campaign.findMany({where:{brandId,brand:{organizationId}},select:{id:true}});
 const assets=await db.mediaAsset.findMany({where:{id:{in:ids},organizationId,status:{in:['ready','superseded']},kind:{in:['ai_image','product_photo','reel_scene_image']},url:{not:null},OR:[{campaignId:{in:campaigns.map((c:{id:string})=>c.id)}},{campaignId:null,metadata:{path:['brandId'],equals:brandId}}]}});
 return ids.map(id=>{const asset=assets.find((a:{id:string})=>a.id===id);if(!asset)throw Error('A selected photo is no longer available for this business. Choose it again.');return asset;});
}
export async function attachSetupPhoto(db:any,organizationId:string,campaignId:string,itemId:string,source:any){
 if(source.campaignId === null && source.provider === 'upload') await db.mediaAsset.updateMany({where:{id:source.id,organizationId,campaignId:null},data:{campaignId}});
 await db.mediaAsset.create({data:{organizationId,campaignId,contentItemId:itemId,kind:source.kind==='ai_image'?'ai_image':'product_photo',provider:'reuse',status:'ready',url:source.url,prompt:source.prompt,metadata:{sourceEvidence:source.metadata?.sourceEvidence||null,sourceUrl:source.metadata?.sourceUrl||null,productName:source.metadata?.productName||null,sourceAssetId:source.id,sourceProvider:source.provider,stockSource:source.metadata?.stockSource||null,rightsConfirmed:source.metadata?.rightsConfirmed===true,userSelected:true,label:source.metadata?.label||'Saved campaign photo'}}});
 await db.contentItem.update({where:{id:itemId},data:{mediaUrl:source.url}});
}
