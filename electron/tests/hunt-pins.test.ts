/**
 * Black-box tests for hunt pins: the built hunt plus anything that can place its mobs becomes a mark
 * on the map (ADR 0142). Guards the two rules that decide whether one appears — the hunt wants it,
 * and something can place it here — the ranking of the three sources, and the wording that says what
 * a mark rests on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { huntPins, unplacedHuntMobs } from "../../src/shared/map/hunt-pins";
import { buildHunt, type HuntInput } from "../../src/shared/hunt";
import type { MobKnowledge, MobObservation } from "../../src/shared/mob-stats";
import type { ItemSource } from "../../src/shared/types";

const drop = (where: string, zone: string): ItemSource => ({ kind: "drop", where, detail: zone });

function item(name: string, sources: ItemSource[]): HuntInput {
  return { name, needed: 1, obtained: 0, sources };
}

/** A pooled knowledge row for one mob in one zone, with a roam area unless told otherwise. */
function known(mob: string, over: Partial<MobKnowledge> = {}): MobKnowledge {
  return {
    mob,
    zone: "Lower Guk",
    kills: 10,
    myKills: 10,
    drops: [],
    area: { y: 100, x: -200, spread: 30, samples: 8 },
    lastAt: "2026-01-01T00:00:00Z",
    contributors: [],
    copper: 0,
    copperPerKill: 0,
    ...over,
  };
}

/** One of your own observations of that mob — the half of the pool you can check. */
function mine(mob: string, over: Partial<MobObservation> = {}): MobObservation {
  return {
    mob,
    zone: "Lower Guk",
    kills: 10,
    drops: {},
    area: { y: 100, x: -200, spread: 30, samples: 8 },
    lastAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

const SASH = buildHunt([item("Sash", [drop("Ghoul Lord", "Lower Guk")])]);

test("marks a hunted mob where this zone's kills place it", () => {
  const [pin, ...rest] = huntPins({ hunt: SASH, zone: "Lower Guk", known: [known("Ghoul Lord")], mine: [mine("Ghoul Lord")] });
  assert.equal(rest.length, 0);
  assert.equal(pin.mob, "Ghoul Lord");
  assert.equal(pin.title, "Ghoul Lord");
  assert.deepEqual([pin.y, pin.x, pin.spread], [100, -200, 30]);
  assert.equal(pin.source, "yours");
  assert.deepEqual(pin.items, ["Sash"]);
  assert.equal(pin.target, false);
  // The hover says what it's for and how rough the position is — a roam centre is an average of
  // where it died, not a spawn point, so the pin has to carry the hedge with it.
  assert.match(pin.note, /drops Sash/);
  assert.match(pin.note, /within about 30 units/);
});

test("a mob nothing on your list wants is not marked", () => {
  const hunt = buildHunt([item("Bone Chips", [drop("a decaying skeleton", "Lower Guk")])]);
  assert.deepEqual(huntPins({ hunt, zone: "Lower Guk", known: [known("Ghoul Lord")] }), []);
});

test("a hunted mob nothing can place is left off rather than guessed at", () => {
  assert.deepEqual(huntPins({ hunt: SASH, zone: "Lower Guk", known: [known("Ghoul Lord", { area: undefined })] }), []);
  // And a mob with no row here at all, whose page states nothing either.
  assert.deepEqual(huntPins({ hunt: SASH, zone: "Lower Guk" }), []);
});

test("the wiki's article and case meet the kill log's stripped name", () => {
  const hunt = buildHunt([item("Fang", [drop("A Froglok Ilis Knight", "Lower Guk")])]);
  const pins = huntPins({ hunt, zone: "Lower Guk", known: [known("froglok ilis knight")] });
  assert.equal(pins.length, 1);
  // Named as whatever placed it has it — here the kill log, which is what the map's lists are keyed by.
  assert.equal(pins[0].mob, "froglok ilis knight");
});

test("a mob on your list in its own right is marked with nothing to drop", () => {
  const hunt = buildHunt([], [{ mob: "Ghoul Lord", zones: ["Lower Guk"] }]);
  const [pin] = huntPins({ hunt, zone: "Lower Guk", known: [known("Ghoul Lord")] });
  assert.equal(pin.target, true);
  assert.deepEqual(pin.items, []);
  assert.match(pin.note, /On your list/);
});

test("a mob wanted in another zone is still marked where you have killed it", () => {
  // The hunt zone is the wiki's wording for where an item drops; the position is a kill recorded
  // here. Where you've actually killed it wins — that's the only thing that can place anything.
  const hunt = buildHunt([item("Sash", [drop("Ghoul Lord", "Upper Guk")])]);
  const pins = huntPins({ hunt, zone: "Lower Guk", known: [known("Ghoul Lord", { zone: "Lower Guk" })] });
  assert.equal(pins.length, 1);
  assert.deepEqual(pins[0].items, ["Sash"]);
});

test("everything one mob is wanted for lands on its one pin", () => {
  const hunt = buildHunt(
    [item("Sash", [drop("Ghoul Lord", "Lower Guk")]), item("Robe", [drop("Ghoul Lord", "Upper Guk")])],
    [{ mob: "Ghoul Lord", zones: ["Lower Guk"] }],
  );
  const pins = huntPins({ hunt, zone: "Lower Guk", known: [known("Ghoul Lord")] });
  assert.equal(pins.length, 1);
  assert.equal(pins[0].target, true);
  assert.deepEqual(pins[0].items.sort(), ["Robe", "Sash"]);
});

test("a spot you already pinned by hand isn't marked twice", () => {
  const at = (y: number, x: number) => huntPins({ hunt: SASH, zone: "Lower Guk", known: [known("Ghoul Lord")], placed: [{ y, x }] });
  assert.deepEqual(at(100, -200), []);
  // A pin somewhere else in the zone is a different claim and doesn't suppress it.
  assert.equal(at(0, 0).length, 1);
});

test("a mob you asked for by name leads, then it's by name", () => {
  const hunt = buildHunt(
    [item("Sash", [drop("Zombie", "Lower Guk"), drop("Ancient Croc", "Lower Guk")])],
    [{ mob: "Ghoul Lord", zones: ["Lower Guk"] }],
  );
  const pins = huntPins({
    hunt,
    zone: "Lower Guk",
    known: [known("Zombie"), known("Ancient Croc"), known("Ghoul Lord")],
  });
  assert.deepEqual(pins.map((p) => p.mob), ["Ghoul Lord", "Ancient Croc", "Zombie"]);
});

test("an empty hunt marks nothing", () => {
  assert.deepEqual(huntPins({ hunt: [], zone: "Lower Guk", known: [known("Ghoul Lord")] }), []);
});

// ── the three sources ────────────────────────────────────────────────────────

test("a peer's kills place a mob you have never killed, and the mark says whose they are", () => {
  const theirs = known("Ghoul Lord", { myKills: 0, contributors: ["Bob"] });
  const [pin] = huntPins({ hunt: SASH, zone: "Lower Guk", known: [theirs], mine: [] });
  assert.equal(pin.source, "peers");
  assert.match(pin.note, /Bob' kills, not yours/);
});

test("your kills pooled with a peer's are marked as pooled", () => {
  const pooled = known("Ghoul Lord", { myKills: 4, contributors: ["Bob"] });
  const [pin] = huntPins({ hunt: SASH, zone: "Lower Guk", known: [pooled], mine: [mine("Ghoul Lord")] });
  assert.equal(pin.source, "pooled");
  assert.match(pin.note, /pooled with Bob/);
});

test("the wiki places a mob nobody has killed here", () => {
  const hunt = buildHunt([item("Horn", [drop("Minotaur Lord", "Steamfont Mountains")])]);
  const wiki = { "Minotaur Lord": { zone: "Steamfont Mountains", loc: { y: 1555, x: -2410 } } };
  const [pin] = huntPins({ hunt, zone: "Steamfont Mountains", wiki });
  assert.equal(pin.source, "wiki");
  assert.deepEqual([pin.y, pin.x], [1555, -2410]);
  // No spread: a stated point is not a measurement, and the map draws that difference.
  assert.equal(pin.spread, undefined);
  assert.match(pin.note, /wiki states this spot/);
});

test("a kill of your own outranks the page's coordinate", () => {
  const wiki = { "Ghoul Lord": { zone: "Lower Guk", loc: { y: 1, x: 2 } } };
  const [pin] = huntPins({ hunt: SASH, zone: "Lower Guk", known: [known("Ghoul Lord")], mine: [mine("Ghoul Lord")], wiki });
  assert.equal(pin.source, "yours");
  assert.deepEqual([pin.y, pin.x], [100, -200]);
});

test("a stated coordinate about somewhere else is not drawn here", () => {
  const hunt = buildHunt([item("Horn", [drop("Minotaur Lord", "Steamfont Mountains")])]);
  const wiki = { "Minotaur Lord": { zone: "Steamfont Mountains", loc: { y: 1555, x: -2410 } } };
  assert.deepEqual(huntPins({ hunt, zone: "Lower Guk", wiki }), []);
});

test("a page that states a coordinate but no zone is vouched for by the hunt's own", () => {
  // Both are the wiki speaking, so the hunt's zone for the mob can say which map the point is on.
  const hunt = buildHunt([item("Horn", [drop("Minotaur Lord", "Steamfont Mountains")])]);
  const wiki = { "Minotaur Lord": { loc: { y: 1555, x: -2410 } } };
  assert.equal(huntPins({ hunt, zone: "Steamfont Mountains", wiki }).length, 1);
  // But it can't vouch for a zone the hunt never filed it under.
  assert.deepEqual(huntPins({ hunt, zone: "Lower Guk", wiki }), []);
});

test("with no zone on screen, a stated coordinate has nothing to be about", () => {
  const hunt = buildHunt([item("Horn", [drop("Minotaur Lord", "Steamfont Mountains")])]);
  const wiki = { "Minotaur Lord": { zone: "Steamfont Mountains", loc: { y: 1555, x: -2410 } } };
  assert.deepEqual(huntPins({ hunt, wiki }), []);
});

test("only the mobs this zone's kills can't place are worth asking the wiki about", () => {
  const hunt = buildHunt([item("Sash", [drop("Ghoul Lord", "Lower Guk"), drop("Zombie", "Lower Guk")])]);
  assert.deepEqual(unplacedHuntMobs({ hunt, known: [known("Ghoul Lord")] }), ["Zombie"]);
  // Your own kills count as placing it just as the pooled row does.
  assert.deepEqual(unplacedHuntMobs({ hunt, mine: [mine("Zombie")] }), ["Ghoul Lord"]);
  // A row with no believable position places nothing, so the page is still worth asking for.
  assert.deepEqual(unplacedHuntMobs({ hunt, known: [known("Ghoul Lord", { area: undefined })] }), [
    "Ghoul Lord",
    "Zombie",
  ]);
});
