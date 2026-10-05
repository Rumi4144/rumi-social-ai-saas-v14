import { frameAt, safeColor, wrappedLines, REEL_WIDTH as W, REEL_HEIGHT as H, type ReelProject } from "./timeline";
export type ReelMedia = HTMLImageElement | HTMLVideoElement;
function dimensions(media: ReelMedia) { return media instanceof HTMLVideoElement ? [media.videoWidth, media.videoHeight] : [media.naturalWidth, media.naturalHeight]; }
function picture(ctx: CanvasRenderingContext2D, media: ReelMedia | undefined, x: number, y: number, width: number, height: number, progress: number, contain = false) {
  if (!media) return;
  const [mw, mh] = dimensions(media); if (!mw || !mh) return;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  const scale = (contain ? Math.min(width / mw, height / mh) : Math.max(width / mw, height / mh)) * (contain ? 0.94 : 1 + progress * 0.045);
  ctx.drawImage(media, x + (width - mw * scale) / 2, y + (height - mh * scale) / 2, mw * scale, mh * scale); ctx.restore();
}
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, width: number, color: string, maxLines = 4, align: CanvasTextAlign = "left", serif = false) {
  ctx.font = `${serif ? "italic " : ""}600 ${size}px ${serif ? "Georgia" : "Arial"}`; ctx.fillStyle = color; ctx.textAlign = align;
  const lines = wrappedLines(value, width, text => ctx.measureText(text).width, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * size * 1.16));
  return lines.length * size * 1.16;
}
export function drawReel(ctx: CanvasRenderingContext2D, project: ReelProject, media: ReelMedia[], time: number, logo?: HTMLImageElement) {
  const frame = frameAt(project, time), bg = safeColor(project.color, "#132342"), accent = safeColor(project.accent, "#dec184");
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
    const lift = (1 - Math.min(1, frame.elapsed / 0.6)) * 34;
    const height = text(ctx, scene.headline, 72, 1270 + lift, 84, 920, accent, 3, "left", true);
    text(ctx, scene.detail, 72, 1300 + height + lift, 44, 920, "#ffffff", 3);
  } else if (project.style === "gallery") {
    picture(ctx, media[frame.index], 60, 255, 960, 1070, frame.progress, true);
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(60, 255, 960, 1070);
    text(ctx, project.brand, 72, 145, 36, 930, accent, 1);
    const height = text(ctx, scene.headline, 78, 1450, 76, 920, "#ffffff", 2, "left", true);
    text(ctx, scene.detail, 78, 1480 + height, 40, 920, accent, 2);
  } else {
    // A moving photo collage with a stable caption panel, like the supplied examples.
    ctx.fillStyle = "#edf0e5"; ctx.fillRect(0, 0, W, 510);
    text(ctx, project.brand, 64, 125, 34, 940, bg, 1);
    const height = text(ctx, scene.headline, 64, 245, 70, 940, bg, 2, "left", true);
    text(ctx, scene.detail, 64, 270 + height, 36, 940, bg, 2);
    const drift = Math.sin(frame.progress * Math.PI) * 32;
    picture(ctx, media[frame.index], 22, 534, 650, 970, frame.progress);
    picture(ctx, media[(frame.index + 1) % media.length], 694, 534 - drift, 364, 470, frame.progress);
    picture(ctx, media[(frame.index + media.length - 1) % media.length], 694, 1026 + drift, 364, 478, frame.progress);
    text(ctx, project.cta, 64, 1650, 48, 940, accent, 2);
  }
  if (!frame.closing && frame.elapsed < 0.4) { ctx.fillStyle = bg; ctx.globalAlpha = 1 - frame.elapsed / 0.4; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
}
