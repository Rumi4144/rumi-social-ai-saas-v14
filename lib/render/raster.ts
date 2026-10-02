import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { join } from "path";

export async function imageToJpegDataUrl(url: string): Promise<string> {
  let bytes: Buffer;
  if (url.startsWith("data:")) {
    const match = url.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/s);
    if (!match) throw new Error("INVALID_IMAGE_DATA_URL");
    bytes = Buffer.from(match[2], "base64");
  } else {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 RumiSocialAI/3.0", Accept: "image/*" },
    });
    if (!response.ok) throw new Error(`SOURCE_IMAGE_FETCH_FAILED_${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }

  const jpeg = await sharp(bytes)
    .rotate()
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

export async function svgToPublishJpeg(svg: string): Promise<Buffer> {
  const fontPath = join(process.cwd(), "public", "fonts", "Arial.ttf");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: {
      fontFiles: [fontPath],
      loadSystemFonts: false,
      defaultFontFamily: "Arial",
      sansSerifFamily: "Arial",
      serifFamily: "Arial",
    },
  });
  const png = Buffer.from(resvg.render().asPng());
  return sharp(png)
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}
