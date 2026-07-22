/**
 * grouping.ts — organize shopping-list entries under the quest/recipe that added
 * them. Entries carry an `origin` (set when you "add full quest"); everything
 * added on its own falls into a trailing "Other items" group. Pure + testable so
 * the control window and the overlay group identically.
 */
import type { ShoppingListEntry, WikiPageKind } from "./types";

export interface ListGroup {
  key: string;
  label: string;
  /** null for the catch-all "Other items" group. */
  kind: WikiPageKind | null;
  entries: ShoppingListEntry[];
  needed: number;
  obtained: number;
  complete: boolean;
}

const OTHER_KEY = "__other__";

export function groupByOrigin(entries: ShoppingListEntry[]): ListGroup[] {
  const byKey = new Map<string, ListGroup>();
  for (const e of entries) {
    const key = e.origin ? `${e.origin.kind}:${e.origin.name}` : OTHER_KEY;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: e.origin ? e.origin.name : "Other items",
        kind: e.origin ? e.origin.kind : null,
        entries: [],
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
    g.needed = g.entries.reduce((n, e) => n + e.needed, 0);
    // Clamp per entry so overflow drops don't inflate group progress.
    g.obtained = g.entries.reduce((n, e) => n + Math.min(e.obtained, e.needed), 0);
    g.complete = g.entries.every((e) => e.obtained >= e.needed);
  }
  // Preserve first-seen order (Map is insertion-ordered); "Other" sinks to the end.
  groups.sort((a, b) => (a.key === OTHER_KEY ? 1 : 0) - (b.key === OTHER_KEY ? 1 : 0));
  return groups;
}
