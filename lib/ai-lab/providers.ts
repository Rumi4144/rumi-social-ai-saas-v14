import { labModels, labCost, labVoices, labVoiceStyles, labAccentVoice, type LabInput } from "./catalog";

export function speechInputs(input: LabInput) {
  if (!input.voiceId || !(input.voiceId in labVoices) || input.prompt.length > 600) throw new Error("Choose a voice and a script up to 600 characters.");
  const speed = input.voiceSpeed ?? 1, emotion = input.voiceEmotion ?? "neutral";
  if (!Number.isFinite(speed) || speed < 0.85 || speed > 1.15 || !(emotion in labVoiceStyles)) throw new Error("Choose a supported speaking style and pace.");
  return { text: input.prompt, voice_id: labAccentVoice(input.voiceId,input.voiceAccent,input.accentSpeaker), speed, emotion, volume: 1, pitch: 0, sample_rate: 44100, bitrate: 128000, english_normalization: true, format: "mp3", language_boost: "English" };
}
export type LabMedia = { image: string; audio?: string; product?: string };
export function holdingInputs(input: LabInput, media?: LabMedia) {
  if (!media?.image || !media.product) throw new Error("Choose a presenter photo and product photo.");
  const pose = input.holdingPose === "reference"
    ? "Match the reference product's real-world scale, with a natural holding pose and enough room to show it clearly."
    : input.holdingPose === "guitar-standing-strum"
    ? "This is a FULL-SIZE ADULT GUITAR. Compose a medium-wide standing portrait from head to below the knees, with the entire guitar visible. The presenter stands upright, with a natural guitar strap over the shoulder supporting the guitar at waist height. The neck extends sideways and slightly upward. One hand holds the neck naturally; the other is poised mid-strum over the strings near the soundhole or pickups, as a still photograph of a light strum. Preserve the presenter's identity and the exact guitar from image 2, including body-to-neck proportions and hardware. Keep the full headstock, neck, bridge and body visible. Widen the camera framing instead of shrinking the full-size instrument. No chair, stool, sitting, kneeling, miniature guitar or shortened neck."
    : "This is a FULL-SIZE ADULT GUITAR, not a baby guitar, ukulele, toy, miniature or travel instrument. Compose a medium-wide seated portrait, showing the person from head to mid-thigh and the entire guitar. Move the camera farther away and expand the scene instead of shrinking the instrument to fit a headshot. Rest the guitar body across the presenter's lap in a natural playing-position holding pose, with its full-length neck extending sideways and slightly upward. One hand supports the neck and the other rests naturally on the body; the person is presenting it, not performing. Preserve the exact body-to-neck proportions from image 2. The full-size guitar body spans much of the adult torso/lap; do not reduce it to a hand-sized object held upright against the face. Keep the headstock, full neck, bridge and entire body visible with comfortable margins. If the guitar cannot fit, widen the framing, never shorten the neck or reduce its scale.";
  return { images: [media.image, media.product], size: "768*1024", prompt: `Create a photorealistic product advertisement photo. Image 1 supplies ONLY the presenter's identity, face, hair, clothing and setting. Preserve that identity, but change pose and camera distance as needed. Image 2 is the exact product reference and determines its geometry, finish and hardware. ${pose} Preserve the product's exact visible shape, color, finish, proportions, markings and hardware. For a guitar, preserve the body shape, headstock, strings, pickups, bridge and cutaways. Use anatomically correct hands and believable support. Keep the face unobstructed and directed toward the camera. No text, extra products, invented guitar parts or extra fingers. Additional composition direction: ${input.prompt}` };

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
export async function labQuote(input: LabInput, media?: LabMedia) {
  if (input.model === "flux") return 0.009;
  if (input.model !== "speech" && !media) throw new Error("Choose a presenter photo and a voice recording.");
  const response = await json("https://api.wavespeed.ai/api/v3/model/price", process.env.WAVESPEED_API_KEY!, {
    model_id: labModels[input.model].model,
    inputs: input.model === "holding" ? holdingInputs(input, media) : input.model === "speech" ? speechInputs(input) : { image: media!.image, audio: media!.audio, prompt: input.prompt },
  });
  if (response.data?.currency !== "USD") throw new Error("Could not confirm the test price in USD.");
  return labCost(response.data?.discounted_price);
}
export async function labSubmit(input: LabInput, media?: LabMedia) {
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
  const response = await json(`https://api.wavespeed.ai/api/v3/${labModels[input.model].model}`, process.env.WAVESPEED_API_KEY!,
    input.model === "holding" ? holdingInputs(input, media) : input.model === "speech" ? speechInputs(input) : { image: media!.image, audio: media!.audio, prompt: input.prompt });
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
