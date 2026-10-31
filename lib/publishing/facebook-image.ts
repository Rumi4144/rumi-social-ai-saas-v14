// Saved creatives may use relative URLs; server-side fetch needs an absolute URL.
export function facebookImageUrl(mediaUrl: string): URL {
  const app = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://rumisocialai.com");
  const image = new URL(mediaUrl, app);
  if (image.protocol !== "https:" || image.username || image.password) {
    throw new Error("Facebook requires a public HTTPS image URL.");
  }
  if (image.origin === app.origin) {
    image.pathname = image.pathname.replace(/^\/api\/media\/([^/]+)(?:\/publish)?$/, "/api/media/$1/publish");
  }
  return image;
}
