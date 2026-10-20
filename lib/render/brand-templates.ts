import type {SocialSvgInput} from './svg';

export const BRAND_TEMPLATES = [
  {value:'modern-gradient',label:'Modern Gradient',description:'Luminous brand colors, a spacious headline and a hero photograph.'},
  {value:'framed-editorial',label:'Framed Editorial',description:'A crisp magazine layout with a framed photo and a clear call to action.'},
  {value:'geometric-focus',label:'Geometric Focus',description:'Layered geometric shapes around a central photograph.'},
] as const;
export type BrandTemplate = typeof BRAND_TEMPLATES[number]['value'];
export function isBrandTemplate(value:string):value is BrandTemplate{return BRAND_TEMPLATES.some(t=>t.value===value);}
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const hex=(s:string|undefined,fallback:string)=>/^#[a-f0-9]{6}$/i.test(s||'')?s!:fallback;
function rows(value:string,columns:number,maximum:number){
 const words=value.trim().split(/\s+/),result:string[]=[];let line='';
 for(const word of words){
  // Split very long tokens so one URL or model identifier cannot overflow a card.
  const chunks=word.match(new RegExp(`.{1,${columns}}`,'gu'))||[];
  for(const chunk of chunks){if((line+' '+chunk).trim().length>columns&&line){result.push(line);line=chunk;}else line=(line+' '+chunk).trim();}
 }
 if(line)result.push(line);
 return result.slice(0,maximum).map((s,i)=>i===maximum-1&&result.length>maximum?s.slice(0,-1)+'…':s);
}
/** Photo layouts use only the supplied image, and never add credentials or result claims. */
export function renderBrandTemplate(input:SocialSvgInput,style:BrandTemplate){
 const h=input.format==='story'?1920:input.format==='square'?1080:1350;
 const primary=hex(input.primaryColor,'#172846'),accent=hex(input.accentColor,'#bd408d'),light='#faf8f5';
 const title=rows(input.headline,27,3),size=title.length>2?64:78;
 const titleTop=style==='geometric-focus'?Math.round(h*(h===1080?.60:.68)):190;
 const rgb=accent.slice(1).match(/../g)!.map(v=>parseInt(v,16));
 const buttonInk=(rgb[0]*299+rgb[1]*587+rgb[2]*114)/1000>155?'#111827':'#ffffff';
 const text=(value:string,x:number,y:number,fontSize:number,fill:string,width=936,center=false)=>`<text x="${x}" y="${y}" fill="${fill}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="${fontSize>45?700:400}" text-anchor="${center?'middle':'start'}"${value.length*fontSize*.64>width?` textLength="${width}" lengthAdjust="spacingAndGlyphs"`:''}>${esc(value)}</text>`;
 const headline=title.map((s,i)=>text(s,style==='geometric-focus'?540:72,titleTop+i*size*1.08,size,light,936,style==='geometric-focus')).join('');
 const detailY=titleTop+title.length*size*1.08+14;
 const detail=rows(input.subheadline||'',59,2).map((s,i)=>text(s,style==='geometric-focus'?540:72,detailY+i*33,27,light,936,style==='geometric-focus')).join('');
 const brandY=78;
 const logo=input.logoUrl?`<image href="${esc(input.logoUrl)}" x="72" y="34" width="76" height="76" preserveAspectRatio="xMidYMid meet"/>`:'';
 const brand=text(input.brand.toUpperCase(),input.logoUrl?170:72,brandY,25,light,input.logoUrl?830:936);
 const button=`<rect x="72" y="${h-128}" width="936" height="68" rx="14" fill="${accent}"/>${text(input.cta||'Learn more',540,h-83,29,buttonInk,820,true)}`;
 const photo=(x:number,y:number,w:number,height:number,round=false)=>`<rect x="${x}" y="${y}" width="${w}" height="${height}" rx="${round?Math.min(w,height)/2:24}" fill="#ffffff" fill-opacity=".06"/>${input.imageUrl?`<svg x="${x}" y="${y}" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" overflow="hidden"><g${round?' clip-path="url(#round-photo)"':''}><image href="${esc(input.imageUrl)}" width="${w}" height="${height}" preserveAspectRatio="xMidYMid meet"/></g></svg>`:''}`;
 let artwork='';
 if(style==='geometric-focus'){
  const diameter=Math.min(680,h*(h===1080?.36:.4)),cy=Math.round(h*.37),x=540-diameter/2,y=cy-diameter/2;
  artwork=`<defs><clipPath id="round-photo"><circle cx="${diameter/2}" cy="${diameter/2}" r="${diameter/2}"/></clipPath></defs>
  <path d="M810 0h270v${h}H810Z" fill="${accent}" opacity=".09"/>
  ${[[-80,-40],[90,-50],[-70,85],[95,80]].map(([dx,dy],i)=>`<circle cx="${540+dx}" cy="${cy+dy}" r="${diameter*.57}" fill="${i%2?accent:'#9dcbd0'}" opacity=".16"/>`).join('')}
  <path d="M52 ${cy}h976M540 120v${h-320}" stroke="${light}" stroke-opacity=".08"/>${photo(x,y,diameter,diameter,true)}`;
 }else{
  const y=Math.max(Math.round(h*.36),detailY+(input.subheadline?90:24)),height=Math.max(150,h-y-175);
  artwork=style==='framed-editorial'?`<path d="M36 ${y-20}h1008v${height+40}H36Z" fill="none" stroke="${light}" stroke-opacity=".65"/><rect x="${924}" y="115" width="84" height="10" fill="${accent}"/>${photo(58,y,964,height)}`:
   `<ellipse cx="730" cy="${y+height*.6}" rx="420" ry="${height*.55}" fill="${accent}" opacity=".2"/>${photo(72,y,936,height)}
   <g fill="none" stroke="${light}" stroke-opacity=".18"><path d="M860 130l140 90-90 135 140 80M0 ${h-430}l60 90-45 160 120 70"/><circle cx="1000" cy="220" r="8"/><circle cx="910" cy="355" r="8"/></g>`;
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${h}" viewBox="0 0 1080 ${h}"><defs><linearGradient id="brand-gradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${primary}"/><stop offset="1" stop-color="#101929"/></linearGradient></defs><rect width="1080" height="${h}" fill="url(#brand-gradient)"/>${artwork}${logo}${brand}${headline}${detail}${button}</svg>`;
}
