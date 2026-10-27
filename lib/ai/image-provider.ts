import {createHash} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {fetchPublicBytes} from '@/lib/reels/public-fetch';
import {FLARE_MODEL, REGULAR_IMAGE_QUALITY, regularImageSize} from './image-models';

export function imageConfiguration() {
 // Regular photos use the approved Medium setting. Legacy provider/model env
 // overrides no longer select this workflow; comparisons keep their own choices.
 if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY_MISSING');
 return {provider:'openai',model:FLARE_MODEL,quality:REGULAR_IMAGE_QUALITY};
}
export function imagePollingUrl(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port||!/^api(?:\.[a-z0-9-]+)?\.bfl\.(?:ai|ml)$/.test(url.hostname)||url.pathname!=='/v1/get_result')throw new Error('Invalid image status address.');
 return url.toString();
}
export class ImageRejectedError extends Error {readonly status=422;constructor(){super("Image provider rejected this request.");}}
export class ImagePendingError extends Error {constructor(){super('Image request saved. Retry this same request to check it; a second image will not be purchased.');}}
type ImageSettings={provider:string;model:string;quality?:string;size?:string};
function completed(result:{base64:string},settings:ImageSettings){
 const bytes=Buffer.from(result.base64,'base64');
 const size=bytes.length>=24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` : undefined;
 return {base64:result.base64,provider:settings.provider,model:settings.model,size,quality:settings.quality};
}
type Input={organizationId:string;requestId:string;prompt:string;requestDescription?:string;format:string};
// A durable claim is written BEFORE submission. An unknown submission outcome is never auto-resubmitted.
export async function generateImage(input:Input){
 const id='image-provider-'+createHash('sha256').update(JSON.stringify([input.organizationId,input.requestId])).digest('hex').slice(0,40);
 const fingerprint=createHash('sha256').update(JSON.stringify([input.requestDescription ?? input.prompt,input.format])).digest('hex');
 let job=await prisma.job.findFirst({where:{id,organizationId:input.organizationId,type:'IMAGE_PROVIDER_TASK'}});
 let claimed=false;
 if(!job){
  const config={...imageConfiguration(),size:regularImageSize(input.format)};
  try{job=await prisma.job.create({data:{id,organizationId:input.organizationId,type:'IMAGE_PROVIDER_TASK',status:'submitting',payload:{fingerprint,prompt:input.prompt,...config}}});claimed=true;}
  catch{job=await prisma.job.findFirst({where:{id,organizationId:input.organizationId,type:'IMAGE_PROVIDER_TASK'}});if(!job)throw new ImagePendingError();}
 }
 const payload=job.payload as ImageSettings & {fingerprint:string;prompt:string};
 if(payload.fingerprint!==fingerprint)throw new Error('This image request belongs to a different description.');
 let result=(job.result||{}) as {taskId?:string;pollingUrl?:string;url?:string;base64?:string};
 if(result.base64)return completed({base64:result.base64},payload);
 if(job.status==='failed')throw new ImageRejectedError();
 if(claimed){
  try{
    const response=await fetch('https://api.openai.com/v1/images/generations',{
     method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(120000),
     headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY!}`},
     body:JSON.stringify({model:payload.model,prompt:payload.prompt,size:payload.size,quality:payload.quality,output_format:'png',n:1}),
    });
    if(!response.ok){if([400,401,402,403,404,422,429].includes(response.status)){await prisma.job.update({where:{id},data:{status:'failed',error:'Image provider rejected this request.'}});throw new ImageRejectedError();}throw new ImagePendingError();}
    const responseBody=await response.json();
    const encoded=responseBody.data?.[0]?.b64_json;
    if(responseBody.data?.length!==1||typeof encoded!=='string'||encoded.length>27_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))throw new ImagePendingError();
    const bytes=Buffer.from(encoded,'base64');
    if(bytes.length<24||bytes.length>20_000_000||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`!==payload.size)throw new ImagePendingError();
    result={base64:encoded};
    // Retry only the database write while the purchased bytes are in memory.
    // Never send another generation request after an ambiguous response/save.
    try{await prisma.job.update({where:{id},data:{status:'succeeded',result}});}
    catch{await prisma.job.update({where:{id},data:{status:'succeeded',result}});}
  }catch(error){if(error instanceof ImageRejectedError)throw error;throw new ImagePendingError();}
 }
 if(!result.base64&&!result.pollingUrl&&!result.url)throw new ImagePendingError();
 const deadline=Date.now()+90000;
 while(!result.base64&&!result.url&&Date.now()<deadline){
  // Pending FLUX tasks created before the default changed keep their task IDs.
  if(payload.provider!=='bfl'||!process.env.BFL_API_KEY)throw new ImagePendingError();
  const response=await fetch(imagePollingUrl(result.pollingUrl!),{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000),headers:{'x-key':process.env.BFL_API_KEY!}});
  if(!response.ok)throw new ImagePendingError();
  const state=await response.json();
  if(['Error','Failed','Content Moderated','Request Moderated','Task not found'].includes(state.status)){await prisma.job.update({where:{id},data:{status:'failed',error:'Image provider rejected this request.'}});throw new ImageRejectedError();}
  if(state.status==='Ready'){
   if(typeof state.result?.sample!=='string')throw new ImagePendingError();
   result={...result,url:state.result.sample};
   await prisma.job.update({where:{id},data:{result}});
  }else await new Promise(resolve=>setTimeout(resolve,1500));
 }
 if(!result.base64){
  if(!result.url)throw new ImagePendingError();
  const image=await fetchPublicBytes(result.url,20*1024*1024);
  if(!image.contentType.toLowerCase().startsWith('image/png')||!image.bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Image provider returned an invalid PNG.');
  result={...result,base64:image.bytes.toString('base64')};
  await prisma.job.update({where:{id},data:{status:'succeeded',result}});
 }
 return completed({base64:result.base64!},payload);
}
