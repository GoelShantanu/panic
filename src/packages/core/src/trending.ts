// Trending score (PRD-001 US-001.3 AC-7, US-001.7 AC-4, C-001.2; OQ-001.3; D-038). Inputs are item
// count, source count and source tiers only: no votes, no tone, no AI output.

export const TRENDING_WINDOW_MS = 2 * 3600_000; // OQ-001.3
export const TRENDING_MIN_SOURCES = 3; // OQ-001.3
export const TRENDING_BASELINE_DAYS = 28; // [ASSUMPTION]
export const TRENDING_BASELINE_FLOOR = 1; // expected activity never below one tier-3 source per window [ASSUMPTION]
export const EXTRA_ITEM_WEIGHT = 0.5; // a further item from a source already counted [ASSUMPTION]

// [ASSUMPTION] tier 1 = exchange/regulator, 4 = least authoritative (PRD-002 §2).
export const TIER_WEIGHTS: Readonly<Record<number, number>> = { 1: 3, 2: 2, 3: 1, 4: 0.5 };
export const tierWeight = (tier: number) => TIER_WEIGHTS[tier] ?? 0.5;

export interface WindowActivity {
  itemCount: number;
  sources: readonly { sourceId: string; tier: number }[]; // one entry per item
}

// Activity in the trailing window: each distinct source counts by its tier weight, further items
// from the same source count EXTRA_ITEM_WEIGHT each.
export function windowActivity(a: WindowActivity): { activity: number; sourceCount: number } {
  const best = new Map<string, number>();
  for (const s of a.sources) best.set(s.sourceId, Math.max(best.get(s.sourceId) ?? 0, tierWeight(s.tier)));
  const sourceCount = best.size;
  const activity = [...best.values()].reduce((x, y) => x + y, 0) + EXTRA_ITEM_WEIGHT * Math.max(0, a.itemCount - sourceCount);
  return { activity, sourceCount };
}

// Expected activity per window for one instrument in one session type: its weighted item volume in
// that session type over the baseline period, per hour of that session type, times the window.
export function expectedActivity(weightedItems: number, sessionHours: number): number {
  if (sessionHours <= 0) return TRENDING_BASELINE_FLOOR;
  return Math.max(TRENDING_BASELINE_FLOOR, (weightedItems / sessionHours) * (TRENDING_WINDOW_MS / 3600_000));
}

// The score is activity relative to the most active of the story's instruments (the conservative
// choice for multi-company stories).
export function trendingScore(activity: number, expectedPerInstrument: readonly number[]): number {
  const expected = expectedPerInstrument.length ? Math.max(...expectedPerInstrument) : TRENDING_BASELINE_FLOOR;
  return Math.round((activity / expected) * 1000) / 1000;
}
