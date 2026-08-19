/**
 * list-add.ts — what an "+ Add" actually did, in words.
 *
 * Pressing + on a search result is a fire-and-forget IPC call: the list lives in another process and
 * on another tab, so nothing on screen moves. This turns the list *before* an add and the list
 * *after* it into the two things a person needs told — **that** something landed, and **how many of
 * it you now need altogether** — which is the figure the row on the List tab shows in parentheses and
 * the only one that says whether you can stop farming.
 *
 * Derived from the two lists rather than from what was asked for, because the two disagree in the
 * cases that matter: re-adding an item bumps an existing entry instead of making one, a quest
 * contributes several items under its own heading, and a mob that's already down adds nothing at
 * all. The store's own rules therefore decide what the message says (see `upsert` in store.ts).
 *
 * Pure, so the phrasing can be tested without a window.
 */
import { groupByOrigin, itemTotals, normalizeItemName } from "./grouping";
import { count } from "./format";
import type { ShoppingList, ShoppingListEntry } from "./types";

/** One item an add put on (or added to) the list. */
export interface AddedItem {
  /** As the list spells it — the entry's own name, not the query that found it. */
  name: string;
  /** A mob is a thing to hunt rather than collect, and is worded as one. */
  kind?: ShoppingListEntry["kind"];
  /** How many are needed across EVERY group now claiming it, runs applied. */
  needed: number;
  /** How much this add raised that total. */
  added: number;
}

export interface AddSummary {
  /** Empty when the add changed nothing — everything was already on the list. */
  items: AddedItem[];
  /** What all the added items come to together, for a whole-quest add. */
  needed: number;
}

/** What each item on a list needs in total, keyed the way `grouping` keys them. */
const needsByItem = (list: ShoppingList): Map<string, number> =>
  itemTotals(groupByOrigin(list.entries, list.questRuns));

/**
 * What changed between two snapshots of the list, item by item.
 *
 * An item counts as "added" when its **grand total needed went up** — which is true whether it was
 * new, or was already there under another quest and now wants more. Nothing else can be relied on:
 * entry ids are per (name + origin), so a second claim on the same item is a new row while a repeat
 * of the same claim is not.
 */
export function summarizeAdd(before: ShoppingList, after: ShoppingList): AddSummary {
  const was = needsByItem(before);
  const now = needsByItem(after);
  // The list's own spelling of each item, for the message. First entry wins: the same item under two
  // quests is one thing with one name.
  const named = new Map<string, ShoppingListEntry>();
  for (const e of after.entries) {
    const key = normalizeItemName(e.name);
    if (!named.has(key)) named.set(key, e);
  }

  const items: AddedItem[] = [];
  for (const [key, needed] of now) {
    const added = needed - (was.get(key) ?? 0);
    const entry = named.get(key);
    if (added <= 0 || !entry) continue;
    items.push({ name: entry.name, kind: entry.kind, needed, added });
  }
  return { items, needed: items.reduce((n, i) => n + i.needed, 0) };
}

/** A headline and a line under it — what the confirmation says. */
export interface AddMessage {
  title: string;
  detail: string;
}

/**
 * Say what an add did.
 *
 * `what` is the page the add came from (a quest, a recipe), when there is one: a whole-quest add is
 * about the quest, and naming the first of its ten turn-ins instead would be a message about the
 * wrong thing.
 */
export function describeAdd(summary: AddSummary, what?: string): AddMessage {
  const [first] = summary.items;
  if (!first) {
    return {
      title: what ? `${what} is already on your list` : "Already on your list",
      detail: "Nothing new to add.",
    };
  }
  const title = `+ ${what ?? first.name}`;
  if (summary.items.length === 1) return { title, detail: itemDetail(first) };
  return {
    title,
    detail: `${count(summary.items.length, "item")} · ${summary.needed} to collect in all`,
  };
}

/**
 * The one-item line: how many you need now, and — when it isn't the whole story — how much of that
 * this press is responsible for. "+2 · 5 needed in total" is the case where the item was already
 * spoken for by something else, which is exactly when a bare "5 needed" would look like a mistake.
 */
function itemDetail(item: AddedItem): string {
  if (item.kind === "mob") return "Added as a target — see the Hunt tab";
  return item.added === item.needed
    ? `${item.needed} needed`
    : `+${item.added} · ${item.needed} needed in total`;
}
