/**
 * grouping.ts — organize shopping-list entries under the quest/recipe that added
 * them. Entries carry an `origin` (set when you "add full quest"); everything
 * added on its own falls into a trailing "Other items" group. Pure + testable so
 * the control window and the overlay group identically.
 *
 * A quest/recipe group can be run multiple times (`runs`, from list.questRuns) —
 * that scales each entry's needed count. `effectiveNeeded(entry, runs)` is the
 * single source of truth for "how many you actually need".
 */
import type { ShoppingListEntry, WikiPageKind } from "./types";

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

/** Per-entry count needed, scaled by how many runs its group is set to. */
export function effectiveNeeded(entry: ShoppingListEntry, runs: number): number {
  return entry.needed * Math.max(1, runs);
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
    g.needed = g.entries.reduce((n, e) => n + effectiveNeeded(e, g.runs), 0);
    // Clamp per entry so overflow drops don't inflate group progress.
    g.obtained = g.entries.reduce((n, e) => n + Math.min(e.obtained, effectiveNeeded(e, g.runs)), 0);
    g.complete = g.entries.every((e) => e.obtained >= effectiveNeeded(e, g.runs));
  }
  // Preserve first-seen order (Map is insertion-ordered); "Other" sinks to the end.
  groups.sort((a, b) => (a.key === OTHER_KEY ? 1 : 0) - (b.key === OTHER_KEY ? 1 : 0));
  return groups;
}
