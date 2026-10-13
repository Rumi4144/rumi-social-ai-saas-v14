import { CONTENT_TYPES } from "./content-plan";

export function campaignSummary(payload: unknown, items: Array<{type:string;scheduledFor?:Date|null}>) {
  const plan=payload && typeof payload === "object" ? payload as {days?:number;dailyPlan?:Array<{date?:string}>} : {};
  const dates=[...new Set((Array.isArray(plan.dailyPlan)?plan.dailyPlan:[]).map(row=>row.date).filter((date):date is string=>Boolean(date && /^\d{4}-\d{2}-\d{2}$/.test(date))))].sort();
  const itemDates=[...new Set(items.map(item=>item.scheduledFor?.toISOString().slice(0,10)).filter((date):date is string=>Boolean(date)))].sort();
  const range=dates.length?dates:itemDates;
  const days=Number.isInteger(plan.days) && plan.days!>=1 && plan.days!<=30 ? plan.days! : range.length;
  const regular=items.filter(item=>item.type!=="holiday_post");
  return {days,start:range[0]||null,end:range.at(-1)||null,total:items.length,extras:items.length-regular.length,formats:CONTENT_TYPES.map(type=>({label:type.label,count:regular.filter(item=>item.type===type.value || type.value==="post" && !CONTENT_TYPES.some(known=>known.value===item.type)).length}))};
}
