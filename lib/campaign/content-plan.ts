export const CONTENT_TYPES = [
  { value: "post", label: "Static post" },
  { value: "reel_post", label: "Reel" },
  { value: "presenter_post", label: "Presenter video" },
  { value: "story_post", label: "Story" },
] as const;
export type ContentType = typeof CONTENT_TYPES[number]["value"];
export type ContentQuantities = Record<ContentType, number>;
export type DailyPlan = { day: number; date: string; platforms: string[]; specialDay?: string | null; contentType?: ContentType };
export type SpecialDay = { date: string; label: string };
export type ContentSlot = { planKey: string; day: number; date: string; type: ContentType | "holiday_post"; platforms: string[]; occasion: string | null; extra: boolean; topics?: string[] };
export function applyCampaignTopics(slots: ContentSlot[], topics: string[]): ContentSlot[] {
  if (!topics.length) return slots;
  const regular=slots.filter(slot=>!slot.extra);
  if(!regular.length || topics.length>60 || topics.some(topic=>!topic.trim() || topic.length>160) || new Set(topics.map(topic=>topic.trim().toLowerCase())).size!==topics.length) throw new Error("Choose up to 60 distinct campaign topics.");
  let index=0;
  // Keep one subject per draft so a named product always has one matching photo.
  return slots.map(slot=>slot.extra ? slot : {...slot,topics:[topics[index++ % topics.length].trim()]});
}

export function campaignDate(start: string, day: number) {
  const date = new Date(`${start}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) throw new Error("Choose a valid campaign start date.");
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date;
}
export function newYorkToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (key: string) => parts.find(part => part.type === key)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function contentTypeForDay(day: number, mix: readonly ContentType[]): ContentType {
  if (!mix.length) throw new Error("Choose at least one content type.");
  return mix[(day - 1) % mix.length];
}
export function requiresVideo(type: string) {
  return type === "reel_post" || type === "presenter_post";
}
export function contentTypeLabel(type: string) {
  return CONTENT_TYPES.find(item => item.value === type)?.label || (type === "holiday_post" ? "Extra holiday / special-day post" : "Static post");
}
export function buildContentPlan(plan: DailyPlan[], days: number, extras: SpecialDay[] = []): ContentSlot[] {
  if (!Number.isInteger(days) || days < 1 || days > 30 || plan.length !== days) throw new Error("Supply the complete 1–30 day campaign calendar.");
  if (extras.length > 30) throw new Error("Choose up to 30 extra special-day posts.");
  const byDay = new Map<number, DailyPlan>(), byDate = new Map<string, DailyPlan>();
  for (const row of plan) {
    if (!Number.isInteger(row.day) || row.day < 1 || row.day > days || byDay.has(row.day) || byDate.has(row.date)) throw new Error("Campaign days and dates must be unique.");
    campaignDate(row.date, 1);
    if (row.contentType && !CONTENT_TYPES.some(type => type.value === row.contentType)) throw new Error("Choose a supported content type.");
    byDay.set(row.day, row); byDate.set(row.date, row);
  }
  const first = byDay.get(1)!;
  const slots: ContentSlot[] = [];
  for (let day = 1; day <= days; day++) {
    const row = byDay.get(day)!;
    if (row.date !== campaignDate(first.date, day).toISOString().slice(0, 10)) throw new Error("Campaign dates must follow the selected start date.");
    slots.push({ planKey: `day-${day}`, day, date: row.date, type: row.contentType || "post", platforms: row.platforms, occasion: null, extra: false });
  }
  const seen = new Set<string>();
  extras.forEach((extra, index) => {
    const row = byDate.get(extra.date), label = extra.label.trim();
    const key = `${extra.date}:${label.toLowerCase()}`;
    if (!row || !label || label.length > 100 || seen.has(key)) throw new Error("Choose distinct special days inside this campaign’s dates.");
    seen.add(key);
    slots.push({ planKey: `extra-${index + 1}`, day: row.day, date: row.date, type: "holiday_post", platforms: row.platforms, occasion: label, extra: true });
  });
  return slots;
}
export function applyContentPlan<T extends { planKey?: string | null; day: number; type: string }>(posts: T[], slots?: ContentSlot[]): T[] {
  if (!slots?.length) return posts;
  if (posts.length !== slots.length) throw new Error("The generated campaign did not include every requested content slot.");
  const remaining = new Map(slots.map(slot => [slot.planKey, slot]));
  return posts.map(post => {
    const slot = post.planKey ? remaining.get(post.planKey) : undefined;
    if (!slot || post.day !== slot.day) throw new Error("The generated campaign contains a missing, duplicated, or mismatched content slot.");
    remaining.delete(slot.planKey);
    return { ...post, type: slot.type };
  });
}
export function buildQuantityContentPlan(plan: DailyPlan[], days: number, quantities: ContentQuantities, extras: SpecialDay[] = []): ContentSlot[] {
  const calendar = buildContentPlan(plan, days, extras);
  const total = CONTENT_TYPES.reduce((sum, type) => sum + quantities[type.value], 0);
  if (CONTENT_TYPES.some(type => !Number.isInteger(quantities[type.value]) || quantities[type.value] < 0 || quantities[type.value] > 30) || total < 1 || total > 60) throw new Error("Enter 0–30 for each format and choose 1–60 regular drafts in total.");
  const slots: ContentSlot[] = [];
  for (const type of CONTENT_TYPES) {
    const count = quantities[type.value];
    for (let index = 0; index < count; index++) {
      const day = Math.floor(index * days / count) + 1;
      const row = calendar[day - 1];
      slots.push({...row, planKey:`${type.value}-${index + 1}`, type:type.value});
    }
  }
  return [...slots.sort((a,b) => a.day - b.day), ...calendar.filter(slot => slot.extra)];
}
export function specialDayForDate(date: Date) {
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    const year = date.getUTCFullYear();

    const fixed: Record<string, string> = {
      "1-1": "New Year's Day",
      "2-14": "Valentine's Day",
      "6-19": "Juneteenth",
      "7-4": "Independence Day",
      "10-31": "Halloween",
      "10-10": "World Mental Health Day",
      "11-11": "Veterans Day",
      "11-13": "World Kindness Day",
      "12-21": "World Meditation Day",
      "12-24": "Christmas Eve",
      "12-25": "Christmas Day",
      "12-31": "New Year's Eve",
    };

    const fixedName = fixed[`${month}-${day}`];
    if (fixedName) return fixedName;

    function nthWeekday(
      targetMonth: number,
      weekday: number,
      occurrence: number
    ) {
      const first = new Date(Date.UTC(year, targetMonth - 1, 1));
      const offset = (7 + weekday - first.getUTCDay()) % 7;

      return new Date(Date.UTC(year, targetMonth - 1, 1 + offset + (occurrence - 1) * 7));
    }

    function lastWeekday(targetMonth: number, weekday: number) {
      const last = new Date(Date.UTC(year, targetMonth, 0));
      const offset = (7 + last.getUTCDay() - weekday) % 7;

      return new Date(Date.UTC(year, targetMonth - 1, last.getUTCDate() - offset));
    }

    const sameDay = (a: Date, b: Date) =>
      a.getUTCFullYear() === b.getUTCFullYear() &&
      a.getUTCMonth() === b.getUTCMonth() &&
      a.getUTCDate() === b.getUTCDate();

    if (sameDay(date, nthWeekday(1, 1, 3)))
      return "Martin Luther King Jr. Day";

    if (sameDay(date, nthWeekday(2, 1, 3)))
      return "Presidents Day";

    if (sameDay(date, nthWeekday(5, 0, 2)))
      return "Mother's Day";

    if (sameDay(date, lastWeekday(5, 1)))
      return "Memorial Day";

    if (sameDay(date, nthWeekday(6, 0, 3)))
      return "Father's Day";

    if (sameDay(date, nthWeekday(6, 6, 2)))
      return "Global Wellness Day";

    if (sameDay(date, nthWeekday(9, 1, 1)))
      return "Labor Day";

    if (sameDay(date, nthWeekday(10, 1, 2)))
      return "Columbus Day";

    if (sameDay(date, nthWeekday(11, 4, 4)))
      return "Thanksgiving";

    const thanksgiving = nthWeekday(11, 4, 4);
    const blackFriday = new Date(thanksgiving);
    blackFriday.setUTCDate(blackFriday.getUTCDate() + 1);

    if (sameDay(date, blackFriday))
      return "Black Friday";

    const smallBusinessSaturday = new Date(thanksgiving);
    smallBusinessSaturday.setUTCDate(
      smallBusinessSaturday.getUTCDate() + 2
    );

    if (sameDay(date, smallBusinessSaturday))
      return "Small Business Saturday";

    const cyberMonday = new Date(thanksgiving);
    cyberMonday.setUTCDate(cyberMonday.getUTCDate() + 4);

    if (sameDay(date, cyberMonday))
      return "Cyber Monday";

    return null;
  }
