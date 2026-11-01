import { createHash } from "node:crypto";
import { WEEKLY_DESIGNS, weeklyDesignFamily } from "../render/weekly-layouts";

/** Balanced use is the first rule: all 90 available compositions are used before
 * another cycle begins. Nearby saved future packs count too, so preparing weeks
 * out of order cannot silently reuse an already reserved design. */
export function nextWeeklyLayout(seed: string, before: readonly string[], after: readonly string[], pack: readonly string[]) {
  const counts = new Map<string, number>();
  for (const layout of [...before, ...after]) counts.set(layout, (counts.get(layout) || 0) + 1);
  const minimum = Math.min(...WEEKLY_DESIGNS.map(layout => counts.get(layout) || 0));
  const families = pack.map(weeklyDesignFamily);
  const candidates = WEEKLY_DESIGNS.filter(layout => (counts.get(layout) || 0) === minimum).map(layout => {
    const previous = before.lastIndexOf(layout), following = after.indexOf(layout);
    const distance = Math.min(previous < 0 ? Infinity : before.length - previous, following < 0 ? Infinity : following + 1);
    return { layout, distance, familyCount: families.filter(family => family === weeklyDesignFamily(layout)).length,
      rank: createHash("sha256").update(`${seed}:${layout}`).digest("hex") };
  });
  // With seven chronological slots per week, 84 intervening slots protect twelve
  // weeks. For dense or out-of-order histories use the widest available gap;
  // never claim a fixed calendar cooldown irrespective of the customer's plan.
  const roomy = candidates.filter(candidate => candidate.distance > 84);
  const pool = roomy.length ? roomy : candidates;
  pool.sort((a, b) => (roomy.length ? 0 : b.distance - a.distance || 0) || a.familyCount - b.familyCount || a.rank.localeCompare(b.rank));
  return pool[0].layout;
}
