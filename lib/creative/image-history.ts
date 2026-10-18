import type {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
// Preserve original paid files across both manual generation and background jobs.
export async function saveGeneratedPhoto(data:Prisma.MediaAssetUncheckedCreateInput){
 return prisma.$transaction(async tx=>{
  if(data.contentItemId)await tx.mediaAsset.updateMany({where:{organizationId:data.organizationId,contentItemId:data.contentItemId,kind:'ai_image',status:'ready'},data:{status:'superseded'}});
  return tx.mediaAsset.create({data});
 });
}
