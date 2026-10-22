export const labModels = {
  holding: { name: "Presenter holding a product", provider: "WaveSpeedAI · FLUX", model: "wavespeed-ai/flux-2-klein-4b/edit", kind: "image", estimateUsd: 0.012, source: "https://wavespeed.ai/docs/docs-api/wavespeed-ai/flux-2-klein-4b-edit" },
  flux: { name: "FLUX image", provider: "Black Forest Labs", model: "flux-3-image-klein", kind: "image", estimateUsd: 0.009, source: "https://docs.bfl.ai/flux_3/flux3_image_klein" },
  infinitetalk: { name: "InfiniteTalk Fast", provider: "WaveSpeedAI", model: "wavespeed-ai/infinitetalk-fast", kind: "video", estimateUsd: 0.225, source: "https://wavespeed.ai/models/wavespeed-ai/infinitetalk-fast" },
  speech: { name: "AI voice", provider: "WaveSpeedAI", model: "minimax/speech-02-hd", kind: "audio", estimateUsd: 0.02, source: "https://wavespeed.ai/models/minimax/speech-02-hd" },
} as const;
export type LabModel = keyof typeof labModels;
export const labVoices = { Friendly_Person: "Friendly · conversational", Casual_Guy: "Casual man", Wise_Woman: "Warm woman", Elegant_Man: "Polished man", Calm_Woman: "Calm woman", Patient_Man: "Patient man", Deep_Voice_Man: "Deep male voice" } as const;
export const labVoiceStyles = {neutral:"Conversational",happy:"Warm and upbeat"} as const;
export type LabInput = { model: LabModel; prompt: string; imageAssetId?: string; productAssetId?: string; productReviewed?: boolean; audioAssetId?: string; voiceId?: keyof typeof labVoices; voiceEmotion?: keyof typeof labVoiceStyles; voiceSpeed?: number; campaignId?: string; contentItemId?: string };
export function labConfigured(model: LabModel) {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN && (model === "flux" ? process.env.BFL_API_KEY : process.env.WAVESPEED_API_KEY));
}
export function labCanRun(role: string) { return ["owner", "admin", "superadmin"].includes(role); }
export function labDailyLimit() {
  const value = Number(process.env.AI_LAB_DAILY_USD || "2");
  return Number.isFinite(value) && value > 0 ? Math.min(value, 10) : 2;
}
export function labCost(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("This test exceeds the $1 provider estimate limit.");
  return Math.ceil(value * 1_000_000) / 1_000_000;
}
