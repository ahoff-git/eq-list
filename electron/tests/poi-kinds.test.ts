/**
 * Black-box tests for classifying a map label. **Every input here is a real label** from the
 * bundled packs — that's the point: the classifier exists so the map can offer to hide the kinds
 * you don't want, and it has to agree with what the mapmakers actually wrote.
 *
 * The colors those labels wear corroborate it (zone lines are red, quest givers teal/blue, forges
 * purple), but the color is a per-author convention — the same kind comes in `255,0,0` and
 * `240,0,0` — so the text is what's trusted. See `poi-kinds.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { POI_KINDS, poiKind, poiKindSummary } from "../../src/shared/map/poi-kinds";
import type { MapPoi } from "../../src/shared/map/eqmap";

const poi = (label: string, color?: string, z = 0): MapPoi => ({ y: 0, x: 0, z, label, color, size: 2 });

test("a zone line or succor point is travel", () => {
  for (const label of [
    "to The Steamfont Mountains",
    "to Grimling Forest",
    "To Plane of Knowledge", // packs are inconsistent about the capital
    "Succor",
    "to Butcherblock Mountains",
  ])
    assert.equal(poiKind(label), "travel", label);
});

test("a quest marker or a quest giver is a quest", () => {
  for (const label of ["GS: Questionable Cheese", "Gorbak (Quests)", "Tesil Gludien (Task Master)", "Spirit Hunter Azmaro (Missions)"])
    assert.equal(poiKind(label), "quest", label);
});

test("a trade in parentheses is a merchant — the commonest shape in the whole corpus", () => {
  for (const label of ["Gruppip (Wizard Spells)", "Ermden (Weapons)", "Willaen (Banker)", "Tialechaety (Tinkering Supplies)", "Yuggom (GM Wizard)"])
    assert.equal(poiKind(label), "merchant", label);
});

test("a tradeskill station is named by the object, not a person", () => {
  for (const label of ["Forge", "Loom", "Kiln", "Oven", "Pottery Wheel", "Brew Barrel"])
    assert.equal(poiKind(label), "craft", label);
});

test("an article means an ordinary spawn; a bare proper name doesn't", () => {
  // The same a/an/the signal the cast-alert matcher uses to tell a mob from a player.
  for (const label of ["a grimling arcanist", "a grimling arch sage", "The Sleeper"]) assert.equal(poiKind(label), "mob", label);
  for (const label of ["Hexxt Shadowslayer", "Arias", "Grimling Forest", "Ring of Fire"])
    assert.equal(poiKind(label), "named", label);
});

test("what's left is a note, not a guess", () => {
  for (const label of ["map by Cardiac of Drinal", "-1200, 400 tunnel", ""]) assert.equal(poiKind(label), "note", label);
  // A long sentence isn't somebody's name.
  assert.equal(poiKind("Follow the wall east then down the ramp to the water"), "note");
});

test("a quest giver is not mistaken for a merchant, though both wear a parenthetical", () => {
  assert.equal(poiKind("Gnashclaw Stonefe (Quests)"), "quest");
  assert.equal(poiKind("Gnashclaw Stonefe (Armor)"), "merchant");
});

test("the summary lists only the kinds a map has, in display order, with counts", () => {
  const summary = poiKindSummary([
    poi("to Lake Rathetear", "rgb(255, 0, 0)"),
    poi("Succor", "rgb(255, 0, 0)"),
    poi("Forge", "rgb(128, 0, 128)"),
    poi("a grimling arcanist"),
  ]);
  assert.deepEqual(
    summary.map((s) => [s.kind, s.count]),
    [
      ["travel", 2],
      ["craft", 1],
      ["mob", 1],
    ],
  );
  // Order follows POI_KINDS, so the panel doesn't reshuffle between zones.
  const order = POI_KINDS.map((k) => k.kind);
  assert.deepEqual(
    summary.map((s) => s.kind),
    order.filter((k) => summary.some((s) => s.kind === k)),
  );
  // A zone with no quest markers doesn't offer to hide them.
  assert.ok(!summary.some((s) => s.kind === "quest"));
});

test("each row reports the color those labels actually wear here, not one we assumed", () => {
  const summary = poiKindSummary([
    poi("to A", "rgb(255, 0, 0)"),
    poi("to B", "rgb(255, 0, 0)"),
    poi("to C", "rgb(240, 0, 0)"), // the same kind, a different author's red
    poi("a bat"), // no color in the file at all
  ]);
  assert.equal(summary.find((s) => s.kind === "travel")?.color, "rgb(255, 0, 0)");
  assert.equal(summary.find((s) => s.kind === "mob")?.color, undefined);
});

test("the brackets outrank the article, both ways", () => {
  // Two real Brewall labels that a simpler order gets backwards: "(Hunter)" marks a spawn on the
  // Hunter achievement list, while "(Research)" marks a shopkeeper — and both start with "a".
  assert.equal(poiKind("a reanimating hand (Hunter)"), "mob");
  assert.equal(poiKind("Garanel Rucksif (Hunter)"), "mob");
  assert.equal(poiKind("a spell research merchant (Research)"), "merchant");
  // A station keeps being a station even when it wears a trade's brackets.
  assert.equal(poiKind("Feir`Dal Forge (Cultural)"), "craft");
  // And an article-led name isn't dragged into a station by a word inside it.
  assert.equal(poiKind("a barrel golem"), "mob");
});

test("a parenthetical that describes an action is a note, not a trade", () => {
  assert.equal(poiKind("Hidden Door (Click to Open)"), "note");
});

test("the mapmaker's floor labels are their own kind, not notes", () => {
  // They're also what drives the floor picker (`detectFloors`), so they're recognised by the same
  // test rather than a second guess at the same thing.
  for (const label of ["1st Floor", "4th Floor", "Level 2", "Level 1 (Top)"])
    assert.equal(poiKind(label), "floor", label);
  // While a feature that merely *mentions* a level is not a storey marker — which bucket it lands
  // in is a judgement call ("Water - LVL 3" reads as a place), but it must never be a floor, or
  // hiding the floor legend would take real features with it.
  for (const label of ["Water - LVL 3", "Bridge - LVL 2", "TRAP: Fake Floor"])
    assert.notEqual(poiKind(label), "floor", label);
});
