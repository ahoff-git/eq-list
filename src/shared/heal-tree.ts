/**
 * heal-tree.ts — every heal as a (healer, target, spell) cell, and the roll-up the Healers view
 * drills into. Pure, no state beyond the accumulator, no I/O: a black box the tracker fills and
 * the UI reads — the same shape [damage-tree.ts](./damage-tree.ts) gives damage
 * ([ADR 0053](../../specs/decisions/0053-damage-is-cells-rolled-up.md)), scaled to the axes a heal
 * actually has. See [ADR 0273](../../specs/decisions/0273-a-heal-is-a-cell-too.md).
 */
import type { HealAxis, HealCell, HealEvent, HealNode } from "./types";
import { ratio } from "./numbers";

/** A heal names no spell only for the rare line the log gives no attribution at all. */
const UNKNOWN_SPELL = "Unknown";

export interface HealCells {
  /** Fold one heal in. */
  record(event: HealEvent): void;
  cells(): HealCell[];
}

/**
 * Accumulate cells. `canon` is the caller's name registry, passed in for the same reason
 * `createDamageCells` takes one — so "A cleric" and "a cleric" can't split into two healers here
 * while the meter's rows have them as one.
 */
export function createHealCells(canon: (name: string) => string = (n) => n): HealCells {
  const cells = new Map<string, HealCell>();

  const cell = (healer: string, target: string, spell: string): HealCell => {
    const key = [healer, target, spell].join("\u0000");
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { healer, target, spell, amount: 0, hits: 0, crits: 0, maxHit: 0, overhealed: 0 }));
    return c;
  };

  return {
    record(event) {
      const c = cell(canon(event.healer), canon(event.target), event.spell ?? UNKNOWN_SPELL);
      c.amount += event.amount;
      c.hits += 1;
      if (event.qualifier === "Critical") c.crits += 1;
      c.maxHit = Math.max(c.maxHit, event.amount);
      if (event.attempted) c.overhealed += Math.max(0, event.attempted - event.amount);
    },
    cells: () => [...cells.values()],
  };
}

/** Total healing across cells — the denominator a top-level share is taken against. */
export function sumHealed(cells: HealCell[]): number {
  return cells.reduce((n, c) => n + c.amount, 0);
}

/** Group cells into a tree, one level per axis, biggest first. */
export function rollUpHeals(cells: HealCell[], axes: HealAxis[], mine: (name: string) => boolean = () => false): HealNode[] {
  return group(cells, axes, sumHealed(cells), mine);
}

/**
 * The drill-down under one healer's row: their cells only, rolled up along `axes` — normally
 * `["target", "spell"]`, the Healers view's own question: who did they heal, and with what.
 */
export function healDrillDown(
  cells: HealCell[],
  from: "healer" | "target",
  name: string,
  axes: HealAxis[],
  mine: (combatant: string) => boolean = () => false,
): HealNode[] {
  return rollUpHeals(cells.filter((c) => c[from] === name), axes, mine);
}

function group(cells: HealCell[], axes: HealAxis[], parentAmount: number, mine: (n: string) => boolean): HealNode[] {
  if (!axes.length) return [];
  const [axis, ...rest] = axes;
  const buckets = new Map<string, HealCell[]>();
  for (const c of cells) {
    const key = c[axis];
    const bucket = buckets.get(key);
    if (bucket) bucket.push(c);
    else buckets.set(key, [c]);
  }
  return [...buckets.entries()]
    .map(([label, bucket]) => node(label, axis, bucket, parentAmount, rest, mine))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
}

function node(
  label: string,
  axis: HealAxis,
  cells: HealCell[],
  parentAmount: number,
  rest: HealAxis[],
  mine: (n: string) => boolean,
): HealNode {
  const amount = sumHealed(cells);
  const add = (pick: (c: HealCell) => number) => cells.reduce((n, c) => n + pick(c), 0);
  const combatant = axis === "target" || axis === "healer";
  return {
    label,
    axis,
    amount,
    hits: add((c) => c.hits),
    crits: add((c) => c.crits),
    maxHit: cells.reduce((n, c) => Math.max(n, c.maxHit), 0),
    overhealed: add((c) => c.overhealed),
    share: ratio(amount, parentAmount),
    ...(combatant ? { mine: mine(label) } : {}),
    children: group(cells, rest, amount, mine),
  };
}
