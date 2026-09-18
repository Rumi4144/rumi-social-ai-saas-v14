import {NextResponse} from "next/server";import {prisma} from "@/lib/prisma";import {generateCampaign} from "@/lib/ai/campaign";
export async function POST(req:Request){const secret=req.headers.get("x-worker-secret");if(!process.env.WORKER_SECRET||secret!==process.env.WORKER_SECRET)return NextResponse.json({error:"Unauthorized"},{status:401});
 const job=await prisma.job.findFirst({where:{status:"queued",type:"CREATE_EVERYTHING"},orderBy:{createdAt:"asc"}});if(!job)return NextResponse.json({status:"idle"});
 await prisma.job.update({where:{id:job.id},data:{status:"running",progress:10,attempts:{increment:1}}});
 try{const p=job.payload as any;const campaign=await prisma.campaign.findUnique({where:{id:p.campaignId},include:{brand:true}});if(!campaign)throw new Error("CAMPAIGN_NOT_FOUND");
  const pack=await generateCampaign({brief:p.brief,goal:p.goal,days:p.days,brand:campaign.brand});
  await prisma.$transaction(async tx=>{await tx.contentItem.deleteMany({where:{campaignId:campaign.id}});
   for(const x of pack.posts)await tx.contentItem.create({data:{campaignId:campaign.id,type:x.type,platform:x.platform,headline:x.headline,caption:x.caption,status:"draft"}});
   for(const x of pack.stories)await tx.contentItem.create({data:{campaignId:campaign.id,type:"story",platform:"instagram",headline:`Story ${x.frame}`,caption:x.text,status:"draft"}});
   await tx.contentItem.create({data:{campaignId:campaign.id,type:"reel",platform:"instagram",headline:pack.reel.hook,caption:pack.reel.voiceover,status:"draft"}});
   await tx.campaign.update({where:{id:campaign.id},data:{status:"ready"}});
   await tx.job.update({where:{id:job.id},data:{status:"succeeded",progress:100,result:pack as any}});
  });return NextResponse.json({status:"succeeded",jobId:job.id,campaignId:campaign.id});
 }catch(e){const msg=e instanceof Error?e.message:"Unknown worker error";await prisma.job.update({where:{id:job.id},data:{status:"failed",error:msg,progress:100}});return NextResponse.json({status:"failed",jobId:job.id,error:msg},{status:500})}}
