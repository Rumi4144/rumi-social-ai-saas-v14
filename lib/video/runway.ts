const base = "https://api.dev.runwayml.com/v1";
export class RunwayError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function runwayApiKey() { return process.env.RUNWAY_PRODUCTION_API_KEY || process.env.RUNWAY_API_KEY; }
export function runwayConfigured() { return Boolean(runwayApiKey() && process.env.BLOB_READ_WRITE_TOKEN); }
export function runwayModel() {
  const model = process.env.RUNWAY_VIDEO_MODEL || "gen4.5";
  if (model !== "gen4.5" && model !== "gen4_turbo") throw new Error("Unsupported Runway model configuration.");
  return model;
}
export function validImage(value: string) {
  if (value.length > 3_000_000) return false;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      url.hostname.includes(".") && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) && !url.hostname.endsWith(".local");
  } catch { return false; }
}
async function request(path: string, body?: object) {
  if (!runwayApiKey()) throw new Error("Runway is not configured.");
  const response = await fetch(`${base}/${path}`, {
    method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${runwayApiKey()}`, "Content-Type": "application/json", "X-Runway-Version": "2024-11-06" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403 ? "Runway credentials need attention. Contact your administrator." :
      response.status === 429 ? "Runway is busy or out of API credits. Try later." :
      response.status === 400 ? "Runway rejected the image or prompt. Check your input." : "Runway could not complete this request.";
    throw new RunwayError(response.status, message);
  }
  return response.json();
}
export async function createVideoTask(input: { imageUrl: string; prompt: string; duration: 5 | 10; ratio: "720:1280" | "1280:720"; model?: string }) {
  const data = await request("image_to_video", { model: input.model || runwayModel(), promptImage: input.imageUrl, promptText: input.prompt, duration: input.duration, ratio: input.ratio });
  if (typeof data.id !== "string" || !/^[a-f0-9-]{36}$/i.test(data.id)) throw new Error("Runway did not confirm the task ID.");
  return { id: data.id as string };
}
export async function getVideoTask(id: string): Promise<{ status: string; progress?: number; output?: string[]; failureCode?: string }> {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid Runway task.");
  return request(`tasks/${id}`);
}
export async function createPresenterPortrait(look: string) {
  const data=await request("text_to_image",{model:"gen4_image",ratio:"1080:1920",promptText:look});
  if(typeof data.id!=="string"||!/^[a-f0-9-]{36}$/i.test(data.id))throw new Error("Runway did not confirm the portrait task.");
  return {id:data.id as string};
}
export async function createPresenterVideo(input:{characterImage:string;productImage:string;productInfo:string;concept:string;duration:5|10|15}){
 const data=await request("recipes/product_ugc",{version:"2026-06",characterImage:{uri:input.characterImage},productImage:{uri:input.productImage},productInfo:input.productInfo.slice(0,2500),userConcept:input.concept.slice(0,3500),duration:input.duration,ratio:"720:1280",audio:true});
 if(typeof data.id!=="string"||!/^[a-f0-9-]{36}$/i.test(data.id))throw new Error("Runway did not confirm the presenter task.");
 return {id:data.id as string};
}
export function validRunwayOutput(value:string){try{const u=new URL(value);return u.protocol==="https:"&&!u.username&&!u.password&&[".cloudfront.net",".amazonaws.com",".runwayml.com",".runway.com"].some(host=>u.hostname.endsWith(host));}catch{return false;}}
