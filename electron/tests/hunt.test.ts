/**
 * Black-box tests for hunt aggregation: needed items + their drop sources invert
 * into zone → mob → items. Guards the grouping/sorting the Hunt tab relies on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildHunt,
  huntHasWork,
  huntInputsFor,
  huntTargetsFor,
  huntZoneOptions,
  neededEntries,
  type HuntInput,
} from "../../src/shared/hunt";
import type { MobKnowledge } from "../../src/shared/mob-stats";
import type { ItemSource, ShoppingListEntry } from "../../src/shared/types";

const drop = (where: string, zone: string): ItemSource => ({ kind: "drop", where, detail: zone });

function item(name: string, sources: ItemSource[], needed = 1, obtained = 0): HuntInput {
  return { name, needed, obtained, sources };
}

test("groups needed items under the mob + zone that drop them", () => {
  const zones = buildHunt([
    item("Hill Giant Toes", [drop("A Hill Giant", "Rathe Mountains")]),
    item("Lambent Stone", [drop("A Hill Giant", "Rathe Mountains")]),
  ]);
  assert.equal(zones.length, 1);
  assert.equal(zones[0].zone, "Rathe Mountains");
  assert.equal(zones[0].mobs.length, 1);
  assert.equal(zones[0].mobs[0].mob, "A Hill Giant");
  assert.deepEqual(
    zones[0].mobs[0].items.map((i) => i.item).sort(),
    ["Hill Giant Toes", "Lambent Stone"],
  );
});

test("ignores non-drop sources", () => {
  const zones = buildHunt([
    item("Bone Chips", [{ kind: "vendor", where: "Merchant", detail: "Qeynos" }]),
  ]);
  assert.equal(zones.length, 0);
});

test("zones and mobs sort by how much of your list they cover", () => {
  const zones = buildHunt([
    item("A", [drop("Mob1", "Busy Zone"), drop("Loner", "Quiet Zone")]),
    item("B", [drop("Mob1", "Busy Zone")]),
    item("C", [drop("Mob2", "Busy Zone")]),
  ]);
  // Busy Zone (3 refs) before Quiet Zone (1).
  assert.equal(zones[0].zone, "Busy Zone");
  assert.equal(zones[1].zone, "Quiet Zone");
  // Within Busy Zone, Mob1 (2 items) before Mob2 (1).
  assert.equal(zones[0].mobs[0].mob, "Mob1");
  assert.equal(zones[0].mobs[0].items.length, 2);
});

test("a mob dropping the same item twice lists it once", () => {
  const zones = buildHunt([
    item("Fine Steel Dagger", [drop("A Guard", "Freeport"), drop("A Guard", "Freeport")]),
  ]);
  assert.equal(zones[0].mobs[0].items.length, 1);
});

function entry(p: Partial<ShoppingListEntry> & { name: string }): ShoppingListEntry {
  return { id: p.name, needed: 1, obtained: 0, addedAt: "", ...p };
}

test("neededEntries drops satisfied entries and respects quest runs", () => {
  const origin = { kind: "quest" as const, name: "Q" };
  const entries = [
    entry({ name: "Done", needed: 2, obtained: 2 }),
    entry({ name: "Short", needed: 2, obtained: 1 }),
    entry({ name: "RunScaled", needed: 1, obtained: 1, origin }), // 1/1 at ×1 = done…
  ];
  assert.deepEqual(neededEntries(entries, {}).map((e) => e.name), ["Short"]);
  // …but ×3 runs makes RunScaled (needs 3) incomplete again.
  assert.deepEqual(
    neededEntries(entries, { "quest:Q": 3 }).map((e) => e.name).sort(),
    ["RunScaled", "Short"],
  );
});

test("huntInputsFor scales needed by runs and attaches sources", () => {
  const origin = { kind: "quest" as const, name: "Q" };
  const entries = [entry({ name: "Talon", needed: 4, obtained: 1, origin })];
  const sources = { Talon: [drop("A Bird", "Aviak Village")] };
  const [input] = huntInputsFor(entries, sources, { "quest:Q": 2 });
  assert.equal(input.needed, 8); // 4 × 2 runs
  assert.equal(input.obtained, 1);
  assert.equal(input.sources.length, 1);
});

// ── mobs on the list are targets, not phantom items ────────────────────────────
// Adding a named used to put its loot table on the list, or — with no loot listed — the mob's own
// name as an item that could never be looted. A mob is a thing to *kill*.

test("a mob entry is never an outstanding item, whatever its counts say", () => {
  const entries = [entry({ name: "Ghoul Lord", needed: 1, obtained: 0, kind: "mob" })];
  assert.deepEqual(neededEntries(entries, {}), [], "it can never be satisfied, so it can never be pending");
});

test("a mob target lands in the zones you've killed it in", () => {
  const zones = buildHunt([], [{ mob: "Ghoul Lord", zones: ["Lower Guk"] }]);
  assert.deepEqual(zones.map((z) => z.zone), ["Lower Guk"]);
  assert.equal(zones[0].mobs[0].mob, "Ghoul Lord");
  assert.equal(zones[0].mobs[0].target, true);
  assert.deepEqual(zones[0].mobs[0].items, [], "a target needs no items to belong on the list");
});

test("a mob you've never killed is still listed, with its home unknown", () => {
  const zones = buildHunt([], [{ mob: "Ghoul Lord", zones: [] }]);
  assert.deepEqual(zones.map((z) => z.zone), ["Unknown zone"]);
  assert.equal(zones[0].mobs[0].target, true);
});

test("a target leads its zone, over mobs that merely drop things", () => {
  const zones = buildHunt(
    [{ name: "Talon", needed: 1, obtained: 0, sources: [drop("A Bird", "Lower Guk"), drop("A Bat", "Lower Guk")] }],
    [{ mob: "Ghoul Lord", zones: ["Lower Guk"] }],
  );
  assert.equal(zones[0].mobs[0].mob, "Ghoul Lord", "you asked for this one by name");
});

test("a mob can be both a target and a source, and is one row either way", () => {
  const zones = buildHunt(
    [{ name: "Cape", needed: 1, obtained: 0, sources: [drop("Ghoul Lord", "Lower Guk")] }],
    [{ mob: "Ghoul Lord", zones: ["Lower Guk"] }],
  );
  assert.equal(zones[0].mobs.length, 1);
  assert.equal(zones[0].mobs[0].target, true);
  assert.deepEqual(zones[0].mobs[0].items.map((i) => i.item), ["Cape"]);
});

test("a zone worth visiting only for a target still outranks an empty one", () => {
  const zones = buildHunt(
    [{ name: "Talon", needed: 1, obtained: 0, sources: [drop("A Bird", "Aviak Village")] }],
    [{ mob: "Ghoul Lord", zones: ["Lower Guk"] }],
  );
  // One reason each, so they tie on weight and sort by name — the point is that the target zone
  // scores at all, where counting only items would have sunk it to the bottom.
  assert.deepEqual(zones.map((z) => z.zone).sort(), ["Aviak Village", "Lower Guk"]);
});

// ---- a target is placed by your own kills, and counts as work ------------------

/** A pooled tally for one mob in one zone. `myKills` is the half that says it's yours. */
function tally(mob: string, zone: string, myKills: number, kills = myKills): MobKnowledge {
  return {
    mob,
    zone,
    kills,
    myKills,
    drops: [],
    lastAt: "",
    contributors: myKills < kills ? ["a peer"] : [],
    copper: 0,
    copperPerKill: 0,
  };
}

test("a target is placed where you have killed it yourself", () => {
  const targets = huntTargetsFor([entry({ name: "Ghoul Lord", kind: "mob" })], [tally("Ghoul Lord", "Lower Guk", 4)]);
  assert.deepEqual(targets, [{ mob: "Ghoul Lord", zones: ["Lower Guk"] }]);
});

test("a peer's word is not a direction — a place only they have seen it is not offered", () => {
  // Pooling is right for a rate; "go here" is something you must be able to check, so a zone you
  // have never killed it in comes back blank rather than on somebody else's authority.
  const targets = huntTargetsFor(
    [entry({ name: "Ghoul Lord", kind: "mob" })],
    [tally("Ghoul Lord", "Lower Guk", 0, 30)],
  );
  assert.deepEqual(targets, [{ mob: "Ghoul Lord", zones: [] }]);
  // ...and it is still listed, with its home unknown.
  assert.equal(buildHunt([], targets)[0].zone, "Unknown zone");
});

test("a camp you contributed to is yours, however much a peer added to it", () => {
  const targets = huntTargetsFor(
    [entry({ name: "Ghoul Lord", kind: "mob" })],
    [tally("Ghoul Lord", "Lower Guk", 2, 60)],
  );
  assert.deepEqual(targets[0].zones, ["Lower Guk"]);
});

test("the article is folded, so the wiki's spelling finds the kill log's", () => {
  const targets = huntTargetsFor([entry({ name: "a Ghoul Lord", kind: "mob" })], [tally("Ghoul Lord", "Lower Guk", 3)]);
  assert.deepEqual(targets[0].zones, ["Lower Guk"]);
});

test("a list of nothing but targets still has work to do", () => {
  // A target has no count to complete, so it is absent from `neededEntries` — and measuring the
  // hunt by outstanding items alone told a list of named mobs there was nothing left to hunt.
  const entries = [entry({ name: "Ghoul Lord", kind: "mob" })];
  assert.deepEqual(neededEntries(entries, {}), []);
  assert.equal(huntHasWork(neededEntries(entries, {}), huntTargetsFor(entries, [tally("Ghoul Lord", "Lower Guk", 1)])), true);
});

test("an empty list, and a finished one, have nothing to hunt", () => {
  assert.equal(huntHasWork([], []), false);
  const done = [entry({ name: "Bone Chips", needed: 2, obtained: 2 })];
  assert.equal(huntHasWork(neededEntries(done, {}), huntTargetsFor(done, [])), false);
});

test("the zone picker offers a target's camp as well as an item's sources", () => {
  const needed = [entry({ name: "Talon" })];
  const sources = { Talon: [drop("A Bird", "Aviak Village")] };
  const targets = huntTargetsFor([entry({ name: "Ghoul Lord", kind: "mob" })], [tally("Ghoul Lord", "Lower Guk", 3)]);
  // Without the second half, the one camp you asked for by name was the one you couldn't narrow to.
  assert.deepEqual(huntZoneOptions(needed, sources, targets), ["Aviak Village", "Lower Guk"]);
});

test("the picker names one zone once, however many ways it is spelled", () => {
  const needed = [entry({ name: "Talon" }), entry({ name: "Feather" })];
  const sources = { Talon: [drop("A Bird", "The Feerrott")], Feather: [drop("A Bat", "Feerrott")] };
  assert.deepEqual(huntZoneOptions(needed, sources, []), ["The Feerrott"], "first spelling seen wins");
});
