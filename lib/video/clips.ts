export const MAX_CLIP_BYTES = 3 * 1024 * 1024;

export function decodeClip(dataUrl: string): { bytes: Buffer; contentType: string } {
  const match = dataUrl.match(/^data:(video\/(?:mp4|webm));base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match || match[2].length > Math.ceil(MAX_CLIP_BYTES / 3) * 4) throw new Error("Choose an MP4 or WebM clip up to 3 MB.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > MAX_CLIP_BYTES || bytes.toString("base64") !== match[2]) throw new Error("Invalid video file.");
  const mp4 = bytes.length > 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
  const webm = bytes.length > 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if ((match[1] === "video/mp4" && !mp4) || (match[1] === "video/webm" && !webm)) throw new Error("The file does not match its video format.");
  return { bytes, contentType: match[1] };
}

export function videoMotionPrompt(prompt: string): string {
  return `${prompt.trim()}\nPreserve the source image's subject, identity, product construction and proportions. Use restrained natural motion; do not introduce another product, chair, equipment, service, logo, or text. Do not imply a real customer testimonial or invent performance claims.`.slice(0, 1000);
}
