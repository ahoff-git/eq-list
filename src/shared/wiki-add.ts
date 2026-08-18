/**
 * wiki-add.ts — what "+ Add" means for a wiki page, in one place.
 *
 * The rule was written twice: the page view gated its buttons by kind, while the search result's
 * "+ Add" only special-cased quests and recipes and added **everything else as an item**. So a mob
 * page added from the results list — "Kerran tiger spahi" — landed on the shopping list as a thing
 * to go and loot, which is not a thing that exists.
 *
 * The distinction the list cares about isn't the page's kind, it's whether the page is a **thing
 * you want** or a **source of things you want** — with one exception the first version got wrong.
 * A quest is only ever a source. A **mob is both**: it drops things, and it is also a thing you go
 * and kill, which is what a named you're camping actually is. So a mob adds *itself*, as an entry
 * of `kind: "mob"` that the list shows as a hunt target and the Hunt tab places from your own kills
 * — never as an item that might drop, which was the confusion, and never as its whole loot table,
 * which is what "+ Add" on one named used to dump onto the list.
 */
import type { ShoppingListEntry, WikiPage } from "./types";

/** `self` — the page is the item. `components` — the page lists them. `none` — neither. */
export type WikiAddAction = "self" | "components" | "none";

export function wikiAddAction(page: Pick<WikiPage, "kind" | "components">): WikiAddAction {
  switch (page.kind) {
    // Sources by definition. Both may legitimately parse with no components — a quest whose
    // turn-ins we couldn't read, a recipe that is only its result — and `addFromPage` adding the
    // page itself is the wanted answer there, since the page still names something you want.
    case "quest":
    case "recipe":
      return "components";
    // A mob is the thing you want *to kill*, so it adds itself — and does so whether or not the
    // wiki knows its loot, since what you're adding is the mob rather than its table. `addFromPage`
    // files it as `kind: "mob"`, which is what keeps it off the loot matcher.
    case "mob":
      return "self";
    // A place, not a thing.
    case "zone":
      return "none";
    default:
      return "self";
  }
}

/**
 * What kind of list entry a `self` add has to file.
 *
 * `undefined` is an item, which is every page but one. A **mob** must say so, and the reason is that
 * `self` was doing two jobs: "the page is the thing you want" and "the thing you want is an item".
 * For a mob only the first is true, so an add that dropped the kind put the named on the list as a
 * thing to loot — with a progress count nothing can move, credited by any loot line whose name
 * overlaps it, and invisible to the Hunt tab, which finds its targets by `kind: "mob"`. Exactly the
 * bug this file was written to end, one layer further down.
 *
 * Here rather than at the two call sites because "a mob adds itself *as a mob*" is one rule, and
 * duplicating it is how the page view and the results list drifted apart the first time.
 */
export function wikiAddKind(page: Pick<WikiPage, "kind">): ShoppingListEntry["kind"] {
  return page.kind === "mob" ? "mob" : undefined;
}
