import type { ReelAnimation } from "./timeline";
export function ease(value:number) { const t=Math.max(0,Math.min(1,value)); return t*t*(3-2*t); }
export function photoMotion(animation:ReelAnimation,progress:number,index:number,contain:boolean) {
  const p=ease(progress),direction=index%2===0?1:-1;
  if(animation==="none")return {zoom:1,x:0,y:0};
  // Contained product photos keep enough margin to remain completely visible.
  const amount=animation==="lively"?.08:.035;
  const zoom=contain?.94+p*.025:1.06+p*amount;
  return {zoom,x:animation==="pan"?(p-.5)*.015*direction:0,y:animation==="lively"?(p-.5)*.015*direction:0};
}
export function entrance(animation:ReelAnimation,elapsed:number) {
  const progress=animation==="none"?1:ease(elapsed/(animation==="lively"?.38:.65));
  return {opacity:progress,lift:(1-progress)*(animation==="lively"?54:26)};
}
export function transitionDuration(animation:ReelAnimation,seconds:number) { return animation==="none"?0:Math.min(animation==="lively"?.38:.55,seconds*.3); }
