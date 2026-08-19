"use client";
import { api } from "./api";
import { showToast } from "./toast";
import { createLogger } from "@/shared/logging";
import { describeAdd, summarizeAdd } from "@/shared/list-add";
import { normalizeItemName } from "@/shared/grouping";
import { wikiAddAction, wikiAddKind } from "@/shared/wiki-add";
import type { EqlApi, ShoppingList, WikiPage } from "@/shared/types";

/**
 * addToList.ts — every "+ Add" in the app, and the notice each one raises.
 *
 * The adds themselves are one-liners over `api().list`; what they were missing is an *answer*. The
 * list is another tab (usually another process's data entirely), so pressing + moved nothing on
 * screen and the only way to know it had worked was to go and look. Every add therefore reads the
 * list before and after and says what changed (`shared/list-add.ts`), which also makes it the place
 * "what does adding a page mean" is decided — a rule the results list and the page view had each
 * written for themselves once already (see `wiki-add.ts`).
 */
const log = createLogger("add-to-list");

type ListAdd = (list: EqlApi["list"]) => Promise<ShoppingList>;

/** What a notice is about, so a second press updates the first instead of stacking beside it. */
const itemKey = (name: string) => `item:${normalizeItemName(name)}`;
const pageKey = (title: string) => `page:${normalizeItemName(title)}`;

/**
 * Run an add, then say what it did.
 *
 * `what` names the page the add came from, when there is one — a whole-quest add is about the quest,
 * not about the first of its turn-ins. `key` is what the notice is *about*: pressing + a second time
 * on the same row must not leave two cards up saying you need 1 and 2 of the thing, so the newer
 * figures take the older card's place (`shared/toasts.ts`).
 */
async function announce(add: ListAdd, key: string, what?: string): Promise<void> {
  const a = api();
  if (!a) return;
  const before = await a.list.get();
  const after = await add(a.list);
  const summary = summarizeAdd(before, after);
  log.debug("added", what ?? "", summary);
  showToast({ ...describeAdd(summary, what), key, tone: summary.items.length ? "good" : "info" });
}

/** One item onto the list — the plain add every "+ Add" beside a name makes. */
export function addItem(input: Parameters<EqlApi["list"]["add"]>[0]): Promise<void> {
  return announce((list) => list.add(input), itemKey(input.name));
}

/** A page's contribution: a quest's turn-ins, a recipe's ingredients, or the page itself. */
export function addPage(page: WikiPage): Promise<void> {
  return announce((list) => list.addFromPage(page), pageKey(page.title), page.title);
}

/** Just the thing the page *is* — the recipe's result, the mob itself. */
export function addPageItself(page: WikiPage): Promise<void> {
  return announce(
    (list) => list.add({ name: page.title, kind: wikiAddKind(page), wikiPath: page.wikiPath }),
    itemKey(page.title),
  );
}

/**
 * Add by name the way the page buttons do, for a row in a results list.
 *
 * Fetches the page (cached in main) to learn what the name *is*, so a quest contributes its turn-ins
 * and a mob is filed as a mob — the alternative being a results-list "+ Add" that claims to do what
 * opening the page does and doesn't. A name with no page at all is still addable: it may be one only
 * your own log knows ([ADR 0103](../../specs/decisions/0103-search-can-answer-from-your-own-log.md)).
 */
export async function addByTitle(title: string, wikiPath?: string): Promise<void> {
  const a = api();
  if (!a) return;
  const page = await a.wiki.getPage(title);
  if (!page) return addItem({ name: title, wikiPath });
  const action = wikiAddAction(page);
  if (action === "components") return addPage(page);
  if (action === "self") return addPageItself(page);
}
