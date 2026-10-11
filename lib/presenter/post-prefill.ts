export type PresenterPost = {id:string;headline?:string|null;caption?:string|null;mediaUrl?:string|null};
export type PresenterProduct = {id:string;name:string;description?:string|null;imageUrl?:string|null};
const key=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function presenterPostPrefill(post:PresenterPost,products:PresenterProduct[]){
 const title=post.headline?.trim()||"";
 const product=title?products.find(p=>key(p.name)===key(title)):undefined;
 const details=product?.description?.trim()||post.caption?.trim()||"";
 const words=(post.caption?.trim()||title).replace(/https?:\/\/\S+|#\S+/g,"").replace(/\s+/g," ").trim().split(" ").filter(Boolean);
 // Keep existing wording; do not invent product facts or medical claims.
 const script=words.slice(0,30).join(" ").slice(0,500);
 const image=product?.imageUrl||(/^https:\/\//i.test(post.mediaUrl||"")&&/\.(png|jpe?g|webp)(?:[?#]|$)/i.test(post.mediaUrl||"")?post.mediaUrl:"");
 return {productId:product?.id||"",name:(product?.name||title).slice(0,180),details:details.slice(0,8000),script,image:image||""};
}

export function presenterCampaignChoices(products:(PresenterProduct & {sourceUrl?:string|null;websiteOnly?:boolean})[],posts:PresenterPost[]){
 const choices=products.map(p=>({...p,name:p.name,description:p.description||"",imageUrl:p.imageUrl||"",sourceUrl:p.sourceUrl||undefined}));
 for(const post of posts){if(!post.headline?.trim()||choices.some(p=>key(p.name)===key(post.headline!)))continue;const filled=presenterPostPrefill(post,[]);choices.push({id:`post-${post.id}`,name:filled.name,description:filled.details,imageUrl:filled.image,sourceUrl:undefined,websiteOnly:true});}
 return choices;
}
