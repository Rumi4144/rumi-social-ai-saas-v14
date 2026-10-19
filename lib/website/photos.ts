import { createHash } from "node:crypto";
import { fetchPublicBytes } from "@/lib/reels/public-fetch";
import { extractWebsiteTopics } from "@/lib/campaign/website-topics";
import { websiteCatalog } from "@/lib/campaign/website-catalog";
import { reelPhotoMatchesProduct } from "@/lib/reels/product-identity";
import { cleanPhotoUrl, photoKey, extractProductPhotos } from "@/lib/reels/product-photos";
export type WebsitePhoto={id:string;name:string;imageUrl:string;sourceUrl:string;websitePhoto:true;productName?:string};
function plain(value:string){return value.replace(/<[^>]*>/g," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();}
function attribute(tag:string,name:string){return tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,"i"))?.[2]||"";}
export function extractWebsitePhotos(html:string,pageUrl:string,businessName:string):WebsitePhoto[]{
 if(/woocommerce-product-gallery/i.test(html)||/\/products?\//i.test(new URL(pageUrl).pathname)){
  const productName=plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||businessName);
  return extractProductPhotos(html,pageUrl).map((imageUrl,index)=>({id:createHash("sha256").update(`${pageUrl}\n${imageUrl}`).digest("hex"),name:productName,productName,imageUrl,sourceUrl:pageUrl,websitePhoto:true as const}));
 }
 const clean=html.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,"");
 const result:WebsitePhoto[]=[],seen=new Set<string>();
 for(const match of clean.matchAll(/<img\b[^>]*>/gi)){
  const tag=match[0],alt=plain(attribute(tag,"alt")),src=attribute(tag,"data-src")||attribute(tag,"data-lazy-src")||attribute(tag,"src");
  if(/logo|icon|avatar|spinner|placeholder|badge|tracking|pixel|testimonial|review/i.test(`${src} ${alt}`))continue;
  const imageUrl=cleanPhotoUrl(src,pageUrl);if(!imageUrl||!src||/\.svg(?:[?#]|$)/i.test(imageUrl))continue;
  const width=Number(attribute(tag,"width")),height=Number(attribute(tag,"height"));if((width&&width<180)||(height&&height<120))continue;
  const key=photoKey(imageUrl);if(seen.has(key))continue;seen.add(key);
  result.push({id:createHash("sha256").update(`${pageUrl}\n${imageUrl}`).digest("hex"),name:(alt||`${businessName} website photo`).slice(0,180),imageUrl,sourceUrl:pageUrl,websitePhoto:true});
 }
 return result.slice(0,40);
}
export function websitePage(website:string,page?:string){
 const root=new URL(/^https?:/i.test(website)?website:`https://${website}`),url=new URL(page||root.href);
 if(root.protocol!=="https:"||url.protocol!=="https:"||url.origin!==root.origin||url.username||url.password||url.port)throw Error("Choose a page on this business’s saved HTTPS website.");
 url.hash="";return url;
}
export async function websitePhotos(website:string,businessName:string,page?:string,subject?:string):Promise<WebsitePhoto[]>{
 const url=websitePage(website,page),home=await fetchPublicBytes(url.href,750_000);
 if(!/text\/html|application\/xhtml/i.test(home.contentType))throw Error("This website page could not be read as a web page.");
 const html=home.bytes.toString("utf8");
 if(subject && !page){
  const catalog=await websiteCatalog(url.href,html);
  const matches=catalog.filter(item=>reelPhotoMatchesProduct(subject,{metadata:{sourceEvidence:{title:item.label,sourceUrl:item.sourceUrl,imageUrl:item.images[0]||item.sourceUrl}}}));
  if(matches.length!==1)return [];
  return (await websitePhotos(website,businessName,matches[0].sourceUrl)).filter(photo=>reelPhotoMatchesProduct(subject,{metadata:{sourceEvidence:{title:photo.productName||photo.name,sourceUrl:photo.sourceUrl,imageUrl:photo.imageUrl}}}));
 }
 const photos=extractWebsitePhotos(html,url.href,businessName);
 if(!page){
  const links=extractWebsiteTopics(html,url.href,businessName).links;
  const results=await Promise.allSettled(links.map(async link=>{const child=websitePage(website,link),data=await fetchPublicBytes(child.href,750_000);return /text\/html|application\/xhtml/i.test(data.contentType)?extractWebsitePhotos(data.bytes.toString("utf8"),child.href,businessName):[];}));
  for(const result of results)if(result.status==="fulfilled")photos.push(...result.value);
 }
 const seen=new Set<string>();return photos.filter(photo=>{const key=photoKey(photo.imageUrl);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,60);
}
