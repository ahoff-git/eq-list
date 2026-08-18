/**
 * Black-box tests for what "+ Add" does with a wiki page.
 *
 * The bug these pin: the search results' "+ Add" added anything that wasn't a quest or a recipe as
 * an item, so "Kerran tiger spahi" — a named mob, correctly parsed as `kind: "mob"` — went onto the
 * shopping list as something to loot. A page is a thing you want or a source of them, never both.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { wikiAddAction, wikiAddKind } from "../../src/shared/wiki-add";
import type { WikiPage, WikiPageKind } from "../../src/shared/types";

const page = (kind: WikiPageKind, components: string[] = []): Pick<WikiPage, "kind" | "components"> => ({
  kind,
  components: components.map((name) => ({ name, qty: 1 })),
});

test("a mob adds itself — it's a thing you go and kill, not a thing that drops", () => {
  // It used to contribute its loot table instead, so "+ Add" on one named dumped a dozen item rows
  // on the list; with no loot listed it added nothing at all. Both were answers to a question
  // nobody asked. A mob goes on as a mob (`kind: "mob"`), whatever the wiki knows about its drops.
  assert.equal(wikiAddAction(page("mob", ["Kerran Doll", "Catman Skin"])), "self");
  assert.equal(wikiAddAction(page("mob")), "self");
});

test("a zone is a place, so there is nothing to add", () => {
  assert.equal(wikiAddAction(page("zone")), "none");
});

test("quests and recipes contribute what they list", () => {
  assert.equal(wikiAddAction(page("quest", ["Aviak Talon"])), "components");
  assert.equal(wikiAddAction(page("recipe", ["Water Flask"])), "components");
  // Empty is still "components": `addFromPage` adds the page itself, which is what a quest whose
  // turn-ins we couldn't read should do — the page still names something you want.
  assert.equal(wikiAddAction(page("quest")), "components");
});

test("a page that is an item adds itself", () => {
  for (const kind of ["item", "page", "spell"] as const) {
    assert.equal(wikiAddAction(page(kind)), "self", kind);
  }
  // An item with ingredients still adds itself; the ingredients are a second, opt-in button.
  assert.equal(wikiAddAction(page("item", ["Water Flask"])), "self");
});

// ── a `self` add has to say what it is filing ──────────────────────────────────
// `self` answered "the page is the thing you want" and was then *implemented* as "add an item", so a
// mob went onto the list with `kind` absent — which means item. It grew a progress count nothing
// could move, joined the loot matcher, and never reached the Hunt tab, which finds targets by kind.

test("a mob adds itself as a mob, not as an item", () => {
  assert.equal(wikiAddKind({ kind: "mob" }), "mob");
});

test("everything else adds itself as an item, which the entry says by saying nothing", () => {
  for (const kind of ["item", "page", "spell", "quest", "recipe", "zone"] as const) {
    assert.equal(wikiAddKind({ kind }), undefined, kind);
  }
});
