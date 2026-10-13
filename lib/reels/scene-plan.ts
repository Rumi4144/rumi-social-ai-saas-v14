export type PlannedReelScene={seconds:number;headline:string;direction:string};
export function parseReelScenePlan(value:unknown):{scenes:PlannedReelScene[];cta:string}|null {
  if(typeof value!=="string" || value.length>16000)return null;
  const text=value.replace(/[–—]/g,"-");
  const matches=[...text.matchAll(/Scene\s+(\d+)\s*[,:(\s]*\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\s*[:)]\s*/gi)];
  if(!matches.length || matches.length>6)return null;
  let end=0;const scenes:PlannedReelScene[]=[];
  for(let index=0;index<matches.length;index++) {
    const match=matches[index],start=Number(match[2]),next=Number(match[3]);
    if(Number(match[1])!==index+1 || start!==end || next<=start || next-start>15 || !Number.isInteger(next-start))return null;
    const body=text.slice(match.index!+match[0].length,matches[index+1]?.index??text.length).split(/End\s*card\s*:/i)[0].trim();
    const caption=(body.match(/(?:on[- ]screen\s+text|text)\s*[,=:]?\s*(“[^”]*”|"[^"]*"|'[^']*')/i)?.[1]||"").slice(1,-1);
    scenes.push({seconds:next-start,headline:caption.slice(0,120),direction:body.split(/;\s*(?:on[- ]screen\s+text|text)\b/i)[0].trim().slice(0,500)});end=next;
  }
  return {scenes,cta:text.match(/End\s*card\s*:\s*[“"']([^”"']+)[”"']/i)?.[1]?.slice(0,70)||"Explore more"};
}
