export function presenterCost(duration:5|10|15, portrait:boolean){return 280+(duration-5)*48+(portrait?16:0);}
export const PRESENTER_LOOKS = {
 woman:"A fictional adult woman, friendly music-store presenter, waist-up, clear unobstructed face, warm neutral showroom, natural lighting, no product, no text, no famous-person likeness.",
 man:"A fictional adult man, friendly music-store presenter, waist-up, clear unobstructed face, warm neutral showroom, natural lighting, no product, no text, no famous-person likeness.",
 neutral:"A fictional adult presenter with an androgynous appearance, approachable, waist-up, clear unobstructed face, neutral showroom, natural lighting, no product, no text, no famous-person likeness."
};
export const PRESENTER_DELIVERIES = {
 natural:"Natural conversational English, warm and clear.",
 spanish:"English with a light Spanish accent, warm and clear.",
 relaxed:"Relaxed conversational English, friendly and clear.",
 british:"British English accent, warm and clear.",
 australian:"Australian English accent, warm and clear.",
 french:"English with a light French accent, warm and clear.",
 cowboy:"English with a warm Southern American country accent, a gentle drawl and friendly conversational delivery. Keep it natural and clear, without exaggeration.",
 newyork:"English with a natural New York City accent, friendly conversational delivery and clear pronunciation. Keep it subtle, without exaggerated stereotypes."
};
export function presenterConcept(script:string,delivery:keyof typeof PRESENTER_DELIVERIES="natural"){return `A friendly presenter introduces the exact product from the product reference image. Keep its shape, colors, proportions, visible hardware and markings faithful. Present beside it or hold it gently; do not invent a different product. Voice direction (instructions only; do not say these words): ${PRESENTER_DELIVERIES[delivery]} Keep every word easy to understand.\nSpeak only this script: ${JSON.stringify(script)}\nNo invented testimonials, credentials, performance claims, prices or discounts. Do not simulate the sound of an instrument. No on-screen text.`;}
