/**
 * The crafting half of the Tradeskills tab: what a step asks you to buy (`step-materials.ts`) and what
 * an ingredient's hover says (`craft-notes.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { craftNotes } from "../../src/shared/tradeskills/craft-notes";
import { lineLinks, rowLinks, stepMaterials, stepMaterialsFor, stepTitles } from "../../src/shared/tradeskills/step-materials";
import type { JudgedLine } from "../../src/shared/tradeskills/tradeskill-era";
import type { ItemSource, WikiComponent, WikiPage } from "../../src/shared/types";
import { ZONE_EXPANSIONS, outOfEraSet } from "../../src/shared/zones/expansions";

const NONE: ReadonlySet<string> = new Set();
const link = (name: string) => ({ link: name, text: name });

function page(title: string, kind: WikiPage["kind"], extra: { components?: WikiComponent[]; sources?: ItemSource[] } = {}): WikiPage {
  return { kind, title, wikiPath: `/${title}`, sources: extra.sources ?? [], components: extra.components ?? [], rewards: [], fetchedAt: "" };
}
const crafted = (title: string, ...parts: [string, number][]) =>
  page(title, "recipe", { components: parts.map(([name, qty]) => ({ name, qty })) });
const pagesOf = (...ps: (WikiPage | [string, null])[]) =>
  new Map<string, WikiPage | null>(ps.map((p) => (Array.isArray(p) ? p : [p.title, p])));

// ─── What a step asks you to buy ────────────────────────────────────────────────────────────────

test("a table row: the header says which column is the result and which are carried", () => {
  // Tailoring's own header and its "Raw Silk Headband" row.
  const header = ["Range", "Trivial", "Item", "Ingredients", "Combine in", "Era"];
  const step = rowLinks(header, [["26-36"], ["36"], [link("Raw Silk Headband")], [link("Cap Pattern"), ", ", link("Silk Swatch")], [link("Loom")], [{ era: "classic" }]]);
  assert.equal(step.label, "Raw Silk Headband");
  assert.deepEqual(step.results, ["Raw Silk Headband"]);
  // Silk Swatch is itself crafted, but the header put it in Ingredients — it stays.
  const pages = pagesOf(crafted("Raw Silk Headband", ["Cap Pattern", 1]), page("Cap Pattern", "item"), crafted("Silk Swatch", ["Spider Silk", 2]));
  assert.deepEqual(stepMaterials(step, pages), [
    { name: "Cap Pattern", qty: 1 },
    { name: "Silk Swatch", qty: 1 },
  ]);
});

test("a count in front of a link is read; none means one", () => {
  const step = rowLinks(["Item", "Ingredients"], [[link("Silk Swatch")], ["2x ", link("Spider Silk")]]);
  assert.deepEqual(stepMaterials(step, pagesOf(page("Spider Silk", "item"))), [{ name: "Spider Silk", qty: 2 }]);
  const buy: JudgedLine = { runs: ["Buy 3 ", link("File Mold"), ", 53 ", link("Water Flask")] };
  assert.deepEqual(stepMaterials(lineLinks(buy), pagesOf(page("File Mold", "item"), page("Water Flask", "item"))), [
    { name: "File Mold", qty: 3, total: true },
    { name: "Water Flask", qty: 53, total: true },
  ]);
  // A trivial or a skill range in front of a link is not a count.
  const trivial: JudgedLine = { runs: ["Trivial 17 - ", link("Silver Bar"), " + ", link("Malachite")] };
  assert.deepEqual(stepMaterials(lineLinks(trivial), pagesOf(page("Silver Bar", "item"), page("Malachite", "item"))), [
    { name: "Silver Bar", qty: 1 },
    { name: "Malachite", qty: 1 },
  ]);
});

test("a lone bullet: a crafted item beside plain ones is the result, not an ingredient", () => {
  const line: JudgedLine = { runs: ["Trivial 218 - ", link("Platinum Bar"), " + ", link("Malachite"), " Result: ", link("Platinum Malachite Ring")] };
  const pages = pagesOf(page("Platinum Bar", "item"), page("Malachite", "item"), crafted("Platinum Malachite Ring", ["Enchanted Platinum Bar", 1], ["Malachite", 1]));
  assert.deepEqual(stepMaterials(lineLinks(line), pages).map((m) => m.name), ["Platinum Bar", "Malachite"]);
});

test("a bullet with bullets under it: what it links is made, what's under it is used", () => {
  // Brewing's Skull Ale: Short Beer is crafted but is named as an ingredient, so it stays.
  const line: JudgedLine = {
    runs: ["1 to 151: ", link("Skull Ale")],
    children: [{ runs: [link("Cyclops Skull"), " + ", link("Short Beer"), " + ", link("Spices")] }, { runs: ["Needs a skull from ", link("South Karana")] }],
  };
  const step = lineLinks(line);
  assert.deepEqual(step.results, ["Skull Ale"]);
  const pages = pagesOf(
    crafted("Skull Ale", ["Cyclops Skull", 1]),
    page("Cyclops Skull", "item"),
    crafted("Short Beer", ["Barley", 1]),
    page("Spices", "item"),
    page("South Karana", "zone"),
  );
  assert.deepEqual(stepMaterials(step, pages).map((m) => m.name), ["Cyclops Skull", "Short Beer", "Spices"]);
});

test("a step naming only what to make asks for what the first is made of — they're alternatives", () => {
  const line: JudgedLine = { runs: ["69 to 90: ", link("Banded Belt"), ", ", link("Banded Boots")], children: [{ runs: ["Gorget is cheapest."] }] };
  const pages = pagesOf(crafted("Banded Belt", ["Sheet Metal", 1], ["Water Flask", 1]), crafted("Banded Boots", ["Sheet Metal", 2], ["Boot Mold", 1]));
  assert.deepEqual(stepMaterials(lineLinks(line), pages), [
    { name: "Sheet Metal", qty: 1 },
    { name: "Water Flask", qty: 1 },
  ]);
  assert.deepEqual(stepMaterialsFor(lineLinks(line), pages), {
    materials: [{ name: "Sheet Metal", qty: 1 }, { name: "Water Flask", qty: 1 }],
    forResult: "Banded Belt",
    options: 2,
  });
});

test("zones, NPCs and quests are never ingredients", () => {
  const line: JudgedLine = { runs: ["Buy ", link("Birthwort"), " from ", link("Sithgok"), " in ", link("Innothule Swamp")] };
  const pages = pagesOf(page("Birthwort", "item"), page("Sithgok", "mob"), page("Innothule Swamp", "zone"));
  assert.deepEqual(stepMaterials(lineLinks(line), pages).map((m) => m.name), ["Birthwort"]);
});

test("a page that couldn't be read is left off — unless none could, then the guide's words stand", () => {
  // Brewing's Skull Ale step, seen from a web snapshot that never held the cyclops's page.
  const line: JudgedLine = { runs: [link("Skull Ale")], children: [{ runs: [link("Cyclops Skull"), " from ", link("An undead cyclops")] }] };
  const some = pagesOf(crafted("Skull Ale", ["Cyclops Skull", 1]), page("Cyclops Skull", "item"), ["An undead cyclops", null]);
  assert.deepEqual(stepMaterials(lineLinks(line), some).map((m) => m.name), ["Cyclops Skull"]);
  const none = pagesOf(["Skull Ale", null], ["Cyclops Skull", null], ["An undead cyclops", null]);
  assert.deepEqual(stepMaterials(lineLinks(line), none).map((m) => m.name), ["Cyclops Skull", "An undead cyclops"]);
});

test("every title a step could need is asked for once", () => {
  const step = rowLinks(["Recipe", "Ingredient 1", "Ingredient 2"], [[link("Potion")], [link("Birthwort")], [link("Birthwort")]]);
  assert.deepEqual(stepTitles(step), ["Potion", "Birthwort"]);
});

test("a long step label is shortened", () => {
  const line: JudgedLine = { runs: ["x".repeat(100), link("Silver Bar")] };
  assert.ok(lineLinks(line).label.length <= 60);
});

// ─── What a hover says ──────────────────────────────────────────────────────────────────────────

const vendor = (where: string, zone: string): ItemSource => ({ kind: "vendor", where, detail: zone });

test("an ingredient sold by vendors says where, a couple at a time", () => {
  const p = page("Birthwort", "item", { sources: [vendor("Klok Scaleroot", "West Cabilis"), vendor("Blergagg", "Grobb"), vendor("Dargon", "Halas")] });
  assert.deepEqual(craftNotes(p, NONE), ["Buy: Klok Scaleroot (West Cabilis), Blergagg (Grobb) +1 more"]);
});

test("a merchant in a shut zone is not somewhere to buy", () => {
  const kunark = outOfEraSet(ZONE_EXPANSIONS.find((e) => e.expansion === "The Ruins of Kunark")?.zones ?? []);
  const p = page("Birthwort", "item", { sources: [vendor("Marlyn McMerin", "Firiona Vie"), vendor("Blergagg", "Grobb")] });
  assert.deepEqual(craftNotes(p, kunark), ["Buy: Blergagg (Grobb)"]);
  const only = page("Lizard Thing", "item", { sources: [vendor("Marlyn McMerin", "Firiona Vie")] });
  assert.deepEqual(craftNotes(only, kunark), ["Sold only in zones not open yet"]);
});

test("not sold: says how else it comes, and what it's made from when crafted", () => {
  const dropped = page("Spider Silk", "item", {
    sources: [
      { kind: "drop", where: "a large spider", detail: "Butcherblock Mountains" },
      { kind: "drop", where: "a giant spider", detail: "Commonlands" },
      { kind: "recipe", where: "Silk Swatch" },
    ],
  });
  assert.deepEqual(craftNotes(dropped, NONE), ["Not sold by vendors — drops in 2 zones", "Used in 1 recipe"]);
  const made = page("Silk Swatch", "recipe", {
    components: [{ name: "Spider Silk", qty: 2 }, { name: "Spider Silk", qty: 2 }],
    sources: [{ kind: "recipe", where: "Player crafted" }],
  });
  assert.deepEqual(craftNotes(made, NONE), ["Made from: 2× Spider Silk"]);
});

test("a zone or an NPC gets no crafting lines", () => {
  assert.deepEqual(craftNotes(page("Halas", "zone"), NONE), []);
  assert.deepEqual(craftNotes(null, NONE), []);
});

test("a step the generator named lists its ingredients under the thing it makes", () => {
  const line: JudgedLine = { runs: ["Trivial 17 - ", link("Silver Bar"), " + ", link("Malachite")], makes: ["Silver Malachite Ring"] };
  const step = lineLinks(line);
  assert.equal(step.label, "Silver Malachite Ring");
  assert.deepEqual(step.results, ["Silver Malachite Ring"]);
  const pages = pagesOf(page("Silver Bar", "item"), page("Malachite", "item"), crafted("Silver Malachite Ring", ["Enchanted Silver Bar", 1], ["Malachite", 1]));
  // The guide's plain bar, not the recipe page's enchanted one: the guide says plain bars skill up.
  assert.deepEqual(stepMaterials(step, pages).map((m) => m.name), ["Silver Bar", "Malachite"]);
});

test("a table row's found result names it too", () => {
  const step = rowLinks(["Sketch", "Clay", "Water"], [[link("Bowl Sketch")], [link("Clay")], [link("Water Flask")]], ["Small Bowl"]);
  assert.equal(step.label, "Small Bowl");
  assert.deepEqual(step.results, ["Small Bowl"]);
});

test("'Need to buy 40 …' is a whole-step purchase too", () => {
  const line: JudgedLine = { runs: ["Need to buy 40 ", link("Lantern Casing Mold"), " and 40 ", link("Bottle")] };
  const got = stepMaterials(lineLinks(line), pagesOf(page("Lantern Casing Mold", "item"), page("Bottle", "item")));
  assert.deepEqual(got, [
    { name: "Lantern Casing Mold", qty: 40, total: true },
    { name: "Bottle", qty: 40, total: true },
  ]);
});
