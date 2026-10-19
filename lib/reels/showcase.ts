import { ease } from "./animation";
import { REEL_WIDTH as W, REEL_HEIGHT as H, type ReelProject, type ReelScene, type ReelAnimation, type frameAt } from "./timeline";
type Media = HTMLImageElement | HTMLVideoElement;
type Picture = (ctx: CanvasRenderingContext2D, media: Media | undefined, x: number, y: number, width: number, height: number, progress: number, contain?: boolean) => void;
type Text = (ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, width: number, color: string, maxLines?: number, align?: CanvasTextAlign, serif?: boolean) => number;
export function showcaseMotion(animation: ReelAnimation, elapsed: number, progress: number, panel: number) {
  if (animation === "none") return { opacity: 1, x: 0, y: 0, angle: panel ? (panel === 1 ? .035 : -.035) : 0 };
  const enter = ease((elapsed - panel * .11) / .7), direction = panel % 2 ? -1 : 1;
  return { opacity: enter, x: (1 - enter) * direction * 50, y: (1 - enter) * 30 + Math.sin(progress * Math.PI) * direction * (panel ? 12 : 5), angle: panel ? direction * (.035 + Math.sin(progress * Math.PI) * .012) : Math.sin(progress * Math.PI) * .004 };
}
/** Every panel uses this scene's source. Detail studies are explicit crops, never other products. */
export function drawShowcase(ctx: CanvasRenderingContext2D, project: ReelProject, scene: ReelScene, source: Media | undefined, frame: ReturnType<typeof frameAt>, bg: string, accent: string, picture: Picture, text: Text) {
  const animation = project.animation || "gentle", still = animation === "none";
  const paper = "#fff6e7", details = project.showcaseDetails === true && scene.kind === "image" && !frame.closing;
  const phase = still ? 0 : frame.progress;
  const glow = ctx.createRadialGradient(380 + phase * 80, 980, 60, 540, 1000, 1100);
  glow.addColorStop(0, accent + "38"); glow.addColorStop(1, bg + "00"); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = accent + "20";
  for (let index = 0; index < 64; index++) { ctx.beginPath(); ctx.arc(45 + (index * 149) % 990, 60 + (index * 233) % 1800, index % 3 ? .7 : 1.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = accent + "70"; ctx.lineWidth = 1; ctx.strokeRect(25, 25, 1030, 1870);
  ctx.strokeStyle = accent; ctx.lineWidth = 2;
  for (const [x, y, dx, dy] of [[48, 48, 90, 70], [1032, 48, -90, 70], [48, 1872, 90, -70], [1032, 1872, -90, -70]]) { ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy); ctx.stroke(); }
  const ornament = (y: number) => { ctx.strokeStyle = accent + "bc"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(345, y); ctx.lineTo(505, y); ctx.moveTo(575, y); ctx.lineTo(735, y); ctx.moveTo(526, y); ctx.lineTo(540, y - 9); ctx.lineTo(554, y); ctx.lineTo(540, y + 9); ctx.closePath(); ctx.stroke(); };
  const panel = (x: number, y: number, width: number, height: number, index: number, contain: boolean) => {
    const motion = showcaseMotion(animation, frame.elapsed, frame.progress, index);
    ctx.save(); ctx.globalAlpha *= motion.opacity;
    ctx.translate(x + width / 2 + motion.x, y + height / 2 + motion.y); ctx.rotate(motion.angle); ctx.translate(-width / 2, -height / 2);
    ctx.shadowColor = "#00000090"; ctx.shadowBlur = 28; ctx.shadowOffsetY = 16; ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect(-7, -7, width + 14, height + 14, index ? 60 : 24); ctx.fill();
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.strokeStyle = accent + (index ? "a0" : "60"); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(0, 0, width, height, index ? 54 : 18); ctx.clip();
    // An optional detail focuses another region of the same photo; no invented reverse view.
    if (index) picture(ctx, source, -width * .35, -height * (index === 2 ? .72 : .08), width * 1.7, height * 1.8, index === 2 ? 1 - frame.progress : frame.progress, false);
    else picture(ctx, source, 0, 0, width, height, frame.progress, contain);
    ctx.restore();
  };
  text(ctx, project.brand.toUpperCase(), 540, 140, 30, 900, accent, 1, "center"); ornament(185);
  if (frame.closing) {
    text(ctx, project.brand, 540, 340, 82, 900, paper, 2, "center", true);
    panel(140, 570, 800, 890, 0, true);
    ornament(1595); text(ctx, project.cta, 540, 1710, 52, 900, paper, 2, "center", true);
  } else {
    text(ctx, scene.headline, 540, 285, 80, 920, paper, 3, "center", true);
    panel(details ? 40 : 80, 570, details ? 640 : 920, 1000, 0, true);
    if (details) {
      panel(660, 595, 340, 380, 1, false); panel(660, 1105, 340, 380, 2, false);
      text(ctx, "DETAIL STUDY / 01", 830, 1020, 18, 340, accent, 1, "center");
      text(ctx, "DETAIL STUDY / 02", 830, 1530, 18, 340, accent, 1, "center");
    }
    text(ctx, scene.detail, 540, 1640, 33, 900, paper, 2, "center"); ornament(1730);
    text(ctx, project.cta, 540, 1800, 43, 900, paper, 1, "center", true);
  }
  text(ctx, project.website, 540, 1850, 25, 900, accent, 1, "center");
}
