// Contain both sources: the product is resized only, never cropped or redrawn.
export function containedRect(iw:number,ih:number,x:number,y:number,width:number,height:number){
 const scale=Math.min(width/iw,height/ih);return {x:x+(width-iw*scale)/2,y:y+(height-ih*scale)/2,width:iw*scale,height:ih*scale};
}
export function drawExactProduct(ctx:CanvasRenderingContext2D,video:HTMLVideoElement,product:HTMLImageElement){
 const width=1080,height=1350;ctx.fillStyle='#142237';ctx.fillRect(0,0,width,height);
 const person=containedRect(video.videoWidth,video.videoHeight,24,24,480,height-48);
 const item=containedRect(product.naturalWidth,product.naturalHeight,528,24,528,height-48);
 ctx.drawImage(video,person.x,person.y,person.width,person.height);
 ctx.drawImage(product,item.x,item.y,item.width,item.height);
}
