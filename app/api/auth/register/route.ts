import {signupProtection,verifySignupChallenge} from "@/lib/turnstile";
import {INDUSTRIES} from "@/lib/industries";
import {NextResponse} from "next/server";import {prisma} from "@/lib/prisma";import {z} from "zod";import bcrypt from "bcryptjs";
const S=z.object({email:z.string().trim().email(),name:z.string().trim().min(2),password:z.string().min(8),organization:z.string().trim().min(2),industry:z.enum(INDUSTRIES),challenge:z.string().max(2048).optional()});
export async function GET(){
 const protection=signupProtection();
 return NextResponse.json({mode:protection.mode,...(protection.mode==='protected'?{siteKey:protection.siteKey}:{})},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:Request){const p=S.safeParse(await req.json());if(!p.success)return NextResponse.json({error:p.error.flatten()},{status:400});const protection=signupProtection();
 if(protection.mode==='unavailable')return NextResponse.json({error:'Signup protection is temporarily unavailable.'},{status:503});
 if(protection.mode==='protected'){
  const accepted=await verifySignupChallenge(protection.secret,p.data.challenge).catch(()=>null);
  if(accepted===null)return NextResponse.json({error:'Signup protection is temporarily unavailable.'},{status:503});
  if(!accepted)return NextResponse.json({error:'Complete the security check and try again.'},{status:400});
 }
 try{const email=p.data.email.trim().toLowerCase();const name=p.data.name.trim();const organization=p.data.organization.trim();const passwordHash=await bcrypt.hash(p.data.password,12);const out=await prisma.$transaction(async tx=>{const u=await tx.user.create({data:{email,name,passwordHash}});const slug=organization.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+Date.now().toString(36);const o=await tx.organization.create({data:{name:organization,slug}});await tx.brand.create({data:{organizationId:o.id,name:organization,industry:p.data.industry}});await tx.membership.create({data:{userId:u.id,organizationId:o.id,role:"owner"}});await tx.subscription.create({data:{organizationId:o.id,plan:"starter",status:"trialing",credits:100}});return {userId:u.id,organizationId:o.id,slug};});return NextResponse.json(out,{status:201})}catch{return NextResponse.json({error:"Account could not be created"},{status:409})}}