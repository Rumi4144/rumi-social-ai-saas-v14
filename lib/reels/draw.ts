import { ease, photoMotion, entrance, transitionDuration } from "./animation";
import { distinctSceneIndexes, frameAt, safeColor, wrappedLines, REEL_WIDTH as W, REEL_HEIGHT as H, type ReelProject, type ReelAnimation } from "./timeline";
export type ReelMedia = HTMLImageElement | HTMLVideoElement;
function dimensions(media: ReelMedia) { return media instanceof HTMLVideoElement ? [media.videoWidth, media.videoHeight] : [media.naturalWidth, media.naturalHeight]; }
function drawPicture(ctx: CanvasRenderingContext2D, media: ReelMedia | undefined, x: number, y: number, width: number, height: number, progress: number, contain = false, animation: ReelAnimation = "none", index = 0) {
  if (!media) return;
  const [mw, mh] = dimensions(media); if (!mw || !mh) return;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  const motion = photoMotion(animation, progress, index, contain);
  const scale = (contain ? Math.min(width / mw, height / mh) : Math.max(width / mw, height / mh)) * motion.zoom;
  ctx.drawImage(media, x + (width - mw * scale) / 2 + width * motion.x, y + (height - mh * scale) / 2 + height * motion.y, mw * scale, mh * scale); ctx.restore();
}
function drawText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, width: number, color: string, maxLines = 4, align: CanvasTextAlign = "left", serif = false) {
  ctx.font = `${serif ? "italic " : ""}600 ${size}px ${serif ? "Georgia" : "Arial"}`; ctx.fillStyle = color; ctx.textAlign = align;
  const lines = wrappedLines(value, width, text => ctx.measureText(text).width, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * size * 1.16));
  return lines.length * size * 1.16;
}
function drawFrame(ctx: CanvasRenderingContext2D, project: ReelProject, media: ReelMedia[], frame: ReturnType<typeof frameAt>, logo?: HTMLImageElement) {
  const animation = project.animation || "gentle";
  const reveal = entrance(animation, frame.elapsed);
  const text = (...args: Parameters<typeof drawText>) => {
    ctx.save(); ctx.globalAlpha *= reveal.opacity; ctx.translate(0,reveal.lift);
    const height = drawText(...args); ctx.restore(); return height;
  };
  const picture = (context:CanvasRenderingContext2D, item:ReelMedia | undefined, x:number, y:number, width:number, height:number, progress:number, contain=false) =>
    drawPicture(context,item,x,y,width,height,progress,contain,item instanceof HTMLVideoElement || item===logo ? "none" : animation,frame.index);
  const bg = safeColor(project.color, "#132342"), accent = safeColor(project.accent, "#dec184");
  const scene = project.scenes[frame.index];
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (frame.closing) {
    const glow = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 900); glow.addColorStop(0, "rgba(255,255,255,.12)"); glow.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    if (logo) picture(ctx, logo, 260, 440, 560, 290, 0, true);
    text(ctx, project.brand, W / 2, logo ? 860 : 720, 92, 900, "#ffffff", 3, "center", project.style === "editorial");
    ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(340, 1170); ctx.lineTo(740, 1170); ctx.stroke();
    text(ctx, project.cta, W / 2, 1300, 62, 880, accent, 2, "center");
    text(ctx, project.website, W / 2, 1490, 38, 880, "#ffffff", 3, "center");
  } else if (project.style === "cinematic") {
    picture(ctx, media[frame.index], 0, 0, W, H, frame.progress);
    const shade = ctx.createLinearGradient(0, 850, 0, H); shade.addColorStop(0, "rgba(0,0,0,0)"); shade.addColorStop(1, "rgba(0,0,0,.94)"); ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 0, W, 210); text(ctx, project.brand, 72, 142, 40, 940, "#ffffff", 1);
    const height = text(ctx, scene.headline, 72, 1270, 84, 920, accent, 3, "left", true);
    text(ctx, scene.detail, 72, 1300 + height, 44, 920, "#ffffff", 3);
  } else if (project.style === "gallery") {
    picture(ctx, media[frame.index], 60, 255, 960, 1070, frame.progress, true);
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(60, 255, 960, 1070);
    text(ctx, project.brand, 72, 145, 36, 930, accent, 1);
    const height = text(ctx, scene.headline, 78, 1450, 76, 920, "#ffffff", 2, "left", true);
    text(ctx, scene.detail, 78, 1480 + height, 40, 920, accent, 2);
  } else if (project.style === "spotlight") {
    const glow = ctx.createRadialGradient(540, 780, 50, 540, 780, 850);
    glow.addColorStop(0, "rgba(255,255,255,.22)"); glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    text(ctx, project.brand, 540, 145, 38, 930, accent, 1, "center");
    picture(ctx, media[frame.index], 80, 240, 920, 1000, frame.progress, true);
    const height = text(ctx, scene.headline, 540, 1390, 76, 920, "#ffffff", 3, "center");
    text(ctx, scene.detail, 540, 1420 + height, 38, 900, "#ffffff", 3, "center");
    text(ctx, project.cta, 540, 1830, 40, 900, accent, 1, "center");
  } else if (project.style === "minimal") {
    ctx.fillStyle = "#f8f7f2"; ctx.fillRect(0, 0, W, H);
    text(ctx, project.brand, 76, 142, 36, 930, "#17212c", 1);
    picture(ctx, media[frame.index], 60, 225, 960, 1020, frame.progress, true);
    ctx.fillStyle = accent; ctx.fillRect(76, 1300, 170, 6);
    const height = text(ctx, scene.headline, 76, 1420, 72, 920, "#17212c", 3);
    text(ctx, scene.detail, 76, 1450 + height, 38, 920, "#394452", 3);
    text(ctx, project.cta, 76, 1830, 40, 920, "#17212c", 1);
  } else if (project.style === "split") {
    text(ctx, project.brand, 72, 140, 38, 936, accent, 1);
    const height = text(ctx, scene.headline, 72, 260, 70, 936, "#ffffff", 3);
    const indexes = distinctSceneIndexes(project.scenes, frame.index, 2);
    if (indexes.length > 1) {
      picture(ctx, media[indexes[0]], 28, 540, 500, 950, frame.progress, true);
      picture(ctx, media[indexes[1]], 552, 540, 500, 950, frame.progress, true);
      ctx.fillStyle = accent; ctx.fillRect(539, 570, 2, 890);
    } else picture(ctx, media[frame.index], 40, 540, 1000, 950, frame.progress, true);
    text(ctx, scene.detail, 72, Math.max(1580, 300 + height), 42, 936, "#ffffff", 3);
    text(ctx, project.cta, 72, 1830, 42, 936, accent, 1);
  } else {
    // A moving photo collage with a stable caption panel, like the supplied examples.
    ctx.fillStyle = "#edf0e5"; ctx.fillRect(0, 0, W, 510);
    text(ctx, project.brand, 64, 125, 34, 940, bg, 1);
    const height = text(ctx, scene.headline, 64, 245, 70, 940, bg, 2, "left", true);
    text(ctx, scene.detail, 64, 270 + height, 36, 940, bg, 2);
    const drift = animation === "none" ? 0 : Math.sin(frame.progress * Math.PI) * 32;
    const indexes = distinctSceneIndexes(project.scenes, frame.index);
    if (indexes.length === 1) picture(ctx, media[frame.index], 22, 534, 1036, 970, frame.progress, true);
    else if (indexes.length === 2) {
      picture(ctx, media[indexes[0]], 22, 534, 506, 970, frame.progress, true);
      picture(ctx, media[indexes[1]], 552, 534, 506, 970, frame.progress, true);
    } else {
      picture(ctx, media[indexes[0]], 22, 534, 650, 970, frame.progress);
      picture(ctx, media[indexes[1]], 694, 534 - drift, 364, 470, frame.progress);
      picture(ctx, media[indexes[2]], 694, 1026 + drift, 364, 478, frame.progress);
    }
    text(ctx, project.cta, 64, 1650, 48, 940, accent, 2);
  }

}

const transitionLayers = new WeakMap<CanvasRenderingContext2D, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }>();
export function drawReel(ctx: CanvasRenderingContext2D, project: ReelProject, media: ReelMedia[], time: number, logo?: HTMLImageElement) {
  if (!project.scenes.length) { ctx.clearRect(0,0,W,H); return; }
  const frame=frameAt(project,time),animation=project.animation || "gentle";
  const seconds=frame.closing?project.closingSeconds:project.scenes[frame.index].seconds;
  const duration=transitionDuration(animation,seconds);
  if(frame.start>0 && duration>0 && frame.elapsed<duration) {
    let layer=transitionLayers.get(ctx);
    if(!layer) {
      const canvas=ctx.canvas.ownerDocument.createElement("canvas"); canvas.width=W; canvas.height=H;
      const context=canvas.getContext("2d");
      if(context) {layer={canvas,ctx:context};transitionLayers.set(ctx,layer);}
    }
    if(layer) {
      drawFrame(ctx,project,media,frameAt(project,frame.start-.001),logo);
      drawFrame(layer.ctx,project,media,frame,logo);
      const progress=ease(frame.elapsed/duration);
      ctx.save();
      if(animation==="lively") ctx.drawImage(layer.canvas,W*(1-progress),0);
      else {ctx.globalAlpha=progress;ctx.drawImage(layer.canvas,0,0);}
      ctx.restore(); return;
    }
  }
  drawFrame(ctx,project,media,frame,logo);
}
