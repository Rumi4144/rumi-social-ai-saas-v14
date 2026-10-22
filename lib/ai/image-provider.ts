import {createHash} from 'node:crypto';
import OpenAI from 'openai';
import {prisma} from '@/lib/prisma';
import {fetchPublicBytes} from '@/lib/reels/public-fetch';

export const IMAGE_MODEL = 'flux-3-image-klein';
export function imageConfiguration() {
 const provider=process.env.IMAGE_PROVIDER || 'bfl';
 if(!['bfl','openai'].includes(provider))throw new Error('Unsupported IMAGE_PROVIDER. Choose bfl or openai.');
 const model=provider==='bfl'?IMAGE_MODEL:(process.env.OPENAI_IMAGE_MODEL||'gpt-image-1');
 if(!(provider==='bfl'?process.env.BFL_API_KEY:process.env.OPENAI_API_KEY))throw new Error(`${provider==='bfl'?'BFL':'OPENAI'}_API_KEY_MISSING`);
 return {provider,model};
}
export function imagePollingUrl(value:string){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.port||!/^api(?:\.[a-z0-9-]+)?\.bfl\.(?:ai|ml)$/.test(url.hostname)||url.pathname!=='/v1/get_result')throw new Error('Invalid image status address.');
 return url.toString();
}
export class ImageRejectedError extends Error {readonly status=422;constructor(){super("Image provider rejected this request.");}}
export class ImagePendingError extends Error {constructor(){super('Image request saved. Retry this same request to check it; a second image will not be purchased.');}}
function completed(result:{base64:string},provider:string,model:string){
 const bytes=Buffer.from(result.base64,'base64');
 const size=bytes.length>=24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` : undefined;
 return {base64:result.base64,provider,model,size};
}
type Input={organizationId:string;requestId:string;prompt:string;requestDescription?:string;format:string};
// A durable claim is written BEFORE submission. An unknown submission outcome is never auto-resubmitted.
export async function generateImage(input:Input){
 const config=imageConfiguration();
 const id='image-provider-'+createHash('sha256').update(JSON.stringify([input.organizationId,input.requestId])).digest('hex').slice(0,40);
 const fingerprint=createHash('sha256').update(JSON.stringify([input.requestDescription ?? input.prompt,input.format])).digest('hex');
 let job=await prisma.job.findFirst({where:{id,organizationId:input.organizationId,type:'IMAGE_PROVIDER_TASK'}});
 let claimed=false;
 if(!job){
  try{job=await prisma.job.create({data:{id,organizationId:input.organizationId,type:'IMAGE_PROVIDER_TASK',status:'submitting',payload:{fingerprint,prompt:input.prompt,...config}}});claimed=true;}
  catch{job=await prisma.job.findFirst({where:{id,organizationId:input.organizationId,type:'IMAGE_PROVIDER_TASK'}});if(!job)throw new ImagePendingError();}
 }
 const payload=job.payload as {fingerprint:string;provider:string;model:string};
 if(payload.fingerprint!==fingerprint)throw new Error('This image request belongs to a different description.');
 let result=(job.result||{}) as {taskId?:string;pollingUrl?:string;url?:string;base64?:string};
 if(result.base64)return completed({base64:result.base64},payload.provider,payload.model);
 if(job.status==='failed')throw new ImageRejectedError();
 if(claimed){
  try{
   if(payload.provider==='openai'){
    const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,maxRetries:0,timeout:120000});
    const response=await client.images.generate({model:payload.model,prompt:input.prompt,size:input.format==='square'?'1024x1024':'1024x1536',quality:'medium',output_format:'png',n:1});
    if(!response.data?.[0]?.b64_json)throw new ImagePendingError();
    result={base64:response.data[0].b64_json};
   }else{
    const response=await fetch('https://api.bfl.ai/v1/flux-3-image-klein',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'application/json','x-key':process.env.BFL_API_KEY!},body:JSON.stringify({prompt:input.prompt,aspect_ratio:input.format==='square'?'1:1':input.format==='story'?'9:16':'4:5',resolution:'1k',output_format:'png'})});
    if(!response.ok){if([400,401,402,403,404,422,429].includes(response.status)){await prisma.job.update({where:{id},data:{status:'failed',error:'Image provider rejected this request.'}});throw new ImageRejectedError();}throw new ImagePendingError();}
    const responseBody=await response.json();
    if(typeof responseBody.id!=='string'||typeof responseBody.polling_url!=='string')throw new ImagePendingError();
    result={taskId:responseBody.id,pollingUrl:imagePollingUrl(responseBody.polling_url)};
   }
   await prisma.job.update({where:{id},data:{status:result.base64?'succeeded':'running',result}});
  }catch(error){if(error instanceof ImageRejectedError)throw error;throw new ImagePendingError();}
 }
 if(!result.base64&&!result.pollingUrl&&!result.url)throw new ImagePendingError();
 const deadline=Date.now()+90000;
 while(!result.base64&&!result.url&&Date.now()<deadline){
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
 return completed({base64:result.base64!},payload.provider,payload.model);
}
