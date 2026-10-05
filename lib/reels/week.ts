import type { ReelProject, ReelStyle } from "./timeline";
export const WEEK_THEMES = ["Meet the collection", "Look at the details", "Find your style", "A closer look", "Questions to ask", "Weekend inspiration", "Explore what’s next"];
export type WeekDay = { date: string; label: string; headline: string; caption: string; contentItemId?: string; assetId?: string; downloadUrl?: string; pathname?: string; project: ReelProject };
export function weekDates(start: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error("Choose a valid start date.");
  const date = new Date(`${start}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== start) throw new Error("Choose a valid start date.");
  return Array.from({length:7},(_,index)=>{const value=new Date(date);value.setUTCDate(value.getUTCDate()+index);return {date:value.toISOString().slice(0,10),label:value.toLocaleDateString("en-US",{weekday:"long",timeZone:"UTC"})};});
}
export function makeWeek(project: ReelProject, start: string): WeekDay[] {
  const dates=weekDates(start);
  if (!project.scenes.length) throw new Error("Add at least one photo or clip first.");
  const styles: ReelStyle[]=["cinematic","editorial","gallery","cinematic","gallery","editorial","cinematic"];
  const details=[`Discover more at ${project.brand}.`,"Take a moment to notice the design.","Which details matter most to you?","See the collection from another angle.","Ask us about the options before choosing.","Make time for something you enjoy.",`Visit ${project.brand} to explore more.`];
  return dates.map((date,index)=>({ ...date,headline:WEEK_THEMES[index],caption:`${WEEK_THEMES[index]}. ${details[index]} ${project.website}`.trim(),project:{...project,style:styles[index],scenes:project.scenes.slice(0,3).map((_,sceneIndex)=>({...project.scenes[(index+sceneIndex)%project.scenes.length],id:`day-${index}-scene-${sceneIndex}`,headline:sceneIndex===0?WEEK_THEMES[index]:project.scenes[(index+sceneIndex)%project.scenes.length].headline,detail:sceneIndex===0?details[index]:project.scenes[(index+sceneIndex)%project.scenes.length].detail,seconds:project.scenes[(index+sceneIndex)%project.scenes.length].kind === "video" ? Math.min(15,Math.max(4,project.scenes[(index+sceneIndex)%project.scenes.length].seconds)) : 4}))}}));
}
