import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
function plain(value:unknown){return String(value||"").replace(/<[^>]*>/g," ").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).replace(/&amp;|&#038;/g,"&").replace(/&quot;/g,'"').replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();}
export async function GET(req:Request){try{
 const ctx=await tenantContext();const campaignId=new URL(req.url).searchParams.get("campaignId");
 if(!campaignId)return reply({error:"Choose a campaign first."},400);
 const campaign=await prisma.campaign.findFirst({where:{id:campaignId,brand:{organizationId:ctx.organizationId}},select:{brandId:true,brand:{select:{websiteUrl:true}}}});
 if(!campaign)return reply({error:"Campaign not found."},404);
 const products: {id:string;name:string;description:string|null;imageUrl:string|null;sourceUrl:string|null;websiteOnly?:boolean}[]=await prisma.product.findMany({where:{brandId:campaign.brandId,imageUrl:{not:null}},select:{id:true,name:true,description:true,imageUrl:true,sourceUrl:true},take:100});
 let hostname="";try{hostname=new URL(campaign.brand.websiteUrl||"").hostname;}catch{}
 // Only the known Rumi public catalog is fetched; never request arbitrary tenant URLs.
 if(["rumiguitars.com","www.rumiguitars.com"].includes(hostname)){
  try{
  const response=await fetch("https://rumiguitars.com/wp-json/wc/store/v1/products?per_page=30&stock_status=instock",{cache:"no-store",redirect:"error",signal:AbortSignal.timeout(15000)});
  if(!response.ok){if(products.length)return reply({products});return reply({error:"Rumi’s website catalog is temporarily unavailable. Try again."},502);}
  const catalog=await response.json();
  if(Array.isArray(catalog))for(const item of catalog){const image=item.images?.[0]?.src;const name=plain(item.name);if(!name||typeof image!=="string"||!image.startsWith("https://rumiguitars.com/"))continue;
   if(products.some(p=>p.sourceUrl===item.permalink))continue;
   products.push({id:`website-${item.id}`,name,description:[plain(item.short_description),plain(item.description),...(Array.isArray(item.attributes)?item.attributes.map((a:any)=>`${plain(a.name)}: ${(a.terms||[]).map((t:any)=>plain(t.name)).filter(Boolean).join(", ")}`):[])].filter(Boolean).filter((value,index,list)=>list.indexOf(value)===index).join("\n\n").slice(0,8000),imageUrl:image,sourceUrl:item.permalink,websiteOnly:true});
  }
  }catch{if(!products.length)return reply({error:"Rumi’s website catalog is temporarily unavailable. Try again."},502);}
 }
 return reply({products});
 }catch(error){return apiError(error,"Could not load website products.");}}
