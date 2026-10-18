import {NextResponse} from 'next/server';
import sharp from 'sharp';
import {tenantContext} from '@/lib/auth/context';
import {prisma} from '@/lib/prisma';
import {apiError} from '@/lib/http/errors';
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Request origin is not allowed.'},{status:403});
 const ctx=await tenantContext();if(ctx.role==='viewer')return NextResponse.json({error:'Your role cannot upload photos.'},{status:403});
 const reader=req.body?.getReader();if(!reader)return NextResponse.json({error:'Choose a photo.'},{status:400});const chunks:Buffer[]=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4_000_000){await reader.cancel();return NextResponse.json({error:'Upload a photo up to 3 MB.'},{status:413});}chunks.push(Buffer.from(part.value));}
 const form=await new Response(new Uint8Array(Buffer.concat(chunks)),{headers:req.headers}).formData();if(form.get('organizationId')!==ctx.organizationId)return NextResponse.json({error:'Your workspace changed. Refresh this page.'},{status:409});
 const file=form.get('photo');if(!(file instanceof Blob)||!file.size||file.size>3_000_000||!['image/jpeg','image/png','image/webp'].includes(file.type))return NextResponse.json({error:'Choose a JPEG, PNG or WebP photo up to 3 MB.'},{status:400});
 if(form.get('permission')!=='true')return NextResponse.json({error:'Confirm you have permission to use this photo.'},{status:400});
 const stockSource=String(form.get('stockSource')||'').trim();if(stockSource){try{if(stockSource.length>2000||new URL(stockSource).protocol!=='https:')throw Error();}catch{return NextResponse.json({error:'Use an HTTPS stock-photo page address.'},{status:400});}}
 const brand=await prisma.brand.findFirst({where:{organizationId:ctx.organizationId},orderBy:{createdAt:'desc'},select:{id:true}});if(!brand)return NextResponse.json({error:'Set up your Brand Brain first.'},{status:404});
 let bytes:Buffer;try{bytes=await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:30_000_000}).rotate().resize(2048,2048,{fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();}catch{return NextResponse.json({error:'This file is not a supported photo.'},{status:400});}
 const label=String(form.get('label')||'Uploaded photo').trim().slice(0,200)||'Uploaded photo';
 const asset=await prisma.mediaAsset.create({data:{organizationId:ctx.organizationId,kind:'product_photo',provider:'upload',status:'ready',url:`data:image/jpeg;base64,${bytes.toString('base64')}`,prompt:label,metadata:{brandId:brand.id,label,rightsConfirmed:true,stockSource:stockSource||null,campaignSetup:true}}});
 return NextResponse.json({id:asset.id,label,src:`/api/reels/media?assetId=${encodeURIComponent(asset.id)}`},{status:201});
}catch(error){return apiError(error,'Could not upload photo. Try again.');}}
