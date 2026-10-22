/**
 * bis-options.ts — what the player has told the loadout builder, over and above the Items tab's
 * criteria and weights: slots they've decided themselves, effects they want worn, things ruled out, and
 * whether the plan may reach past what they hold.
 *
 * Everything is keyed by **item title**, never by a dump row: a lock on "Moonstone Ring" must survive
 * the next `/outputfile inventory`, which renumbers every row and may move the ring to the bank.
 *
 * There is **one loadout** and one set of locks. A lock stays until it's unlocked — on something you
 * hold or something you'd have to hunt, and whether or not hunting is switched on — and an exclusion
 * takes a thing out of every question the page asks (ADR 0329).
 *
 * Pure. Stored by the Items panel, saved into presets (`item-presets.ts`), read by `bis-plan.ts`.
 */
import { WORN_LAYOUT } from "./bis";
import { normalizeItemName } from "./grouping";

/** A slot held to one item (worn there whatever it's worth) or held empty. */
export type BisSlotLock = { title: string } | { empty: true };

export interface BisOptions {
  /** By slot index into `WORN_LAYOUT` — the layout has two of several slots, so the name isn't enough. */
  locks: Record<number, BisSlotLock>;
  /** Effect names the loadout should carry: worn natively, or as a stone in a socket. In order of want. */
  wantEffects: string[];
  /**
   * Things ruled out of the page entirely — never worn, never hunted, never an effect's carrier, never
   * a stone's source: a quest piece kept for another role, no-drop raid loot, a camp you won't do.
   */
  excluded: string[];
  /** May the loadout include catalogue items you'd have to go and get, beside what you hold? */
  includeHunt: boolean;
  /** The grade a catalogue item is weighed at: as it drops, or a farm's worth of merging. */
  huntGrade: number;
}

/** The grades a catalogue item can be weighed at — the Hunt table's columns, and `+0`. */
export const HUNT_GRADE_CHOICES = [0, 2, 5, 10] as const;

export const NO_BIS_OPTIONS: BisOptions = { locks: {}, wantEffects: [], excluded: [], includeHunt: true, huntGrade: 0 };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);

/**
 * Options as stored, made whole: a shape from an older build (or a hand-edited preset) gets every
 * field, and a lock on a slot the layout doesn't have is dropped rather than carried forever. An older
 * build kept two lists of things ruled out — `benched` (held, never worn) and `skipHunt` (never
 * suggested) — which are one list now, so both fold into `excluded`.
 */
export function normalizeBisOptions(stored: unknown): BisOptions {
  const o = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const excluded: string[] = [];
  for (const t of [...strings(o.excluded), ...strings(o.benched), ...strings(o.skipHunt)]) {
    if (!excluded.some((e) => normalizeItemName(e) === normalizeItemName(t))) excluded.push(t);
  }
  return {
    locks: normalizeLocks(o.locks),
    wantEffects: strings(o.wantEffects),
    excluded,
    includeHunt: typeof o.includeHunt === "boolean" ? o.includeHunt : NO_BIS_OPTIONS.includeHunt,
    huntGrade: HUNT_GRADE_CHOICES.find((g) => g === o.huntGrade) ?? 0,
  };
}

/** A stored lock set made whole: a lock on a slot the layout doesn't have is dropped. */
function normalizeLocks(stored: unknown): Record<number, BisSlotLock> {
  const locks: Record<number, BisSlotLock> = {};
  if (!stored || typeof stored !== "object") return locks;
  for (const [key, lock] of Object.entries(stored as Record<string, unknown>)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= WORN_LAYOUT.length || !lock || typeof lock !== "object") continue;
    const l = lock as { title?: unknown; empty?: unknown };
    if (l.empty === true) locks[index] = { empty: true };
    else if (typeof l.title === "string" && l.title) locks[index] = { title: l.title };
  }
  return locks;
}

/** How many things the options change — what a "Reset (N)" button counts. The hunt switch and grade are settings, not changes. */
export function bisOptionCount(o: BisOptions): number {
  return Object.keys(o.locks).length + o.wantEffects.length + o.excluded.length;
}

/** Add or remove a name from one of the title lists, matching the way item names are matched. */
export function toggleTitle(list: readonly string[], title: string): string[] {
  const key = normalizeItemName(title);
  return list.some((t) => normalizeItemName(t) === key) ? list.filter((t) => normalizeItemName(t) !== key) : [...list, title];
}

/** Is this title ruled out? Matched the way item names are. */
export function isExcluded(o: Pick<BisOptions, "excluded">, title: string): boolean {
  const key = normalizeItemName(title);
  return o.excluded.some((t) => normalizeItemName(t) === key);
}

/** Lock a slot, or (with `undefined`) unlock it. */
export function withLock(o: BisOptions, slotIndex: number, lock: BisSlotLock | undefined): BisOptions {
  const locks = { ...o.locks };
  if (lock) locks[slotIndex] = lock;
  else delete locks[slotIndex];
  return { ...o, locks };
}

/** Rule a title out — and unlock any slot locked to it, since a lock on something excluded can't hold. */
export function withExcluded(o: BisOptions, title: string): BisOptions {
  if (isExcluded(o, title)) return o;
  const key = normalizeItemName(title);
  const locks = Object.fromEntries(
    Object.entries(o.locks).filter(([, l]) => !("title" in l) || normalizeItemName(l.title) !== key),
  ) as Record<number, BisSlotLock>;
  return { ...o, locks, excluded: [...o.excluded, title] };
}

/** Every slot held to what's in it now — "keep this, solve the rest" for a whole loadout at once. */
export function lockAll(o: BisOptions, picks: readonly { slotIndex: number; title: string }[]): BisOptions {
  const locks = { ...o.locks };
  for (const p of picks) locks[p.slotIndex] = { title: p.title };
  return { ...o, locks };
}
