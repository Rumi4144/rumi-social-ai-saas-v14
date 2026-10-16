import {NextResponse} from "next/server";
import {z} from "zod";
import {tenantContext} from "@/lib/auth/context";
import {prisma} from "@/lib/prisma";
import {websiteBrandProfile,normalizedWebsite} from "@/lib/website/brand-profile";
import {apiError} from "@/lib/http/errors";
export const maxDuration=90;
export async function POST(req:Request){try{
 const ctx=await tenantContext();if(ctx.role==="viewer")return NextResponse.json({error:"Your role cannot fill Brand Brain."},{status:403});
 const parsed=z.object({websiteUrl:z.string().trim().min(1).max(2000)}).safeParse(await req.json());
 if(!parsed.success)return NextResponse.json({error:"Enter your business website first."},{status:400});
 let website:string;try{website=normalizedWebsite(parsed.data.websiteUrl);}catch{return NextResponse.json({error:"Enter a valid HTTPS business website address."},{status:400});}
 const brand=await prisma.brand.findFirst({where:{organizationId:ctx.organizationId},orderBy:{createdAt:"desc"},select:{name:true}});
 if(!brand)return NextResponse.json({error:"Save your brand name first."},{status:404});
 if(!process.env.OPENAI_API_KEY)return NextResponse.json({error:"Website learning needs the AI connection configured first."},{status:503});
 const draft=await websiteBrandProfile(website,brand.name);
 return NextResponse.json(draft,{headers:{"Cache-Control":"private, no-store"}});
}catch(e){return apiError(e,"Could not fill Brand Brain from this website. Check the address and try again.");}}
