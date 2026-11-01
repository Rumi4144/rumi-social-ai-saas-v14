import { WEEKLY_CREDIT_COST } from "../billing/packages";

const preparation = WEEKLY_CREDIT_COST.packCopy + WEEKLY_CREDIT_COST.postPreparation;
export const extraOptions = {
  ad: { label: "Image ad", description: "A branded design and caption.", credits: preparation },
  reel: { label: "Extra reel", description: "Three scenes, music and short captions · 15 seconds.", credits: preparation + WEEKLY_CREDIT_COST.motionReelCompletion },
  presenter: { label: "Talking presenter", description: "An AI presenter speaking your short script.", credits: 30 },
} as const;
export type ExtraKind = keyof typeof extraOptions;
export const presenterChoices = { alex: { name: "Alex", image: "/presenters/extra-alex.png", voice: "Wise_Woman" }, morgan: { name: "Morgan", image: "/presenters/extra-morgan.png", voice: "Friendly_Person" } } as const;
export type PresenterChoice = keyof typeof presenterChoices;
export const PRESENTER_SCRIPT_LIMIT = 180;
export const PRESENTER_WORD_LIMIT = 35;
