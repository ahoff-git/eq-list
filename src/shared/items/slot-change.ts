/**
 * slot-change.ts — what a pick changes against what you wear in its slot now, stat by stat.
 *
 * "Replacing 5 INT with 7 INT" is +2 INT, and for a caster that is mana too: the loadout grid's numbers
 * count what a piece's attributes buy (`effectiveOf`), at the same per-point rates the plan weighs them
 * by, so a change reads the way the planner reasoned about it.
 *
 * Two things are decided here rather than in the grid:
 * - **What a pick replaces.** Pieces are paired by slot name, and a pick that *is* the piece worn there
 *   (same dump row) replaces nothing — so a pair of rings that merely swapped hands shows no change.
 *   Whatever is left pairs off in dump order; a slot with nothing worn replaces nothing (`stats: {}`).
 *   A piece moved to a different slot is a change in both: what takes its old place replaces it, and in
 *   its new slot it fills what was empty. (A worn piece in a slot the loadout leaves bare has no row to
 *   say so, so the rows are each slot's own change, not a ledger of the whole.)
 * - **No dump, no change.** With nothing worn at all there is nothing to compare with, so no slot says
 *   "+" against an empty body.
 *
 * Pure → a tested black box.
 */
import type { DerivedRate } from "./derived-stats";
import type { StatKey } from "./item-stats";

type Stats = Partial<Record<StatKey, number>>;

/** A piece worn now, by the dump row it came from. `slot` is in the worn layout's spelling. */
export interface WornPiece {
  id: string;
  slot: string;
  title: string;
  stats: Stats;
}

/** What a pick takes the place of: the piece's name (absent for an empty slot) and its numbers. */
export interface Replacement {
  title?: string;
  stats: Stats;
}

/** The slot index → what its pick replaces. A pick that is already worn there has no entry. */
export function replacements(picks: readonly { slotIndex: number; id: string; slot: string }[], worn: readonly WornPiece[]): Record<number, Replacement> {
  const out: Record<number, Replacement> = {};
  if (!worn.length) return out;
  const wornIn = (slot: string) => worn.filter((w) => w.slot === slot);
  const ordered = [...picks].sort((a, b) => a.slotIndex - b.slotIndex);
  // A pick is judged against its *own* slot: a cap worn on the head and moved to an Any Slot replaces
  // nothing there, and whatever now sits on the head replaces the cap.
  const kept = new Set<string>();
  const changing = ordered.filter((p) => {
    const same = wornIn(p.slot).find((w) => w.id === p.id);
    if (same) kept.add(same.id);
    return !same;
  });
  for (const p of changing) {
    const gone = wornIn(p.slot).find((w) => !kept.has(w.id));
    if (gone) kept.add(gone.id);
    out[p.slotIndex] = gone ? { title: gone.title, stats: gone.stats } : { stats: {} };
  }
  return out;
}

/** One stat of one piece as the game would count it, and how much of that its attributes gave. Whole points per attribute, as a pool shows. */
export function effectiveOf(stats: Stats, key: StatKey, rates: readonly DerivedRate[]): { value: number; fromAttributes: number } {
  const fromAttributes = rates.filter((r) => r.to === key).reduce((sum, r) => sum + Math.round((stats[r.from] ?? 0) * r.perPoint), 0);
  return { value: (stats[key] ?? 0) + fromAttributes, fromAttributes };
}

/** One cell of the grid: the pick's effective figure, and — when it replaces something — the change. */
export interface SlotCell {
  /** Absent when the pick gives none of the stat, printed or through attributes. */
  value?: number;
  fromAttributes: number;
  /** `pick − replaced`, only where there is something to compare with and it isn't nothing. */
  change?: number;
  /** What it replaces, for the hover. */
  replaces?: string;
}

export function slotCell(pick: Stats, replaced: Replacement | undefined, key: StatKey, rates: readonly DerivedRate[]): SlotCell {
  const now = effectiveOf(pick, key, rates);
  const had = replaced && effectiveOf(replaced.stats, key, rates).value;
  const change = had === undefined ? 0 : Math.round((now.value - had) * 10) / 10;
  const gives = pick[key] !== undefined || now.fromAttributes !== 0;
  return {
    ...(gives && { value: Math.round(now.value * 10) / 10 }),
    fromAttributes: now.fromAttributes,
    ...(change !== 0 && { change }),
    ...(replaced?.title && { replaces: replaced.title }),
  };
}
