import { prisma } from "@/lib/prisma";
type Asset = {id:string;organizationId:string;url:string|null;metadata:unknown;contentItemId?:string|null};
export async function resolveVideoAsset<T extends Asset>(asset:T): Promise<Asset> {
  let current:Asset=asset;const seen=new Set<string>();
  for(let depth=0;depth<6;depth++){
    if(seen.has(current.id))throw new Error("Invalid saved video reference.");seen.add(current.id);
    const reference=(current.metadata as {reusedFromAssetId?:unknown}|null)?.reusedFromAssetId;
    if(!reference)return current;
    if(typeof reference!=="string")throw new Error("Invalid saved video reference.");
    const source=await prisma.mediaAsset.findFirst({where:{id:reference,organizationId:asset.organizationId,status:"ready",kind:"campaign_video"}});
    if(!source?.url)throw new Error("The original saved video is unavailable.");current=source;
  }
  throw new Error("Too many saved video references.");
}
