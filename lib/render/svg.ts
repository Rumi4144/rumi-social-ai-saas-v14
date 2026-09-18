function esc(s:string){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]!))}
export function renderSocialSvg(input:{headline:string;subheadline?:string;cta?:string;brand:string;format?:"square"|"portrait"|"story";imageUrl?:string}){
 const size=input.format==="story"?[1080,1920]:input.format==="portrait"?[1080,1350]:[1080,1080];const [w,h]=size;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
 <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#10141a"/><stop offset="1" stop-color="#4d4233"/></linearGradient></defs>
 <rect width="100%" height="100%" fill="url(#g)"/>${input.imageUrl?`<image href="${esc(input.imageUrl)}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity=".55"/>`:""}
 <rect x="70" y="${h-470}" width="${w-140}" height="350" rx="24" fill="#0b0e12" opacity=".72"/>
 <text x="100" y="${h-375}" fill="#d9bd7a" font-size="25" font-family="Arial" letter-spacing="5">${esc(input.brand.toUpperCase())}</text>
 <text x="100" y="${h-285}" fill="white" font-size="58" font-weight="700" font-family="Arial">${esc(input.headline.slice(0,32))}</text>
 <text x="100" y="${h-215}" fill="#e1e3e6" font-size="28" font-family="Arial">${esc((input.subheadline||"").slice(0,52))}</text>
 <rect x="100" y="${h-175}" width="260" height="64" rx="32" fill="#d9bd7a"/><text x="230" y="${h-132}" text-anchor="middle" fill="#15120c" font-size="23" font-weight="700" font-family="Arial">${esc((input.cta||"DISCOVER MORE").toUpperCase())}</text>
 </svg>`;
}