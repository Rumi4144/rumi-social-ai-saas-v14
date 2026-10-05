export function presenterCost(duration:5|10|15, portrait:boolean){return 280+(duration-5)*48+(portrait?16:0);}
export const PRESENTER_LOOKS = {
 woman:"A fictional adult woman, friendly music-store presenter, waist-up, clear unobstructed face, warm neutral showroom, natural lighting, no product, no text, no famous-person likeness.",
 man:"A fictional adult man, friendly music-store presenter, waist-up, clear unobstructed face, warm neutral showroom, natural lighting, no product, no text, no famous-person likeness.",
 neutral:"A fictional adult presenter with an androgynous appearance, approachable, waist-up, clear unobstructed face, neutral showroom, natural lighting, no product, no text, no famous-person likeness."
};
export function presenterConcept(script:string){return `A friendly presenter introduces the exact product from the product reference image. Keep its shape, colors, proportions, visible hardware and markings faithful. Present beside it or hold it gently; do not invent a different product. Speak this script: ${script}\nNatural conversational delivery. No invented testimonials, credentials, performance claims, prices or discounts. Do not simulate the sound of an instrument. No on-screen text.`;}
