import { labCost, labVoices, type LabInput } from "./catalog";

export function speechInputs(input: LabInput) {
  if (!input.voiceId || !(input.voiceId in labVoices) || input.prompt.length > 600) throw new Error("Choose a voice and a script up to 600 characters.");
  return { text: input.prompt, voice_id: input.voiceId, speed: 1, volume: 1, pitch: 0, format: "mp3", language_boost: "English" };
}

export class LabProviderError extends Error {
  constructor(public definitive: boolean) { super("Provider request failed"); }
}
async function json(url: string, key: string, body?: object, bfl = false) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(25000),
    headers: { "Content-Type": "application/json", ...(bfl ? { "x-key": key } : { Authorization: `Bearer ${key}` }) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new LabProviderError([400, 401, 402, 403, 404, 422, 429].includes(response.status));
  const result = await response.json();
  if (result.code !== undefined && result.code !== 200) throw new LabProviderError(false);
  return result;
}
export function bflPollingUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !/^api(?:\.[a-z0-9-]+)?\.bfl\.(?:ai|ml)$/.test(url.hostname) || url.pathname !== "/v1/get_result") throw new Error("Invalid image status address.");
  return url.toString();
}
export async function labQuote(input: LabInput, media?: { image: string; audio: string }) {
  if (input.model === "flux") return 0.009;
  if (input.model !== "speech" && !media) throw new Error("Choose a presenter photo and a voice recording.");
  const response = await json("https://api.wavespeed.ai/api/v3/model/price", process.env.WAVESPEED_API_KEY!, {
    model_id: input.model === "speech" ? "minimax/speech-02-hd" : "wavespeed-ai/infinitetalk-fast",
    inputs: input.model === "speech" ? speechInputs(input) : { image: media!.image, audio: media!.audio, prompt: input.prompt },
  });
  if (response.data?.currency !== "USD") throw new Error("Could not confirm the test price in USD.");
  return labCost(response.data?.discounted_price);
}
export async function labSubmit(input: LabInput, media?: { image: string; audio: string }) {
  if (input.model === "flux") {
    const prompt = `${input.prompt}

Mobile readability guidance: If the requested image includes advertising text, design it to be read comfortably on a phone at feed size. Use a very large bold headline, large supporting text, a prominent call-to-action button, and a clearly readable website address. Use strong text/background contrast, generous line spacing and safe margins. Give the requested lettering enough space; avoid tiny lettering, dense paragraphs, condensed fonts and narrow text columns. Prefer short supporting copy only when the request allows it. Preserve all supplied exact wording and spelling; never silently shorten or omit required text. If necessary, reduce the photograph's share of the layout instead of shrinking the words. Follow any explicit text sizing or layout instructions in the request. If the request is for a clean photo, no text, or no lettering, do not add any text, buttons or website addresses.`;
    const result = await json("https://api.bfl.ai/v1/flux-3-image-klein", process.env.BFL_API_KEY!, {
      prompt, aspect_ratio: "4:5", resolution: "1k", output_format: "png",
    }, true);
    if (typeof result.id !== "string" || typeof result.polling_url !== "string") throw new LabProviderError(false);
    return { taskId: result.id, pollingUrl: bflPollingUrl(result.polling_url) };
  }
  if (input.model !== "speech" && !media) throw new Error("Choose a presenter photo and a voice recording.");
  const response = await json(`https://api.wavespeed.ai/api/v3/${input.model === "speech" ? "minimax/speech-02-hd" : "wavespeed-ai/infinitetalk-fast"}`, process.env.WAVESPEED_API_KEY!,
    input.model === "speech" ? speechInputs(input) : { image: media!.image, audio: media!.audio, prompt: input.prompt });
  const taskId = response.data?.id;
  if (typeof taskId !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(taskId)) throw new LabProviderError(false);
  return { taskId };
}
export async function labPoll(model: LabInput["model"], task: { taskId: string; pollingUrl?: string }) {
  if (model === "flux") {
    const result = await json(bflPollingUrl(task.pollingUrl!), process.env.BFL_API_KEY!, undefined, true);
    if (result.status === "Ready") return { status: "ready", url: result.result?.sample as string };
    if (["Error", "Failed", "Content Moderated", "Request Moderated", "Task not found"].includes(result.status)) return { status: "failed" };
  } else {
    const result = await json(`https://api.wavespeed.ai/api/v3/predictions/${encodeURIComponent(task.taskId)}/result`, process.env.WAVESPEED_API_KEY!);
    if (result.data?.status === "completed") return { status: "ready", url: result.data.outputs?.[0] as string };
    if (["failed", "cancelled", "timeout", "deleted"].includes(result.data?.status)) return { status: "failed" };
  }
  return { status: "running" };
}

export async function labUploadTicket(filename: string, size: number, contentType: string) {
  const result = await json("https://api.wavespeed.ai/api/v3/media/uploads", process.env.WAVESPEED_API_KEY!, { filename, size, content_type: contentType });
  const data = result.data;
  if (typeof data?.download_url !== "string" || typeof data.upload?.url !== "string" || data.upload.method !== "PUT") throw new Error("Could not prepare the upload.");
  for (const value of [data.download_url, data.upload.url]) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Invalid upload address.");
  }
  return data as { download_url: string; upload: { url: string; method: "PUT"; headers: Record<string, string> } };
}
