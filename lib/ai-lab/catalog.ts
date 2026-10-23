export const labModels = {
  holding: { name: "Presenter holding a product", provider: "WaveSpeedAI · FLUX", model: "wavespeed-ai/flux-2-klein-4b/edit", kind: "image", estimateUsd: 0.012, source: "https://wavespeed.ai/docs/docs-api/wavespeed-ai/flux-2-klein-4b-edit" },
  flux: { name: "FLUX image", provider: "Black Forest Labs", model: "flux-3-image-klein", kind: "image", estimateUsd: 0.009, source: "https://docs.bfl.ai/flux_3/flux3_image_klein" },
  infinitetalk: { name: "InfiniteTalk Fast", provider: "WaveSpeedAI", model: "wavespeed-ai/infinitetalk-fast", kind: "video", estimateUsd: 0.225, source: "https://wavespeed.ai/models/wavespeed-ai/infinitetalk-fast" },
  speech: { name: "AI voice", provider: "WaveSpeedAI", model: "minimax/speech-02-hd", kind: "audio", estimateUsd: 0.02, source: "https://wavespeed.ai/models/minimax/speech-02-hd" },
} as const;
export type LabModel = keyof typeof labModels;
export const labVoices = { Friendly_Person: "Friendly · conversational", Casual_Guy: "Casual man", Wise_Woman: "Warm woman", Elegant_Man: "Polished man", Calm_Woman: "Calm woman", Patient_Man: "Patient man", Deep_Voice_Man: "Deep male voice" } as const;
export const labVoiceStyles = {neutral:"Conversational",happy:"Warm and upbeat"} as const;
export const labAccents = {original:"Original voice",american:"American English",british:"British English",australian:"Australian English · male voices",indian:"Indian English · male voices"} as const;
// Documented regional speakers, not a language_boost substitution or accent-transfer promise.
// https://wavespeed.ai/docs/docs-api/minimax/minimax_speech_voice_id
const regionalVoices: Record<Exclude<keyof typeof labAccents,"original">,Partial<Record<keyof typeof labVoices,string>>> = {
  american:{Friendly_Person:"English_FriendlyPerson",Casual_Guy:"English_FriendlyPerson",Wise_Woman:"English_Friendly_Female_3",Elegant_Man:"English_Trustworth_Man",Calm_Woman:"English_CalmWoman",Patient_Man:"English_Gentle-voiced_man",Deep_Voice_Man:"English_ManWithDeepVoice"},
  british:{Friendly_Person:"English_DecentYoungMan",Casual_Guy:"English_DecentYoungMan",Wise_Woman:"English_Wiselady",Elegant_Man:"English_MaturePartner",Calm_Woman:"English_Graceful_Lady",Patient_Man:"English_PatientMan",Deep_Voice_Man:"English_Deep-VoicedGentleman"},
  australian:{Friendly_Person:"English_Aussie_Bloke",Casual_Guy:"English_Aussie_Bloke",Elegant_Man:"English_Aussie_Bloke",Patient_Man:"English_Aussie_Bloke",Deep_Voice_Man:"English_Aussie_Bloke"},
  indian:{Friendly_Person:"English_Diligent_Man",Casual_Guy:"English_Diligent_Man",Elegant_Man:"English_Diligent_Man",Patient_Man:"English_GentleTeacher",Deep_Voice_Man:"English_Diligent_Man"},
};
export function labAccentAvailable(voice:keyof typeof labVoices,accent:keyof typeof labAccents){return accent==="original" || Boolean(regionalVoices[accent]?.[voice]);}
export function labAccentVoice(voice:keyof typeof labVoices,accent:keyof typeof labAccents="original"){
  if(accent==="original")return voice;
  const id=regionalVoices[accent]?.[voice];if(!id)throw new Error("This accent is not available for the chosen voice. Choose another accent or voice.");return id;
}
export type LabInput = { model: LabModel; prompt: string; imageAssetId?: string; productAssetId?: string; productReviewed?: boolean; audioAssetId?: string; voiceId?: keyof typeof labVoices; voiceAccent?: keyof typeof labAccents; voiceEmotion?: keyof typeof labVoiceStyles; voiceSpeed?: number; campaignId?: string; contentItemId?: string };
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
