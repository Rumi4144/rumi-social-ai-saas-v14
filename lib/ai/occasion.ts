import type { VisualConcept } from "./visual-plan";
import type { ContentSlot } from "@/lib/campaign/content-plan";

const themes: Record<string,string> = {
  "new year's day":"A joyful fresh-year celebration with tasteful confetti and festive lights; no dates or numbers rendered in the photo.",
  "martin luther king jr. day":"A respectful multigenerational community service scene communicating equality, dignity and mutual support. Do not invent a photograph of Martin Luther King Jr.",
  "presidents day":"A tasteful American civic setting with a U.S. flag and classical public architecture, no invented presidential portraits or political endorsements.",
  "memorial day":"A quiet American remembrance scene with a respectfully displayed U.S. flag and flowers; solemn gratitude, no party, fireworks or sales celebration.",
  "juneteenth":"An authentic, joyful Black community gathering communicating freedom, dignity and connection; no stereotypes or invented historical documentary scenes.",
  "independence day":"An unmistakable U.S. Fourth of July scene with a correctly represented American flag and tasteful outdoor celebration or fireworks.",
  "labor day":"An authentic scene recognizing the contributions of working people; depict meaningful everyday work and community, not unrelated wellness imagery.",
  "columbus day":"An editorial still-life of a historical sailing-ship model and an unlettered map, communicating the named historical observance. No triumphalist conquest imagery, invented historical photographs or Indigenous stereotypes.",
  "veterans day":"A respectful American remembrance scene with a U.S. flag and flowers recognizing service; no invented identifiable veterans, medals, ranks or endorsements.",
  "thanksgiving":"A welcoming autumn Thanksgiving table with seasonal harvest details and a sense of gratitude and togetherness; no generic desk, coffee cup or unrelated product hero.",
  "christmas day":"A warm festive Christmas scene with an evergreen tree, soft lights and tasteful seasonal decorations; no unrelated holiday symbols.",
  "christmas eve":"A peaceful Christmas evening with an evergreen tree, warm lights and seasonal decorations.",
  "halloween":"A tasteful autumn Halloween scene with pumpkins and gentle festive lighting; keep it welcoming, not frightening or graphic.",
  "valentine's day":"A warm, inclusive scene of care or affection with tasteful flowers and heart-shaped details, without invented customers or testimonials.",
  "world kindness day":"A candid, clearly visible act of kindness between people, such as helping carry groceries or offering support; kindness is the primary visual idea.",
  "global wellness day":"A welcoming scene of people enjoying an accessible gentle outdoor wellness activity; no medical equipment, invented treatment or guaranteed outcome.",
  "world mental health day":"A supportive human connection or attentive conversation in a calm everyday setting; dignity and care, no distress spectacle, diagnosis or promised cure.",
  "world meditation day":"A natural, quiet moment of mindful attention in a peaceful setting, without invented clinical treatment or claims of guaranteed relief.",
};

export function occasionVisualConcept(occasion:string):VisualConcept {
  const label=occasion.trim().slice(0,100);
  const theme=themes[label.toLowerCase()] || `Choose a recognizable, respectful subject specifically representing ${label}. Derive the scene from the named occasion, not a generic campaign topic. Do not invent the details of a custom business event.`;
  return {subjectCategory:"environment",direction:`OCCASION PHOTO — PRIMARY SUBJECT: ${label}. ${theme} The occasion must be recognizable without reading the headline. Keep this business's branding and facts separate from other businesses. Never imply that people shown are actual clients or staff.`};
}

export function savedPostOccasion(payload:unknown,result:unknown,item:{type:string;headline?:string|null;caption?:string|null}):string|undefined {
  if(item.type!=="holiday_post")return undefined;
  const posts=(result as {posts?:Array<{planKey?:string;type?:string;headline?:string;caption?:string}>})?.posts;
  const slots=(payload as {contentPlan?:ContentSlot[]})?.contentPlan;
  if(!Array.isArray(posts)||!Array.isArray(slots))return undefined;
  const post=posts.find(post=>post.type===item.type && post.headline===item.headline && post.caption===item.caption);
  const label=slots.find(slot=>slot.planKey===post?.planKey && slot.extra)?.occasion;
  return typeof label==="string" && label.trim()?label.trim().slice(0,100):undefined;
}
