export const INDUSTRIES = [
  "E-commerce & Retail", "Professional Services", "Health & Wellness",
  "Education & Coaching", "Technology & SaaS", "Music & Arts",
  "Real Estate", "Food & Hospitality", "Travel & Lifestyle", "Creator / Personal Brand",
] as const;
export type Industry = typeof INDUSTRIES[number];
export const INDUSTRY_REEL_DEFAULTS = {
  "E-commerce & Retail": { style: "spotlight", music: "ambient" },
  "Professional Services": { style: "boutique", music: "piano" },
  "Health & Wellness": { style: "boutique", music: "ocean-waves" },
  "Education & Coaching": { style: "minimal", music: "ambient" },
  "Technology & SaaS": { style: "bold", music: "ambient" },
  "Music & Arts": { style: "boutique", music: "classical" },
  "Real Estate": { style: "gallery", music: "piano" },
  "Food & Hospitality": { style: "bold", music: "bossa" },
  "Travel & Lifestyle": { style: "cinematic", music: "folk" },
  "Creator / Personal Brand": { style: "bold", music: "pop" },
} as const;
export function industryReelDefaults(value?: string | null) {
  return value && Object.prototype.hasOwnProperty.call(INDUSTRY_REEL_DEFAULTS, value) ? INDUSTRY_REEL_DEFAULTS[value as Industry] : undefined;
}
