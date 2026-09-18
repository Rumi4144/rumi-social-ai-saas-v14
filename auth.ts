import NextAuth from "next-auth";import Credentials from "next-auth/providers/credentials";import {prisma} from "@/lib/prisma";import bcrypt from "bcryptjs";import {z} from "zod";
const normalizeEmail=(value:string)=>value.trim().toLowerCase();
export const {handlers,auth,signIn,signOut}=NextAuth({
 secret:process.env.AUTH_SECRET,
 trustHost:process.env.AUTH_TRUST_HOST === "true",
 session:{strategy:"jwt"},
 pages:{signIn:"/login"},
 providers:[Credentials({credentials:{email:{label:"Email",type:"email"},password:{label:"Password",type:"password"}},authorize:async(raw)=>{const p=z.object({email:z.string().trim().email(),password:z.string().min(8)}).safeParse({
  ...raw,
  email: typeof raw?.email === "string" ? normalizeEmail(raw.email) : raw?.email,
 });if(!p.success)return null;const u=await prisma.user.findUnique({where:{email:p.data.email}});if(!u?.passwordHash||!await bcrypt.compare(p.data.password,u.passwordHash))return null;return {id:u.id,email:u.email,name:u.name}}})],
 callbacks:{
  jwt:async({token,user})=>{if(user?.id){token.sub=user.id;token.uid=user.id;}return token},
  session:async({session,token})=>{const id=typeof token.sub === "string" ? token.sub : typeof token.uid === "string" ? token.uid : undefined;if(session.user && id)(session.user as any).id=id;return session}
 }
});