/**
 * Success rates as they travel between peers — the `crafting` share kind (ADR 0303).
 *
 * What leaves is the crafting log's conclusion and nothing behind it: per tradeskill, item and skill
 * level, how many combines and how many came out. No times, no sittings, no character — a row says
 * "at Blacksmithing 36, Sheet Metal came out 10 of 16", which is a fact about the game rather than
 * about the person. A row carries its origin (`by`/`byId`) like every observation kind, so a relayed
 * rate is filed under whoever made the combines, not whoever passed it on (ADR 0242).
 *
 * Pooling adds the counts, which is what a success rate wants: twenty of your combines and eighty of
 * a friend's at the same level are a hundred combines at that level.
 */
import type { CraftingSummary, Tally } from "./crafting-log";

export interface SharedCraftRate extends Tally {
  skill: string;
  item: string;
  level: number;
  /** Who made the combines — set on a pooled row, absent on your own. */
  by?: string;
  byId?: string;
}

/** Your own rates, ready to offer: every item × level the log could tie to a skill and a level. */
export function shareableCraftRates(summary: CraftingSummary): SharedCraftRate[] {
  return summary.items.flatMap((it) =>
    it.skill ? it.levels.map((l) => ({ skill: it.skill!, item: it.item, level: l.level, attempts: l.attempts, ok: l.ok })) : [],
  );
}

/** One item at one level, with everyone who has made it there added together. */
export interface PooledCraftRate extends Tally {
  skill: string;
  item: string;
  level: number;
  /** How many different people the counts came from. */
  people: number;
}

/** Everyone's rates added up, item by level. Your own aren't in `rows` — the room is everyone else. */
export function poolCraftRates(rows: readonly SharedCraftRate[]): PooledCraftRate[] {
  const pooled = new Map<string, PooledCraftRate & { who: Set<string> }>();
  for (const r of rows) {
    const key = `${r.skill}|${r.item}|${r.level}`;
    let p = pooled.get(key);
    if (!p) pooled.set(key, (p = { skill: r.skill, item: r.item, level: r.level, attempts: 0, ok: 0, people: 0, who: new Set() }));
    p.attempts += r.attempts;
    p.ok += r.ok;
    p.who.add(r.byId ?? r.by ?? "?");
    p.people = p.who.size;
  }
  return [...pooled.values()].map((p) => ({ skill: p.skill, item: p.item, level: p.level, attempts: p.attempts, ok: p.ok, people: p.people }));
}

/** The key a row is filed under — item, level and skill, and whose. */
export const craftRateKey = (r: { skill: string; item: string; level: number }): string => `${r.skill}|${r.item}|${r.level}`;
