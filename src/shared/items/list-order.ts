/**
 * list-order.ts — the order of the shopping list, which is the player's (ADR 0388).
 *
 * The stored order of `list.entries` **is** the order: groups appear in the order their first row does, and
 * rows within a group in the order they sit in the array. `groupByOrigin` only floats finished groups and
 * rows below unfinished ones, and keeps "Other items" last. Because the same order is what hands a pile of
 * held items out between rows that want the same thing (`shareHeld`, ADR 0387), moving a quest up the list is
 * also how you say which quest those chips are for.
 *
 * Pure: entries (or a list) in, an order out. Moves return the **whole** new order as ids, so what crosses
 * the IPC boundary is one array whatever was dragged, and what the store applies is one function.
 */
import type { ShoppingList, ShoppingListEntry } from "../types";
import { originKey } from "./grouping";

/** The key every origin-less entry shares — the "Other items" group, which is never moved. */
const OTHER = originKey(undefined);

const byLabel = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

/** A group's heading as the list shows it, for sorting. */
const labelOf = (e: Pick<ShoppingListEntry, "origin">): string => e.origin?.name ?? "";

/**
 * A list as the player first sees it once order is theirs: sorted once, the way it has always been drawn —
 * groups A–Z with "Other items" last, rows A–Z within a group — and marked `arranged` so it is never sorted
 * again. A list saved before order was the player's has no mark, so this runs once on load and everything it
 * looked like stays exactly as it looked; a list that already carries the mark is returned as it is.
 */
export function arrangeOnce(list: ShoppingList): ShoppingList {
  if (list.arranged) return list;
  const entries = [...list.entries].sort((a, b) => {
    const aOther = originKey(a.origin) === OTHER;
    const bOther = originKey(b.origin) === OTHER;
    if (aOther !== bOther) return aOther ? 1 : -1;
    return byLabel(labelOf(a), labelOf(b)) || byLabel(a.name, b.name);
  });
  return { ...list, entries, arranged: true };
}

/**
 * Move one row to just before (or, with `after`, just after) another row of **the same group**. A row can't
 * leave its quest or recipe by being dragged — the group is what it belongs to — so a target in another group,
 * or the row itself, changes nothing. Returns every entry's id in the new order.
 */
export function moveRow(entries: readonly ShoppingListEntry[], id: string, targetId: string, after = false): string[] {
  const ids = entries.map((e) => e.id);
  const row = entries.find((e) => e.id === id);
  const target = entries.find((e) => e.id === targetId);
  if (!row || !target || id === targetId || originKey(row.origin) !== originKey(target.origin)) return ids;
  const without = ids.filter((x) => x !== id);
  without.splice(without.indexOf(targetId) + (after ? 1 : 0), 0, id);
  return without;
}

/**
 * Move a whole group to just before (or, with `after`, just after) another group. Groups are contiguous
 * afterwards, each keeping the order of its own rows. "Other items" is the catch-all that always sits last, so it
 * can be neither moved nor moved against. Returns every entry's id in the new order.
 */
export function moveGroup(entries: readonly ShoppingListEntry[], key: string, targetKey: string, after = false): string[] {
  const keys = [...new Set(entries.map((e) => originKey(e.origin)))];
  if (key === targetKey || key === OTHER || targetKey === OTHER || !keys.includes(key) || !keys.includes(targetKey)) {
    return entries.map((e) => e.id);
  }
  const without = keys.filter((k) => k !== key);
  without.splice(without.indexOf(targetKey) + (after ? 1 : 0), 0, key);
  return without.flatMap((k) => entries.filter((e) => originKey(e.origin) === k).map((e) => e.id));
}

/**
 * The entries in the order `ids` gives. An id that names no entry is ignored and a repeated one counts once;
 * an entry `ids` leaves out keeps its place relative to the other left-out ones, after everything named — so an
 * order that is a little behind the list (a row added since it was read) never drops anything.
 */
export function applyOrder(entries: readonly ShoppingListEntry[], ids: readonly string[]): ShoppingListEntry[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const named = [...new Set(ids)].flatMap((id) => byId.get(id) ?? []);
  const taken = new Set(named.map((e) => e.id));
  return [...named, ...entries.filter((e) => !taken.has(e.id))];
}
