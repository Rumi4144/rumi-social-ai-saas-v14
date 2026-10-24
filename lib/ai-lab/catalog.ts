export const labModels = {
  kling: { name: "Kling Avatar Standard", provider: "WaveSpeedAI", model: "kwaivgi/kling-v1-ai-avatar-standard", kind: "video", estimateUsd: 0.75, source: "https://wavespeed.ai/models/kwaivgi/kling-v1-ai-avatar-standard" },
  holding: { name: "Presenter holding a product", provider: "WaveSpeedAI · FLUX", model: "wavespeed-ai/flux-2-klein-4b/edit", kind: "image", estimateUsd: 0.012, source: "https://wavespeed.ai/docs/docs-api/wavespeed-ai/flux-2-klein-4b-edit" },
  flux: { name: "FLUX image", provider: "Black Forest Labs", model: "flux-3-image-klein", kind: "image", estimateUsd: 0.009, source: "https://docs.bfl.ai/flux_3/flux3_image_klein" },
  infinitetalk: { name: "InfiniteTalk Fast", provider: "WaveSpeedAI", model: "wavespeed-ai/infinitetalk-fast", kind: "video", estimateUsd: 0.225, source: "https://wavespeed.ai/models/wavespeed-ai/infinitetalk-fast" },
  speech: { name: "AI voice", provider: "WaveSpeedAI", model: "minimax/speech-02-hd", kind: "audio", estimateUsd: 0.02, source: "https://wavespeed.ai/models/minimax/speech-02-hd" },
} as const;
export type LabModel = keyof typeof labModels;
export const labVoices = { Friendly_Person: "Friendly · conversational", Casual_Guy: "Casual man", Wise_Woman: "Warm woman", Elegant_Man: "Polished man", Calm_Woman: "Calm woman", Patient_Man: "Patient man", Deep_Voice_Man: "Deep male voice" } as const;
export const labVoiceStyles = {neutral:"Conversational",happy:"Warm and upbeat"} as const;
export const labAccents = {original:"Original voice",american:"American English",british:"British English",australian:"Australian English · male voices",indian:"Indian English · male voices",southern:"Cowboy / Southern English · male voices",french:"French speaker · English preview",persian:"Persian speaker · English preview",spanish:"Spanish speaker · English preview",italian:"Italian speaker · English preview"} as const;
// Documented regional speakers, not a language_boost substitution or accent-transfer promise.
// https://wavespeed.ai/docs/docs-api/minimax/minimax_speech_voice_id
const regionalVoices: Partial<Record<Exclude<keyof typeof labAccents,"original">,Partial<Record<keyof typeof labVoices,string>>>> = {
  american:{Friendly_Person:"English_FriendlyPerson",Casual_Guy:"English_FriendlyPerson",Wise_Woman:"English_Friendly_Female_3",Elegant_Man:"English_Trustworth_Man",Calm_Woman:"English_CalmWoman",Patient_Man:"English_Gentle-voiced_man",Deep_Voice_Man:"English_ManWithDeepVoice"},
  british:{Friendly_Person:"English_DecentYoungMan",Casual_Guy:"English_DecentYoungMan",Wise_Woman:"English_Wiselady",Elegant_Man:"English_MaturePartner",Calm_Woman:"English_Graceful_Lady",Patient_Man:"English_PatientMan",Deep_Voice_Man:"English_Deep-VoicedGentleman"},
  australian:{Friendly_Person:"English_Aussie_Bloke",Casual_Guy:"English_Aussie_Bloke",Elegant_Man:"English_Aussie_Bloke",Patient_Man:"English_Aussie_Bloke",Deep_Voice_Man:"English_Aussie_Bloke"},
  southern:Object.fromEntries(["Friendly_Person","Casual_Guy","Elegant_Man","Patient_Man","Deep_Voice_Man"].map(voice=>[voice,"moss_audio_076697ad-7144-11f0-a447-9613c873494c"])),
  indian:{Friendly_Person:"English_Diligent_Man",Casual_Guy:"English_Diligent_Man",Elegant_Man:"English_Diligent_Man",Patient_Man:"English_GentleTeacher",Deep_Voice_Man:"English_Diligent_Man"},
};
export const labAccentSpeakers: Partial<Record<keyof typeof labAccents,Record<string,{label:string;gender:"male"|"female"}>>> = {
  french:{French_CasualMan:{label:"Relaxed man",gender:"male"},French_MaleNarrator:{label:"Male narrator",gender:"male"},"French_Female_News Anchor":{label:"Calm female presenter",gender:"female"},French_MovieLeadFemale:{label:"Cinematic female voice",gender:"female"}},
  persian:{Persian_male_1_v1:{label:"Steady man",gender:"male"},Persian_female_1_v1:{label:"Clear female presenter",gender:"female"}},
  spanish:{Spanish_ReservedYoungMan:{label:"Quiet, reserved man",gender:"male"},Spanish_CaptivatingStoryteller:{label:"Male storyteller / narrator",gender:"male"},Spanish_SereneWoman:{label:"Calm female voice",gender:"female"},Spanish_ElegantGirl:{label:"Dramatic female voice",gender:"female"}},
  italian:{Italian_ReliableMan:{label:"Confident man",gender:"male"},Italian_Narrator:{label:"Male narrator",gender:"male"},Italian_DiligentLeader:{label:"Calm female voice",gender:"female"},Italian_ArrogantPrincess:{label:"Passionate female character",gender:"female"}},
};
export function labAccentVoice(voice:keyof typeof labVoices,accent:keyof typeof labAccents="original",speaker?:string){
  const options=labAccentSpeakers[accent];
  if(speaker){if(!options || !Object.hasOwn(options,speaker))throw new Error("Choose a speaker available for this accent.");return speaker;}
  if(accent==="original")return voice;
  if(options){const gender=voice==="Wise_Woman"||voice==="Calm_Woman"?"female":"male";const id=Object.keys(options).find(id=>options[id].gender===gender);if(id)return id;}
  const id=regionalVoices[accent]?.[voice];if(!id)throw new Error("This accent is not available for the chosen voice. Choose another accent or voice.");return id;
}
export function labAccentAvailable(voice:keyof typeof labVoices,accent:keyof typeof labAccents,speaker?:string){try{labAccentVoice(voice,accent,speaker);return true;}catch{return false;}}
export type LabInput = { model: LabModel; prompt: string; imageAssetId?: string; productAssetId?: string; productLayout?: "beside"; holdingPose?: "guitar" | "guitar-standing-strum" | "reference"; productReviewed?: boolean; audioAssetId?: string; voiceId?: keyof typeof labVoices; voiceAccent?: keyof typeof labAccents; accentSpeaker?: string; voiceEmotion?: keyof typeof labVoiceStyles; voiceSpeed?: number; campaignId?: string; contentItemId?: string };
export function labConfigured(model: LabModel) {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN && (model === "flux" ? process.env.BFL_API_KEY : process.env.WAVESPEED_API_KEY));
}
export function labCanRun(role: string, isSuperAdmin = false) { return isSuperAdmin === true || role === "superadmin"; }
export function labDailyLimit() {
  const value = Number(process.env.AI_LAB_DAILY_USD || "2");
  return Number.isFinite(value) && value > 0 ? Math.min(value, 10) : 2;
}
export function labCost(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("This test exceeds the $1 provider estimate limit.");
  return Math.ceil(value * 1_000_000) / 1_000_000;
}
