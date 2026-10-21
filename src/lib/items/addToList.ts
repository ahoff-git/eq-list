"use client";
import { api } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { createLogger } from "@/shared/logging";
import { describeAdd, summarizeAdd } from "@/shared/items/list-add";
import { isMobEntry, normalizeItemName, originKey } from "@/shared/items/grouping";
import { heldSeeds } from "@/shared/items/held-seed";
import { wikiAddAction, wikiAddKind } from "@/shared/items/wiki-add";
import type { StepMaterial, StepNeed } from "@/shared/faction/step-needs";
import type { EqlApi, ShoppingList, ShoppingListEntry, WikiPage } from "@/shared/types";

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
 * A race-unlock step's materials onto the list, at the step's quantities, each started at what you
 * already hold (ADR 0322). Raises rather than adds: pressing it twice, or after adding the quest by
 * hand, must not ask for 1,600 when the step wants 800.
 *
 * An item step is a standalone entry; a quest step is the quest's own group, run `need.runs` times —
 * the same group "+ Add" on the quest's page makes, so the two meet rather than duplicate.
 */
export function addStepNeed(need: StepNeed, page: WikiPage | null, materials: readonly StepMaterial[]): Promise<void> {
  const held = new Map(materials.map((m) => [normalizeItemName(m.name), m.mine]));
  if (need.kind === "item") {
    return announce(async (list) => {
      let now = await list.get();
      const key = normalizeItemName(need.item);
      const existing = now.entries.find((e) => !e.origin && !isMobEntry(e) && normalizeItemName(e.name) === key);
      if (!existing) now = await list.add({ name: need.item, needed: need.qty });
      else if (existing.needed < need.qty) now = await list.update(existing.id, { needed: need.qty });
      return seed(list, now, undefined, held);
    }, itemKey(need.item));
  }
  if (!page) return Promise.resolve();
  const origin = { kind: page.kind, name: page.title };
  return announce(async (list) => {
    let now = await list.get();
    const key = originKey(origin);
    if (!now.entries.some((e) => originKey(e.origin) === key)) now = await list.addFromPage(page);
    if ((now.questRuns[key] ?? 1) < need.runs) now = await list.setRuns(key, need.runs);
    return seed(list, now, origin, held);
  }, pageKey(page.title), page.title);
}

async function seed(
  list: EqlApi["list"],
  now: ShoppingList,
  origin: ShoppingListEntry["origin"],
  held: ReadonlyMap<string, number>,
): Promise<ShoppingList> {
  for (const s of heldSeeds(now, origin, held)) now = await list.update(s.id, { obtained: s.obtained });
  return now;
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
