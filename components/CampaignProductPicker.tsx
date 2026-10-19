"use client";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { photoProducts } from "@/lib/presenter/catalog-choices";
type Product = {id:string;name:string;imageUrl?:string;sourceUrl?:string;websitePhoto?:boolean};
export default function CampaignProductPicker({campaignId,contentItemId,children}:{campaignId:string;contentItemId:string;children?:ReactNode}) {
  const router=useRouter();
  const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[search,setSearch]=useState(""),[products,setProducts]=useState<Product[]>([]),[showAll,setShowAll]=useState(false),[subject,setSubject]=useState("");
  async function browse(all=false){
    setOpen(true);setLoading(true);setError("");setProducts([]);setShowAll(all);setSearch("");
    try{
      const query=encodeURIComponent(campaignId);
      const requests=[fetch(`/api/website/photos?campaignId=${query}&contentItemId=${encodeURIComponent(contentItemId)}${all?"&scope=all":""}`,{cache:"no-store"}).then(async r=>({ok:r.ok,data:await r.json()}))];
      if(all)requests.push(fetch(`/api/video/presenter/products?campaignId=${query}`,{cache:"no-store"}).then(async r=>({ok:r.ok,data:await r.json()})));
      const results=await Promise.allSettled(requests);
      const found:Product[]=[];const messages:string[]=[];
      for(const result of results){if(result.status!=="fulfilled"){messages.push("A website request could not be completed.");continue;}if(!result.value.ok){messages.push(result.value.data.error||"Website photos could not load.");continue;}if(result.value.data.productSubject)setSubject(result.value.data.productSubject);found.push(...photoProducts<Product>(result.value.data.products||[]).filter(p=>!!p.sourceUrl),...(result.value.data.photos||[]));}
      const seen=new Set<string>();setProducts(found.filter(p=>{if(!p.imageUrl||seen.has(p.imageUrl))return false;seen.add(p.imageUrl);return true;}));
      if(!found.length&&messages.length)setError(messages.join(" "));
    }catch(e){setError(e instanceof Error?e.message:"Could not load website photos.");}finally{setLoading(false);}
  }
  async function choose(product:Product){setBusy(true);setError("");try{const r=await fetch(product.websitePhoto?"/api/website/photos":"/api/products/select-photo",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(product.websitePhoto?{campaignId,contentItemId,photoId:product.id,pageUrl:product.sourceUrl,allowDifferentProduct:showAll}:{campaignId,contentItemId,productId:product.id})});const d=await r.json();if(!r.ok)throw Error(d.error||"Could not select product.");setOpen(false);router.refresh();}catch(e){setError(e instanceof Error?e.message:"Could not select product.");}finally{setBusy(false);}}
  return <div style={{margin:"16px 0"}}><h4>Choose your image</h4><div style={{display:"flex",flexWrap:"wrap",alignItems:"flex-start",gap:12}}><button type="button" disabled={loading||busy} onClick={()=>browse()}>Choose photo from website</button>{children}</div>{open&&<section className="presenter-picker"><h3>Select a product or service photo</h3><p>Website photos replace only the image and keep your post’s title and caption. Choosing a catalog product also fills its product details. Review your choice, then update the branded creative.</p>{subject&&<><p>{showAll?"Showing all business photos.":`Showing verified photos for ${subject}.`}</p><button type="button" disabled={loading||busy} onClick={()=>browse(!showAll)}>{showAll?"Show matching product only":"Browse all business photos"}</button></>}<label>Search this business’s photos<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Product, service or topic"/></label>{loading&&<p role="status">Loading website photos…</p>}<div className="presenter-choices">{products.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())).map(p=><article key={p.id}><img src={p.imageUrl} alt={p.name}/><h4>{p.name}</h4><a href={p.sourceUrl} target="_blank" rel="noreferrer">View on website</a><button type="button" disabled={busy} onClick={()=>choose(p)}>{busy?"Saving…":p.websitePhoto?"Use this photo":"Use this item and photo"}</button></article>)}</div>{!loading&&products.length>0&&!products.some(p=>p.name.toLowerCase().includes(search.toLowerCase()))&&<p>No photos match that search. Clear the search to see all website photos.</p>}{!loading&&!products.length&&<p>No verified matching photos were found. Use “Browse all business photos” to make a different selection, or upload the correct product photo.</p>}<button type="button" disabled={busy} onClick={()=>setOpen(false)}>Close photo choices</button></section>}{error&&<p role="alert">{error}</p>}</div>;
}
