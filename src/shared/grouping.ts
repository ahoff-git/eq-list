/**
 * grouping.ts — organize shopping-list entries under the quest/recipe that added
 * them. Entries carry an `origin` (set when you "add full quest"); everything
 * added on its own falls into a trailing "Other items" group. Because entries are
 * keyed by name + origin (see store.ts), the same item can appear under more than one
 * group — `itemTotals` sums it across them for the list's "(N total)" hint. Pure +
 * testable so the control window and the overlay group identically.
 *
 * A quest/recipe group can be run multiple times (`runs`, from list.questRuns) —
 * that scales each entry's needed count. `effectiveNeeded(entry, runs)` is the
 * single source of truth for "how many you actually need".
 *
 * `groupByOrigin` also decides the order everything renders in: unfinished groups before finished
 * ones (A-Z within each), "Other items" always last since it isn't a real quest/recipe to finish;
 * and within a group, still-needed entries before satisfied ones (A-Z within each). One sort, so
 * the control window and the overlay can't land on two different orders for the same list.
 */
import type { ShoppingList, ShoppingListEntry, WikiPageKind } from "./types";
import { itemBaseName } from "./names";

export interface ListGroup {
  key: string;
  label: string;
  /** null for the catch-all "Other items" group. */
  kind: WikiPageKind | null;
  entries: ShoppingListEntry[];
  /** How many times you plan to run this quest/recipe (1 for "Other"). */
  runs: number;
  needed: number;
  obtained: number;
  complete: boolean;
}

const OTHER_KEY = "__other__";

/** Stable key for a group / questRuns lookup. */
export function originKey(origin: ShoppingListEntry["origin"]): string {
  return origin ? `${origin.kind}:${origin.name}` : OTHER_KEY;
}

/**
 * Is this entry a **mob** — a thing to go and *kill* rather than a thing to obtain?
 *
 * A mob has no count that can ever be completed: nothing drops it, so its `obtained` stays 0 for
 * ever (`ShoppingListEntry.kind`). Every piece of progress arithmetic therefore has to leave it out,
 * and that is four places — the row, the group, the group's header tally and the hunt list — which
 * is why the question is a function rather than a `kind === "mob"` written out four times.
 */
export const isMobEntry = (entry: Pick<ShoppingListEntry, "kind">): boolean => entry.kind === "mob";

/**
 * The entries a group's progress is measured over: everything but the mobs.
 *
 * Counting a mob made its group permanently unfinished — "2/3" for ever, and never struck through —
 * because the one row it was waiting on was a row that can't be satisfied by anything.
 */
export const countableEntries = (entries: ShoppingListEntry[]): ShoppingListEntry[] =>
  entries.filter((e) => !isMobEntry(e));

/** Whether one entry's claim has been met. Only ever asked of a countable entry. */
export const satisfied = (entry: ShoppingListEntry, runs: number): boolean =>
  entry.obtained >= effectiveNeeded(entry, runs);

/**
 * How many runs *this* entry's group is set to — the multiplier `effectiveNeeded` wants, read
 * straight from the list.
 *
 * `groupByOrigin` already knows it per group, and everything that draws the list goes through there.
 * This is for the one caller holding a single entry and no group: the loot alert, which is handed the
 * entries a line satisfied and has to quote the same figures the row shows (ADR 0105).
 */
export function runsFor(list: Pick<ShoppingList, "questRuns">, entry: ShoppingListEntry): number {
  return Math.max(1, list.questRuns[originKey(entry.origin)] ?? 1);
}

/** Per-entry count needed, scaled by how many runs its group is set to. */
export function effectiveNeeded(entry: ShoppingListEntry, runs: number): number {
  return entry.needed * Math.max(1, runs);
}

/**
 * Normalize an item name for cross-group totalling and for every other place two spellings of
 * one item have to meet (the loot line against the list, the log against the wiki).
 *
 * Light on purpose — wiki names are canonical — but a **grade is dropped**: the game hands you a
 * "Crushbone Belt +2" and the wiki, the list and the quest that wants one all say "Crushbone
 * Belt" (`names.ts`).
 */
export function normalizeItemName(name: string): string {
  return itemBaseName(name).toLowerCase().replace(/\s+/g, " ").trim();
}

/** One group's claim on an item — the pieces the parenthetical total is made of. */
export interface ItemDemand {
  /** The quest/recipe asking for it (or "Other items"). */
  label: string;
  /** null for the catch-all group. */
  kind: WikiPageKind | null;
  /** How many that group needs, its runs already applied. */
  need: number;
  /** How many times the group is set to run, so the reason for `need` is visible. */
  runs: number;
}

/**
 * Who wants each item and how many each wants, keyed by normalized name. This is what
 * lets the list *explain* its "(N)" hint — hovering a count names the quests behind it.
 */
export function itemDemands(groups: ListGroup[]): Map<string, ItemDemand[]> {
  const demands = new Map<string, ItemDemand[]>();
  for (const g of groups) {
    for (const e of g.entries) {
      const key = normalizeItemName(e.name);
      const forItem = demands.get(key) ?? [];
      forItem.push({ label: g.label, kind: g.kind, need: effectiveNeeded(e, g.runs), runs: g.runs });
      demands.set(key, forItem);
    }
  }
  return demands;
}

/**
 * Total needed of each item across ALL groups (each group scaled by its runs), keyed by
 * normalized name. The same item can appear under several quest/recipe headings; this is
 * the grand total the list shows in parentheses (e.g. rat ears "0 of 4 (8)").
 *
 * Summed from `itemDemands` so the number and the hover that breaks it down can never
 * disagree.
 */
export function itemTotals(groups: ListGroup[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [key, demands] of itemDemands(groups)) totals.set(key, totalNeed(demands));
  return totals;
}

/**
 * How many of an item every claim on it wants, together.
 *
 * Named because three places asked it — this map, the entry row, and the hover that spells the row
 * out — and "the total is the sum of the parts" is precisely the claim the hover makes to the user.
 */
export function totalNeed(demands: ItemDemand[]): number {
  return demands.reduce((n, d) => n + d.need, 0);
}

export function groupByOrigin(
  entries: ShoppingListEntry[],
  questRuns: Record<string, number> = {},
): ListGroup[] {
  const byKey = new Map<string, ListGroup>();
  for (const e of entries) {
    const key = originKey(e.origin);
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: e.origin ? e.origin.name : "Other items",
        kind: e.origin ? e.origin.kind : null,
        entries: [],
        runs: 1,
        needed: 0,
        obtained: 0,
        complete: true,
      };
      byKey.set(key, group);
    }
    group.entries.push(e);
  }

  const groups = [...byKey.values()];
  for (const g of groups) {
    // Only real quest/recipe groups can be multi-run; "Other" is always 1.
    g.runs = g.kind ? Math.max(1, questRuns[g.key] ?? 1) : 1;
    // Mobs sit out of all three figures — see `isMobEntry`. `complete` also needs there to *be*
    // something countable: a group holding nothing but a mob has finished nothing, so calling it
    // complete would strike through a heading whose only row is still outstanding work.
    const countable = countableEntries(g.entries);
    g.needed = countable.reduce((n, e) => n + effectiveNeeded(e, g.runs), 0);
    // Clamp per entry so overflow drops don't inflate group progress.
    g.obtained = countable.reduce((n, e) => n + Math.min(e.obtained, effectiveNeeded(e, g.runs)), 0);
    g.complete = countable.length > 0 && countable.every((e) => satisfied(e, g.runs));
    // Still-needed rows first (a mob always counts as still-needed — see `isMobEntry`), then A-Z,
    // so what's left to do leads the group and finished/hunted rows don't have to be hunted for
    // among them.
    g.entries.sort((a, b) => {
      const doneA = !isMobEntry(a) && satisfied(a, g.runs);
      const doneB = !isMobEntry(b) && satisfied(b, g.runs);
      if (doneA !== doneB) return doneA ? 1 : -1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
  }
  // Unfinished groups first, then A-Z within each bucket; "Other" — the catch-all rather than a
  // real quest/recipe — always sinks to the very end regardless of its own completion.
  groups.sort((a, b) => {
    if (a.key === OTHER_KEY || b.key === OTHER_KEY) {
      return (a.key === OTHER_KEY ? 1 : 0) - (b.key === OTHER_KEY ? 1 : 0);
    }
    if (a.complete !== b.complete) return a.complete ? 1 : -1;
    return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
  });
  return groups;
}
