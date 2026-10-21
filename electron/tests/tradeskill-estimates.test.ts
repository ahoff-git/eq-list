/**
 * The Tradeskills tab's numbers: reading a price out of wiki text (`wiki-price.ts`), each step's skill
 * span and per-combine cost (`step-plan.ts`), and the combine / material / cost ranges built from them
 * (`step-cost.ts`) — plus a review of the committed data they produced.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { headerUnit, parsePriceCell, parsePriceText, priceFromNotes } from "../../src/shared/tradeskills/wiki-price";
import { cheapestChoice, costGuide, nameBeforeTo, planGuide, spanIn, statedPerCombine, stepCost, type PageLookup } from "../../src/shared/tradeskills/step-plan";
import { combineRange, costText, estimateStep, rangeText, roughCoins } from "../../src/shared/tradeskills/step-cost";
import { PRICES, TRADESKILLS } from "../../src/shared/tradeskills/tradeskills.generated";
import type { GuideLine, TradeskillGuide } from "../../src/shared/tradeskills/tradeskill-types";
import type { WikiPage } from "../../src/shared/types";

const link = (name: string) => ({ link: name, text: name });
const item = (title: string, components: [string, number][] = []): WikiPage => ({
  kind: components.length ? "recipe" : "item",
  title,
  wikiPath: `/${title}`,
  sources: [],
  components: components.map(([name, qty]) => ({ name, qty })),
  rewards: [],
  fetchedAt: "",
});
const lookup = (...pages: WikiPage[]): PageLookup => {
  const by = new Map(pages.map((p) => [p.title, p]));
  return { get: (t) => by.get(t) };
};

// ─── Prices out of wiki text ────────────────────────────────────────────────────────────────────

test("a price written the wiki's ways comes back in copper", () => {
  assert.equal(parsePriceText("Costs around 0.524pp"), 524);
  assert.equal(parsePriceText("Vendors sell this for approximately 5g3s"), 530);
  assert.equal(parsePriceText("2 plat 5 gold"), 2500);
  assert.equal(parsePriceText("about 7pp per combine, or 9pp elsewhere"), 7000, "only the first price");
  assert.equal(parsePriceText("used in 3 recipes"), null);
});

test("a cost header's unit, and a bare number only when the unit is known", () => {
  assert.equal(headerUnit("Material Cost (pp)"), 1000);
  assert.equal(headerUnit("Cost (CP)"), 1);
  assert.equal(headerUnit("Cost in Copper"), 1);
  assert.equal(headerUnit("Cost*"), undefined);
  assert.equal(parsePriceCell("0.503", 1000), 503);
  assert.equal(parsePriceCell("0.08pp", undefined), 80);
  assert.equal(parsePriceCell("20", undefined), null, "a bare number with no unit is not a price");
});

test("notes about what a merchant pays you are the other direction", () => {
  assert.equal(priceFromNotes("Costs around 0.524pp"), 524);
  assert.equal(priceFromNotes("Sells to vendors for 2s"), null);
});

// ─── Spans and per-combine cost ─────────────────────────────────────────────────────────────────

test("a span opens the step, or follows a Title Case name", () => {
  assert.deepEqual(spanIn("1 to 21: Metal Bits", 0), { from: 1, to: 21 });
  assert.deepEqual(spanIn("88-108", 0), { from: 88, to: 108 });
  assert.deepEqual(spanIn("up to 168: Ginesh", 151), { from: 151, to: 168 });
  assert.deepEqual(spanIn("Trivial 17 - Silver Bar + Malachite", 1), { from: 1, to: 17 });
  assert.deepEqual(spanIn("Flameless Lantern to 68", 50), { from: 50, to: 68 });
  assert.deepEqual(spanIn("302", 255), undefined, "a bare trivial is a table column's job");
  assert.deepEqual(spanIn("Distillate to 302", 255), { from: 255, to: 300 }, "capped at the skill cap");
  // Numbers further into a sentence are something else.
  assert.equal(spanIn("It takes about 40-55 attempts", 0), undefined);
  assert.equal(spanIn("Banded covers you to 115 but there is a path", 0), undefined);
  assert.equal(nameBeforeTo("Stalking Probes to 102"), "Stalking Probes");
});

test("a step's own stated cost per combine is read", () => {
  assert.equal(statedPerCombine("Ornate Chain Bracelet to 122 (~32pp per combine)"), 32000);
  assert.equal(statedPerCombine("This costs about 7pp per combine and will take you higher"), 7000);
  assert.equal(statedPerCombine("Gold Bar + Onyx"), undefined);
});

test("per-combine cost: stated, then the recipe's whole cost, then summed materials", () => {
  const book = {
    prices: { "Silver Bar": { copper: 530, source: "Silver Bar" }, Malachite: { copper: 50, source: "Malachite" } },
    combineCosts: { "Silver Malachite Ring": { copper: 553, source: "Jewelcrafting" } },
  };
  const needs = [{ name: "Silver Bar", qty: 1 }, { name: "Malachite", qty: 1 }];
  assert.deepEqual(stepCost("Ring (~1pp per combine)", ["Silver Malachite Ring"], needs, book), { copper: 1000, how: "stated" });
  assert.deepEqual(stepCost("", ["Silver Malachite Ring"], needs, book), { copper: 553, how: "recipe", source: "Jewelcrafting" });
  assert.deepEqual(stepCost("", [], needs, book), { copper: 580, how: "materials" });
  assert.deepEqual(stepCost("", [], [...needs, { name: "Water Flask", qty: 2 }], book), {
    copper: 580,
    how: "partial",
    unpriced: ["Water Flask"],
  });
  assert.equal(stepCost("", [], [{ name: "Water Flask", qty: 1 }], book), undefined, "nothing priced is no figure");
});

test("planning a guide: stage ranges start steps, spans chain, materials and costs land", () => {
  const lines: GuideLine[] = [
    { runs: ["Trivial 17 - ", link("Silver Bar"), " + ", link("Malachite")], makes: ["Silver Malachite Ring"] },
    { runs: ["Trivial 24 - ", link("Silver Bar"), " + ", link("Cat's Eye Agate")] },
    { runs: ["Go to ", link("Halas")] },
  ];
  const guide: TradeskillGuide = {
    name: "Leveling",
    anchor: "Leveling",
    blocks: [{ kind: "heading", level: 1, text: "Silver Jewelry (1-34)", anchor: "Silver" }, { kind: "list", items: lines }],
  };
  const pages = lookup(item("Silver Bar"), item("Malachite"), item("Cat's Eye Agate"), item("Silver Malachite Ring", [["Silver Bar", 1], ["Malachite", 1]]));
  planGuide(guide, pages);
  assert.deepEqual(lines[0].skill, { from: 1, to: 17 });
  assert.deepEqual(lines[1].skill, { from: 17, to: 24 });
  assert.equal(lines[2].skill, undefined, "an instruction has no span");
  assert.equal(lines[2].needs, undefined, "and gets no materials");
  assert.deepEqual(lines[0].needs, [{ name: "Silver Bar", qty: 1 }, { name: "Malachite", qty: 1 }]);
  costGuide(guide, pages, { prices: {}, combineCosts: { "Silver Malachite Ring": { copper: 553, source: "Jewelcrafting" } } });
  assert.deepEqual(lines[0].cost, { copper: 553, how: "recipe", source: "Jewelcrafting" });
  assert.equal(lines[1].cost, undefined);
});

test("ranges written end included leave no skill point between steps", () => {
  // Alchemy's table: "1-83", "84-150"; Tailoring's shares its ends ("15-26", "26-36") and is left alone.
  const header = ["Trivial", "Recipe", "Ingredient 1"];
  const alchemy: TradeskillGuide = {
    name: "g",
    anchor: "g",
    blocks: [{ kind: "table", header, rows: [[["1-83"], [link("Potion of Accuracy")], [link("Birthwort")]], [["84-150"], [link("Greater Potion of Accuracy")], [link("Birthwort")]], [["151-212"], [link("Elixir")], [link("Birthwort")]]] }],
  };
  planGuide(alchemy, lookup(item("Birthwort")));
  const spans = (alchemy.blocks[0] as { skill?: unknown }).skill;
  assert.deepEqual(spans, [{ from: 1, to: 84 }, { from: 84, to: 151 }, { from: 151, to: 212 }], "83 is the first step's; the last one's end is as written");

  const tailoring: TradeskillGuide = {
    name: "g",
    anchor: "g",
    blocks: [{ kind: "table", header: ["Range", "Item"], rows: [[["15-26"], [link("Boots")]], [["26-36"], [link("Headband")]], [["51-82"], [link("Mask")]]] }],
  };
  planGuide(tailoring, lookup());
  assert.deepEqual((tailoring.blocks[0] as { skill?: unknown }).skill, [{ from: 15, to: 26 }, { from: 26, to: 36 }, { from: 51, to: 82 }], "a real gap stays a gap");

  // Bullets too: "41 to 68" then "69 to 90".
  const lines: GuideLine[] = [{ runs: ["41 to 68: ", link("Large Lantern")] }, { runs: ["69 to 90: ", link("Banded Belt")] }];
  planGuide({ name: "g", anchor: "g", blocks: [{ kind: "list", items: lines }] }, lookup());
  assert.deepEqual([lines[0].skill, lines[1].skill], [{ from: 41, to: 69 }, { from: 69, to: 90 }]);
});

test("a pick-one need is stood for by its cheapest priced choice", () => {
  const need = { name: "Ruined Bear Pelt", qty: 1, alternatives: ["Ruined Wolf Pelt", "Ruined Cat Pelt"] };
  const prices = { "Ruined Wolf Pelt": { copper: 40, source: "x" }, "Ruined Cat Pelt": { copper: 25, source: "x" } };
  assert.deepEqual(cheapestChoice(need, prices), { name: "Ruined Cat Pelt", qty: 1, alternatives: ["Ruined Bear Pelt", "Ruined Wolf Pelt"] });
  assert.equal(cheapestChoice(need, {}), need, "none priced: the guide's first");
  // And the cost is one pelt's, not three.
  const lines: GuideLine[] = [{ runs: ["1 to 10: ", link("Boots")], skill: { from: 1, to: 10 }, needs: [need] }];
  costGuide({ name: "g", anchor: "g", blocks: [{ kind: "list", items: lines }] }, lookup(), { prices, combineCosts: {} });
  assert.equal(lines[0].needs?.[0].name, "Ruined Cat Pelt");
  assert.deepEqual(lines[0].cost, { copper: 25, how: "materials" });
});

test("the committed data: Alchemy's vials are five, Tailoring's pelts one choice, Alchemy's ranges meet", () => {
  const blocks = (name: string) => TRADESKILLS.find((t) => t.name === name)!.guides.flatMap((g) => g.blocks);
  const tables = (name: string) => blocks(name).flatMap((b) => (b.kind === "table" ? [b] : []));
  const needs = (name: string) => tables(name).flatMap((t) => t.needs ?? []).flat();
  assert.ok(needs("Alchemy").some((n) => n.name === "Small Vial" && n.qty === 5));
  const pelts = needs("Tailoring").filter((n) => /^Ruined (Bear|Wolf|Cat) Pelt$/.test(n.name));
  assert.equal(pelts.length, 1);
  assert.equal(pelts[0].alternatives?.length, 2);
  const spans = tables("Alchemy")[0].skill!.filter((s): s is NonNullable<typeof s> => !!s);
  spans.slice(1).forEach((s, i) => assert.equal(s.from, spans[i].to, `${JSON.stringify(spans[i])} then ${JSON.stringify(s)}`));
});

test("a step naming its result in plain text gets it, singular or not", () => {
  const lines: GuideLine[] = [{ runs: ["Stalking Probes to 102"] }];
  const guide: TradeskillGuide = { name: "g", anchor: "g", blocks: [{ kind: "text", runs: ["Remember you start at 50!"] }, { kind: "list", items: lines }] };
  planGuide(guide, lookup(item("Stalking Probe", [["Gears", 2], ["Bottle", 1]]), item("Gears"), item("Bottle")));
  assert.deepEqual(lines[0].skill, { from: 50, to: 102 });
  assert.deepEqual(lines[0].makes, ["Stalking Probe"]);
  assert.deepEqual(lines[0].needs, [{ name: "Gears", qty: 2 }, { name: "Bottle", qty: 1 }]);
});

// ─── Estimates ──────────────────────────────────────────────────────────────────────────────────

test("combines: one a point at least; the measured rates at most", () => {
  assert.deepEqual(combineRange({ from: 1, to: 17 }), { low: 16, high: 40 });
  assert.deepEqual(combineRange({ from: 158, to: 190 }), { low: 32, high: 240 }, "Tailoring measured 234 here");
  assert.deepEqual(combineRange({ from: 140, to: 160 }), { low: 20, high: 100 }, "a span across 150 takes both rates");
});

test("an estimate multiplies per-combine materials and leaves a whole-step purchase alone", () => {
  const e = estimateStep(
    { from: 1, to: 17 },
    [{ name: "Silver Bar", qty: 1 }, { name: "File Mold", qty: 3, total: true }],
    { copper: 553, how: "recipe", source: "Jewelcrafting" },
    { "Silver Bar": { copper: 530, source: "Silver Bar" }, "File Mold": { copper: 100, source: "File Mold" } },
  )!;
  assert.deepEqual(e.combines, { low: 16, high: 40 });
  assert.deepEqual(e.materials[0], { name: "Silver Bar", qty: { low: 16, high: 40 }, each: 530 });
  assert.deepEqual(e.materials[1].qty, { low: 3, high: 3 });
  assert.deepEqual(e.cost, { low: 553 * 16 + 300, high: 553 * 40 + 300 });
  assert.equal(e.unpriced, undefined);
});

test("an estimate says what its cost leaves out, and nothing without a span", () => {
  const e = estimateStep({ from: 21, to: 31 }, [{ name: "Water Flask", qty: 1 }], { copper: 1030, how: "partial", unpriced: ["Water Flask"] }, {})!;
  assert.deepEqual(e.unpriced, ["Water Flask"]);
  assert.equal(estimateStep(undefined, [{ name: "Silver Bar", qty: 1 }], undefined, {}), undefined);
});

test("figures read the way the guides write them", () => {
  assert.equal(rangeText({ low: 16, high: 40 }), "16–40");
  assert.equal(rangeText({ low: 3, high: 3 }), "3");
  assert.equal(roughCoins(530), "5g 3s");
  assert.equal(roughCoins(8848), "8.8pp");
  assert.equal(roughCoins(2_212_000), "2,212pp");
  assert.equal(costText({ low: 8848, high: 22120 }), "8.8pp–22.1pp");
});

// ─── The committed data ─────────────────────────────────────────────────────────────────────────

test("Jewelcrafting's first step carries a span, its materials and a cost", () => {
  const jc = TRADESKILLS.find((t) => t.name === "Jewelcrafting")!;
  const first = jc.guides.flatMap((g) => g.blocks).flatMap((b) => (b.kind === "list" ? b.items : [])).find((l) => l.makes?.includes("Silver Malachite Ring"));
  assert.deepEqual(first?.skill, { from: 1, to: 17 });
  assert.ok(first?.needs?.some((n) => n.name === "Silver Bar"));
  assert.ok(first?.cost && first.cost.copper > 0);
});

test("every committed price is a positive whole number of copper", () => {
  for (const [name, p] of Object.entries(PRICES)) {
    assert.ok(Number.isInteger(p.copper) && p.copper > 0, `${name}: ${p.copper}`);
    assert.ok(p.source, `${name} has no source`);
  }
});

test("a bold label's range goes to the step under it", () => {
  // Alchemy's "Simple Path": '''1 - 202 Skill''' over a one-bullet list.
  const lines: GuideLine[] = [{ runs: [link("Mystical Infusion")], children: [{ runs: ["2x ", link("Sickle Leaf")] }] }];
  const guide: TradeskillGuide = { name: "g", anchor: "g", blocks: [{ kind: "text", runs: ["1 - 202 Skill"], strong: true }, { kind: "list", items: lines }] };
  planGuide(guide, lookup(item("Mystical Infusion", [["Sickle Leaf", 2]]), item("Sickle Leaf")));
  assert.deepEqual(lines[0].skill, { from: 1, to: 202 });
  assert.deepEqual(lines[0].needs, [{ name: "Sickle Leaf", qty: 2 }]);
});
