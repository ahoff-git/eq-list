/**
 * bis-options.ts — what the player has told best in slot, over and above the Items tab's criteria
 * and weights: slots they've decided themselves, effects they want worn, things never to wear, and
 * hunts not to suggest.
 *
 * Everything is keyed by **item title**, never by a dump row: a lock on "Moonstone Ring" must survive
 * the next `/outputfile inventory`, which renumbers every row and may move the ring to the bank.
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
  /** Things you hold that best in slot must never wear — a quest piece, a set kept for another role. */
  benched: string[];
  /** Things never suggested as a hunt — no-drop raid loot, a camp you won't do. */
  skipHunt: string[];
}

export const NO_BIS_OPTIONS: BisOptions = { locks: {}, wantEffects: [], benched: [], skipHunt: [] };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);

/**
 * Options as stored, made whole: a shape from an older build (or a hand-edited preset) gets every
 * field, and a lock on a slot the layout doesn't have is dropped rather than carried forever.
 */
export function normalizeBisOptions(stored: unknown): BisOptions {
  const o = (stored && typeof stored === "object" ? stored : {}) as Partial<Record<keyof BisOptions, unknown>>;
  const locks: Record<number, BisSlotLock> = {};
  if (o.locks && typeof o.locks === "object") {
    for (const [key, lock] of Object.entries(o.locks as Record<string, unknown>)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= WORN_LAYOUT.length || !lock || typeof lock !== "object") continue;
      const l = lock as { title?: unknown; empty?: unknown };
      if (l.empty === true) locks[index] = { empty: true };
      else if (typeof l.title === "string" && l.title) locks[index] = { title: l.title };
    }
  }
  return { locks, wantEffects: strings(o.wantEffects), benched: strings(o.benched), skipHunt: strings(o.skipHunt) };
}

/** How many things the options change — what a "Reset (N)" button counts. */
export function bisOptionCount(o: BisOptions): number {
  return Object.keys(o.locks).length + o.wantEffects.length + o.benched.length + o.skipHunt.length;
}

/** Add or remove a name from one of the title lists, matching the way item names are matched. */
export function toggleTitle(list: readonly string[], title: string): string[] {
  const key = normalizeItemName(title);
  return list.some((t) => normalizeItemName(t) === key) ? list.filter((t) => normalizeItemName(t) !== key) : [...list, title];
}

/** Lock a slot, or (with `undefined`) unlock it. */
export function withLock(o: BisOptions, slotIndex: number, lock: BisSlotLock | undefined): BisOptions {
  const locks = { ...o.locks };
  if (lock) locks[slotIndex] = lock;
  else delete locks[slotIndex];
  return { ...o, locks };
}

/** Every slot held to what's in it now — "keep this, solve the rest" for a whole loadout at once. */
export function lockAll(o: BisOptions, picks: readonly { slotIndex: number; title: string }[]): BisOptions {
  const locks = { ...o.locks };
  for (const p of picks) locks[p.slotIndex] = { title: p.title };
  return { ...o, locks };
}
