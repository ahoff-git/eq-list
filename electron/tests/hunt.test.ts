/**
 * Black-box tests for hunt aggregation: needed items + their drop sources invert
 * into zone → mob → items. Guards the grouping/sorting the Hunt tab relies on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHunt, neededEntries, huntInputsFor, type HuntInput } from "../../src/shared/hunt";
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
