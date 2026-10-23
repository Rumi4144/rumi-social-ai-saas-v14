export type LogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export function logoBounds(width:number,height:number,imageWidth:number,imageHeight:number,position:LogoPosition='top-right',percent=20){
 const margin=Math.min(width,height)*.045;
 const w=Math.min(width*.35,Math.max(width*.1,width*percent/100),height*.15*imageWidth/imageHeight);
 const h=w*imageHeight/imageWidth;
 return {x:position.endsWith('right')?width-margin-w:margin,y:position.startsWith('bottom')?height-margin-h:margin,width:w,height:h};
}
export function drawVideoLogo(ctx:CanvasRenderingContext2D,logo:HTMLImageElement,width:number,height:number,position:LogoPosition='top-right',percent=20){
 const b=logoBounds(width,height,logo.naturalWidth,logo.naturalHeight,position,percent);
 ctx.save();ctx.globalAlpha=1;ctx.drawImage(logo,b.x,b.y,b.width,b.height);ctx.restore();
}
