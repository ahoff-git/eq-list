/**
 * bis.ts — best in slot: the most valuable set of gear a character could be wearing, what merging
 * duplicates would add, and what to go and get next.
 *
 * "Value" is the player's own yardstick — the Items tab's weight sheet (`scorer` in `item-search.ts`)
 * — over an item's numbers **at its grade** (`gradedStats`, ADR 0307), so a `+6` pair of slippers is
 * weighed as the `+6` it is. Nothing here decides what a stat is worth.
 *
 * **Choosing a loadout is an assignment problem, solved exactly.** Every slot gets at most one item and
 * every item at most one slot, maximising the total — the Hungarian method over slots × items. Exact
 * rather than greedy because value depends on the slot: EQL's two `Any Slot`s take anything your
 * classes can wear at full value, but a weapon there doesn't swing, so its damage and delay count for
 * nothing (`anyValue`). Two rules sit outside the assignment and are handled around it: a two-handed
 * weapon (weighed both ways — with an off-hand, and with the off-hand slot given up) and LORE (one of
 * each, the best graded copy, which dominates every other copy in every slot).
 *
 * Pure: candidates in, a loadout out. The panel decides which rows are "yours" and which are targets.
 */
import { gradedItemStats, MAX_GRADE } from "./item-upgrade";
import type { ItemStats, StatKey } from "./item-stats";

/**
 * The worn slots a character has, as EQL lays them out — read off a real `/outputfile inventory`
 * (2026-10-20): Live's Charm and Power Source rows are two `Any Slot` rows here, and the paired
 * slots come twice.
 */
export const WORN_LAYOUT: readonly string[] = [
  "ANY", "ANY", "EAR", "EAR", "HEAD", "FACE", "NECK", "SHOULDERS", "ARMS", "BACK", "WRIST", "WRIST",
  "RANGE", "HANDS", "PRIMARY", "SECONDARY", "FINGER", "FINGER", "CHEST", "LEGS", "FEET", "WAIST", "AMMO",
];

/** What a weapon's numbers are, which an `Any Slot` doesn't use: it is worn there, not swung. */
const SWING_STATS: readonly StatKey[] = ["dmg", "delay", "ratio", "backstab"];

/** A wearable thing the loadout may use: one you hold (with its grade), or one you could go and get. */
export interface BisCandidate {
  /** Unique among the candidates — two copies of the same ring are two candidates. */
  id: string;
  /** The item page's title, which is what the card and the slots came from. */
  title: string;
  /** Its `+N`; 0 for an ungraded or unknown one. */
  grade: number;
  /** Exp banked toward the next grade — a merge's leftover, which already lifts the bigger stats. */
  exp?: number;
  /** Where it can be worn, as the card says (`EQ_SLOTS` spelling). */
  slots: readonly string[];
  /** Its value at its grade, by the player's weights, in a slot of its own. */
  value: number;
  /** The same in an `Any Slot`, where a weapon isn't swung (`SWING_STATS` don't count). */
  anyValue: number;
  /** One of these at a time. */
  lore: boolean;
  /** Takes the off-hand with it. */
  twoHanded: boolean;
  /** Where the player holds it, when they do — "Worn Fingers", "Bank 14". Absent for a hunt target. */
  heldAt?: string;
}

/** One filled slot of a loadout: which slot (by index into the layout), and what's in it. */
export interface BisPick {
  slotIndex: number;
  slot: string;
  item: BisCandidate;
  /** What it is worth *in this slot*. */
  value: number;
}

export interface BisLoadout {
  picks: BisPick[];
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Is this a two-handed weapon? Read off the weapon skill the card names (`2H Slashing`, …). */
export function isTwoHanded(stats: Pick<ItemStats, "skill">): boolean {
  return /^2H\b/i.test(stats.skill ?? "");
}

/**
 * A card's value at a grade, both ways: in a slot of its own, and in an `Any Slot` (not swung).
 * `score` is the weight sheet's scorer (`item-search.ts`).
 */
export function gradedValues(
  stats: ItemStats,
  grade: number,
  score: (stats: ItemStats) => number,
  exp = 0,
): { value: number; anyValue: number } {
  const graded = gradedItemStats(stats, grade, exp);
  const worn = { ...graded.stats };
  for (const key of SWING_STATS) delete worn[key];
  return { value: score(graded), anyValue: score({ ...graded, stats: worn }) };
}

/** What this item is worth in this slot, or null when it can't go there. `ANY` takes anything wearable. */
function valueIn(item: BisCandidate, slot: string): number | null {
  if (slot === "ANY") return item.slots.length > 0 ? item.anyValue : null;
  return item.slots.includes(slot) ? item.value : null;
}

/**
 * As `valueIn`, with two-handers kept out of the hands — beside an off-hand one can't be swung. It is
 * judged by the slot rather than by trimming the card's slots, since a two-hander that lists only
 * PRIMARY is still wearable, and so still fits an `Any Slot`.
 */
function unswungValueIn(item: BisCandidate, slot: string): number | null {
  return item.twoHanded && (slot === "PRIMARY" || slot === "SECONDARY") ? null : valueIn(item, slot);
}

/**
 * Maximum-value assignment of items to slots — the Hungarian method (shortest augmenting paths with
 * potentials), rows = slots, columns = items plus one "leave it empty" column per slot so a slot with
 * nothing worth wearing stays empty. O(slots² × columns): two dozen slots by a few hundred items.
 */
function assign(items: readonly BisCandidate[], layout: readonly string[], worth: typeof valueIn): (number | -1)[] {
  const n = layout.length;
  const m = items.length + n;
  const FORBIDDEN = 1e9;
  const cost = (r: number, c: number): number => {
    if (c >= items.length) return 0; // empty
    const v = worth(items[c], layout[r]);
    return v === null || v <= 0 ? FORBIDDEN : -v;
  };
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0); // p[col] = row matched to col (1-based), 0 = none
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const owner: (number | -1)[] = new Array(n).fill(-1);
  for (let j = 1; j <= items.length; j++) {
    if (p[j] !== 0 && cost(p[j] - 1, j - 1) < FORBIDDEN) owner[p[j] - 1] = j - 1;
  }
  return owner;
}

/** One of each LORE item — its best copy, which is worth at least as much as any other, anywhere. */
function oneOfEachLore(candidates: readonly BisCandidate[]): BisCandidate[] {
  const best = new Map<string, BisCandidate>();
  const rest: BisCandidate[] = [];
  for (const c of candidates) {
    if (!c.lore) {
      rest.push(c);
      continue;
    }
    const key = c.title.toLowerCase();
    const held = best.get(key);
    if (!held || c.value > held.value || (c.value === held.value && c.anyValue > held.anyValue)) best.set(key, c);
  }
  return [...rest, ...best.values()];
}

function loadoutOver(candidates: readonly BisCandidate[], layout: readonly string[], worth: typeof valueIn = valueIn): BisLoadout {
  const items = candidates.filter((c) => c.value > 0 || c.anyValue > 0);
  const owner = assign(items, layout, worth);
  const picks: BisPick[] = [];
  owner.forEach((o, slotIndex) => {
    if (o !== -1) picks.push({ slotIndex, slot: layout[slotIndex], item: items[o], value: worth(items[o], layout[slotIndex]) ?? 0 });
  });
  return { picks, total: round2(picks.reduce((t, p) => t + p.value, 0)) };
}

/**
 * The most valuable loadout these candidates allow. Two-handers are weighed both ways: no two-hander
 * swung (one may still sit in an `Any Slot`, unswung), or a two-hander in the main hand with the
 * off-hand given up — whichever is worth more wins.
 */
export function bestLoadout(candidates: readonly BisCandidate[], layout: readonly string[] = WORN_LAYOUT): BisLoadout {
  const pool = oneOfEachLore(candidates);
  const main = layout.indexOf("PRIMARY");
  const off = layout.indexOf("SECONDARY");
  // A two-hander can't be swung beside an off-hand, but it can be worn in an Any Slot.
  const oneHanded = loadoutOver(pool, layout, unswungValueIn);
  if (main === -1 || off === -1 || !pool.some((c) => c.twoHanded)) return oneHanded;
  const withoutOffHand = layout.filter((_, i) => i !== off);
  const twoHanded = loadoutOver(pool, withoutOffHand);
  if (twoHanded.total <= oneHanded.total) return oneHanded;
  // Re-index onto the full layout so a pick's `slotIndex` always means the same slot.
  return { ...twoHanded, picks: twoHanded.picks.map((p) => ({ ...p, slotIndex: p.slotIndex >= off ? p.slotIndex + 1 : p.slotIndex })) };
}

// ─── Grades ─────────────────────────────────────────────────────────────────

/** Exp a copy adds when merged in, by its grade: `2^grade` (eqlwiki, Item Upgrade System). */
const copyWorth = (grade: number) => 2 ** Math.max(0, Math.min(MAX_GRADE, grade));

/**
 * Where merging every copy into one would land: each copy is worth `2^grade` units, a `+N` is `2^N`
 * of them, and what's left over is exp toward the next grade. Capped at `+10`.
 */
export function mergedGrade(grades: readonly number[]): { grade: number; exp: number } {
  const units = grades.reduce((t, g) => t + copyWorth(g), 0);
  if (units <= 0) return { grade: 0, exp: 0 };
  const grade = Math.min(MAX_GRADE, Math.floor(Math.log2(units)));
  return { grade, exp: grade === MAX_GRADE ? 0 : units - 2 ** grade };
}

/** How many `+0` copies one `+N` takes. */
export function copiesFor(grade: number): number {
  return copyWorth(grade);
}

// ─── Hunting ────────────────────────────────────────────────────────────────

/** A thing worth hunting: what it's worth over what it would push out of the loadout. */
export interface BisSuggestion {
  item: BisCandidate;
  /** Value gained by wearing it instead of the weakest thing it could replace (or an empty slot). */
  gain: number;
  /** What it would replace — absent when there's an empty slot for it. */
  replaces?: BisPick;
  /** The slot it would go in. */
  slot: string;
}

/**
 * What to go and get: each candidate's **marginal** gain over the loadout you have — its value in a
 * slot less what's in that slot now (an empty one counting as nothing), at the best slot for it. Only
 * gains are kept, biggest first.
 *
 * Judged one at a time, which is what "the next thing to hunt" means: two suggestions for the same
 * slot each assume the other wasn't got. A two-hander swung is weighed against the main hand and off
 * hand together, since it takes both.
 */
export function huntSuggestions(loadout: BisLoadout, candidates: readonly BisCandidate[], layout: readonly string[] = WORN_LAYOUT): BisSuggestion[] {
  const inSlot = new Map(loadout.picks.map((p) => [p.slotIndex, p]));
  const out: BisSuggestion[] = [];
  for (const c of candidates) {
    let best: BisSuggestion | undefined;
    const consider = (s: BisSuggestion) => {
      if (!best || s.gain > best.gain) best = s;
    };
    const main = layout.indexOf("PRIMARY");
    const off = layout.indexOf("SECONDARY");
    // An off-hand beside a swung two-hander means putting the two-hander away.
    const swungTwoHander = inSlot.get(main)?.item.twoHanded ? inSlot.get(main) : undefined;
    layout.forEach((slot, i) => {
      const value = unswungValueIn(c, slot);
      if (value === null) return;
      const there = i === off && swungTwoHander ? swungTwoHander : inSlot.get(i);
      consider({ item: c, gain: value - (there?.value ?? 0), replaces: there, slot });
    });
    if (c.twoHanded && main !== -1 && c.slots.includes("PRIMARY")) {
      const displaced = (inSlot.get(main)?.value ?? 0) + (off === -1 ? 0 : inSlot.get(off)?.value ?? 0);
      consider({ item: c, gain: c.value - displaced, replaces: inSlot.get(main), slot: "PRIMARY" });
    }
    if (best && best.gain > 0) out.push({ ...best, gain: round2(best.gain) });
  }
  return out.sort((a, b) => b.gain - a.gain || a.item.title.localeCompare(b.item.title));
}
