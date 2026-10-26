import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import { Resvg } from "@resvg/resvg-js";
import { prisma } from "@/lib/prisma";
import { fetchPublicBytes } from "@/lib/reels/public-fetch";
import { videoBytes } from "@/lib/video/media";
import { xOrigin } from "./connection";

export const xHash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export type XMedia = { assetId: string; kind: "photo" | "video"; hash: string };

export function xMediaReference(url: string | null | undefined): Omit<XMedia, "hash"> | null {
  if (!url) return null;
  const parsed = new URL(url, xOrigin());
  if (parsed.origin !== xOrigin() || parsed.username || parsed.password || parsed.hash) throw new Error("Choose a saved Rumi photo or finished reel for X.");
  const video = /^\/api\/video\/media\/([\w-]+)$/.exec(parsed.pathname);
  const photo = /^\/api\/media\/([\w-]+)(?:\/publish)?$/.exec(parsed.pathname);
  if (!video && !photo) throw new Error("Choose a saved Rumi photo or finished reel for X.");
  return { assetId: (video || photo)![1], kind: video ? "video" : "photo" };
}

async function sourceImage(url: string) {
  if (url.length > 28_000_000) throw new Error("The X photo is too large. Choose a smaller saved photo.");
  if (url.startsWith("data:")) {
    const match = /^data:image\/(?:jpeg|png|webp|svg\+xml)(?:;charset=[^;,]+)?;base64,([A-Za-z0-9+/=\s]+)$/.exec(url);
    if (!match) throw new Error("Choose a JPEG, PNG or saved Rumi creative for X.");
    return Buffer.from(match[1], "base64");
  }
  return (await fetchPublicBytes(url, 20_000_000)).bytes;
}

// Render the approved creative itself; never substitute a newer campaign photo.
export async function xPhotoBytes(url: string) {
  let bytes = await sourceImage(url);
  let svg = bytes.toString("utf8");
  if (/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(svg)) {
    if (/<!DOCTYPE|<!ENTITY|<foreignObject|<script|<\?xml-stylesheet/i.test(svg)) throw new Error("Re-export this photo before posting it to X.");
    if ([...svg.matchAll(/url\(([^)]*)\)/gi)].some(match => !/^#[\w-]+$/.test(match[1].trim().replace(/^["']|["']$/g, "")))) throw new Error("Re-export this photo before posting it to X.");
    const references = [...svg.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gs)];
    if (references.length > 12) throw new Error("Re-export this photo before posting it to X.");
    for (const ref of references) {
      const href = ref[2].replace(/&amp;/g, "&");
      if (href.startsWith("#")) continue;
      if (!/^https:\/\//.test(href) && !/^data:image\/(?:png|jpeg|webp);base64,/.test(href)) throw new Error("Re-export this photo before posting it to X.");
      const embedded = await sharp(await sourceImage(href), { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      svg = svg.replace(ref[0], `href="data:image/png;base64,${embedded.toString("base64")}"`);
    }
    const renderer = new Resvg(svg, { fitTo: { mode: "width", value: 1200 }, font: { fontFiles: [join(process.cwd(), "public/fonts/Arial.ttf")], loadSystemFonts: false, defaultFontFamily: "Arial" } });
    if (renderer.width * renderer.height > 20_000_000 || renderer.imagesToResolve().length) throw new Error("Re-export this photo before posting it to X.");
    bytes = Buffer.from(renderer.render().asPng());
  }
  const jpeg = await sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  if (jpeg.length > 5_000_000) throw new Error("The X photo exceeds 5 MB. Choose a smaller photo.");
  return { bytes: jpeg, contentType: "image/jpeg" };
}

export async function xMediaBytes(org: string, contentItemId: string, media: Omit<XMedia, "hash">) {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: media.assetId, organizationId: org, contentItemId, status: "ready", kind: media.kind === "video" ? "campaign_video" : "social_creative" } });
  if (!asset) throw new Error("The selected X photo or reel is unavailable. Save it again and review the post.");
  if (media.kind === "photo") {
    if (!asset.url) throw new Error("The selected X photo is unavailable.");
    return xPhotoBytes(asset.url);
  }
  const result = await videoBytes(asset);
  if (result.contentType !== "video/mp4" || result.bytes.length > 100_000_000) throw new Error("Choose a finished MP4 reel under 100 MB for X.");
  return result;
}
