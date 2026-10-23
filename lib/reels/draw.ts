import { drawVideoLogo } from "../video/logo";
import { drawShowcase } from "./showcase";
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
  // Fit older, longer drafts before truncating: fixed caption zones must never overlap.
  const setFont = () => { ctx.font = `${serif ? "italic " : ""}600 ${size}px ${serif ? "Georgia" : "Arial"}`; };
  setFont();
  const minimum = size * .76;
  while (size > minimum && wrappedLines(value, width, text => ctx.measureText(text).width, 100).length > maxLines) { size -= 2; setFont(); }
  ctx.fillStyle = color; ctx.textAlign = align;
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
  const accentLight = .299 * parseInt(accent.slice(1,3),16) + .587 * parseInt(accent.slice(3,5),16) + .114 * parseInt(accent.slice(5,7),16) > 150;
  const accentInk = accentLight ? "#17212c" : "#ffffff";
  const scene = project.scenes[frame.index];
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  if (project.style === "showcase") {
    drawShowcase(ctx, project, scene, frame.closing ? logo || media[frame.index] : media[frame.index], frame, bg, accent, picture, text);
    return;
  }
  if (frame.closing) {
    if (project.style === "boutique" || project.style === "bold") {
      const editorial = project.style === "boutique", paper = editorial ? "#f5f1e8" : bg, ink = editorial ? bg : "#ffffff";
      ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
      text(ctx, "DISCOVER MORE", 540, 170, 26, 900, ink, 1, "center");
      ctx.fillStyle = editorial ? bg : "rgba(255,255,255,.08)"; ctx.beginPath(); ctx.roundRect(72, 260, 936, 840, editorial ? 0 : 36); ctx.fill();
      picture(ctx, logo || media[media.length - 1], 104, 292, 872, 776, 0, true);
      text(ctx, project.brand, 540, 1250, 80, 920, ink, 2, "center", editorial);
      ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(92, 1540, 896, 124, editorial ? 0 : 28); ctx.fill();
      text(ctx, project.cta, 540, 1620, 42, 800, accentInk, 1, "center");
      text(ctx, project.website, 540, 1790, 30, 900, ink, 1, "center");
      return;
    }
    const glow = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 900); glow.addColorStop(0, "rgba(255,255,255,.12)"); glow.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    if (logo) picture(ctx, logo, 260, 440, 560, 290, 0, true);
    text(ctx, project.brand, W / 2, logo ? 860 : 720, 82, 880, "#ffffff", 3, "center", project.style === "editorial");
    ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(340, 1170); ctx.lineTo(740, 1170); ctx.stroke();
    text(ctx, project.cta, W / 2, 1300, 58, 880, accent, 2, "center");
    text(ctx, project.website, W / 2, 1550, 34, 880, "#ffffff", 2, "center");
  } else if (project.style === "boutique") {
    const alternate = frame.index % 2 === 1;
    const warm = "#f5f1e8";
    ctx.fillStyle = warm; ctx.fillRect(0, 0, W, H);
    const imageTop = alternate ? 200 : 510, imageHeight = alternate ? 1100 : 940;
    ctx.fillStyle = bg; ctx.fillRect(46, imageTop - 16, 988, imageHeight + 32);
    picture(ctx, media[frame.index], 62, imageTop, 956, imageHeight, frame.progress, true);
    text(ctx, project.brand, 72, 116, 30, 820, bg, 1);
    text(ctx, `${String(frame.index + 1).padStart(2,"0")} / ${String(project.scenes.length).padStart(2,"0")}`, 900, 116, 26, 108, bg, 1);
    const titleY = alternate ? 1430 : 270;
    ctx.fillStyle = accent; ctx.fillRect(72, titleY - 76, 100, 5);
    const height = text(ctx, scene.headline, 72, titleY, 84, 924, bg, alternate ? 2 : 3, "left", true);
    text(ctx, scene.detail, 72, alternate ? titleY + height + 26 : 1580, 34, 924, bg, 2);
    ctx.strokeStyle = bg; ctx.globalAlpha = .2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(72, 1750); ctx.lineTo(1008, 1750); ctx.stroke(); ctx.globalAlpha = 1;
    text(ctx, project.cta, 72, 1820, 32, 700, bg, 1);
    ctx.fillStyle = accent; ctx.fillRect(72, 1880, 936 * (animation === "none" ? 1 : frame.progress), 4);
  } else if (project.style === "bold") {
    const alternate = frame.index % 2 === 1;
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 190);
    ctx.fillStyle = bg; ctx.fillRect(30, 34, 1020, 124);
    text(ctx, project.brand, 64, 112, 34, 952, "#ffffff", 1);
    const imageTop = alternate ? 270 : 700, imageHeight = alternate ? 850 : 750;
    ctx.save(); ctx.beginPath(); ctx.roundRect(48, imageTop, 984, imageHeight, 36); ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,.09)"; ctx.fillRect(48, imageTop, 984, imageHeight);
    picture(ctx, media[frame.index], 64, imageTop + 16, 952, imageHeight - 32, frame.progress, true); ctx.restore();
    const titleY = alternate ? 1260 : 360;
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(64, titleY - 145, 90, 42, 10); ctx.fill();
    text(ctx, String(frame.index + 1).padStart(2,"0"), 109, titleY - 115, 25, 70, accentInk, 1, "center");
    const height = text(ctx, scene.headline, 64, titleY, 88, 952, "#ffffff", 3);
    text(ctx, scene.detail, 64, alternate ? titleY + height + 20 : 1560, 36, 952, "#ffffff", 2);
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(64, 1760, 952, 110, 28); ctx.fill();
    text(ctx, project.cta, 540, 1832, 38, 840, accentInk, 1, "center");
  } else if (project.style === "cinematic") {
    picture(ctx, media[frame.index], 0, 0, W, H, frame.progress);
    const shade = ctx.createLinearGradient(0, 800, 0, H); shade.addColorStop(0, "rgba(0,0,0,0)"); shade.addColorStop(.45, "rgba(0,0,0,.58)"); shade.addColorStop(1, "rgba(0,0,0,.92)"); ctx.fillStyle = shade; ctx.fillRect(0, 0, W, H);
    const topShade = ctx.createLinearGradient(0, 0, 0, 350); topShade.addColorStop(0, "rgba(0,0,0,.62)"); topShade.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = topShade; ctx.fillRect(0, 0, W, 350);
    text(ctx, project.brand, 84, 148, 32, 880, "#ffffff", 1);
    ctx.fillStyle = accent; ctx.fillRect(84, 1200, 100, 4);
    const height = text(ctx, scene.headline, 84, 1310, 78, 880, "#ffffff", 3, "left", true);
    text(ctx, scene.detail, 84, 1340 + height, 38, 880, "#ffffff", 2);
  } else if (project.style === "gallery") {
    picture(ctx, media[frame.index], 60, 255, 960, 1070, frame.progress, true);
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(60, 255, 960, 1070);
    text(ctx, project.brand, 72, 145, 36, 930, accent, 1);
    const height = text(ctx, scene.headline, 78, 1450, 76, 920, "#ffffff", 2, "left", true);
    text(ctx, scene.detail, 78, 1480 + height, 38, 920, accent, 2);
  } else if (project.style === "spotlight") {
    const glow = ctx.createRadialGradient(540, 780, 50, 540, 780, 850);
    glow.addColorStop(0, "rgba(255,255,255,.22)"); glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    text(ctx, project.brand, 540, 145, 38, 930, accent, 1, "center");
    ctx.fillStyle = "rgba(255,255,255,.06)"; ctx.beginPath(); ctx.roundRect(72, 240, 936, 1000, 32); ctx.fill();
    picture(ctx, media[frame.index], 104, 272, 872, 936, frame.progress, true);
    const height = text(ctx, scene.headline, 540, 1370, 74, 880, "#ffffff", 3, "center");
    text(ctx, scene.detail, 540, 1400 + height, 36, 880, "#ffffff", 2, "center");
    text(ctx, project.cta, 540, 1810, 36, 880, accent, 1, "center");
  } else if (project.style === "minimal") {
    ctx.fillStyle = "#f8f7f2"; ctx.fillRect(0, 0, W, H);
    text(ctx, project.brand, 76, 142, 36, 930, "#17212c", 1);
    picture(ctx, media[frame.index], 60, 225, 960, 1020, frame.progress, true);
    ctx.fillStyle = accent; ctx.fillRect(76, 1300, 170, 6);
    const height = text(ctx, scene.headline, 76, 1420, 72, 920, "#17212c", 3);
    text(ctx, scene.detail, 76, 1450 + height, 36, 920, "#394452", 2);
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
    const height = text(ctx, scene.headline, 64, 230, 66, 940, bg, 2, "left", true);
    text(ctx, scene.detail, 64, 250 + height, 32, 940, bg, 2);
    const drift = animation === "none" ? 0 : Math.sin(frame.progress * Math.PI) * 12;
    const indexes = distinctSceneIndexes(project.scenes, frame.index);
    if (indexes.length === 1) picture(ctx, media[frame.index], 22, 534, 1036, 970, frame.progress, true);
    else if (indexes.length === 2) {
      picture(ctx, media[indexes[0]], 22, 534, 506, 970, frame.progress, true);
      picture(ctx, media[indexes[1]], 552, 534, 506, 970, frame.progress, true);
    } else {
      picture(ctx, media[indexes[0]], 22, 534, 650, 970, frame.progress, true);
      picture(ctx, media[indexes[1]], 694, 534 - drift, 364, 470, frame.progress, true);
      picture(ctx, media[indexes[2]], 694, 1026 + drift, 364, 478, frame.progress, true);
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
      ctx.restore(); if (logo && project.logoThroughout) drawVideoLogo(ctx,logo,W,H,project.logoPosition,project.logoSize); return;
    }
  }
  drawFrame(ctx,project,media,frame,logo);
  if (logo && project.logoThroughout) drawVideoLogo(ctx,logo,W,H,project.logoPosition,project.logoSize);
}
