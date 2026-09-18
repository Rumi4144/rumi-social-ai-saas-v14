import {prisma} from "@/lib/prisma";
export async function spendCredits(organizationId:string,cost:number,reason:string,referenceId?:string){
 return prisma.$transaction(async tx=>{
  const sub=await tx.subscription.findUnique({where:{organizationId}});
  if(!sub||sub.credits<cost) throw new Error("INSUFFICIENT_CREDITS");
  const updated=await tx.subscription.update({where:{organizationId},data:{credits:{decrement:cost}}});
  await tx.creditLedger.create({data:{organizationId,delta:-cost,balanceAfter:updated.credits,reason,referenceId}});
  return updated.credits;
 });
}