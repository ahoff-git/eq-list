/**
 * Black-box tests for hunt pins: the built hunt plus what this zone's kills know about a mob
 * becomes a mark on the map (ADR 0142). Guards the two rules that decide whether one appears —
 * the hunt wants it, and the kills can place it — and the wording that says what it rests on.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { huntPins } from "../../src/shared/map/hunt-pins";
import { buildHunt, type HuntInput } from "../../src/shared/hunt";
import type { MobKnowledge } from "../../src/shared/mob-stats";
import type { ItemSource } from "../../src/shared/types";

const drop = (where: string, zone: string): ItemSource => ({ kind: "drop", where, detail: zone });

function item(name: string, sources: ItemSource[]): HuntInput {
  return { name, needed: 1, obtained: 0, sources };
}

/** A knowledge row for one mob in one zone, with a roam area unless told otherwise. */
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

test("marks a hunted mob where this zone's kills place it", () => {
  const hunt = buildHunt([item("Flowing Black Silk Sash", [drop("Ghoul Lord", "Lower Guk")])]);
  const [pin, ...rest] = huntPins(hunt, [known("Ghoul Lord")]);
  assert.equal(rest.length, 0);
  assert.equal(pin.mob, "Ghoul Lord");
  assert.equal(pin.title, "Ghoul Lord");
  assert.deepEqual([pin.y, pin.x, pin.spread], [100, -200, 30]);
  assert.deepEqual(pin.items, ["Flowing Black Silk Sash"]);
  assert.equal(pin.target, false);
  // The hover says what it's for and how rough the position is — a roam centre is an average of
  // where it died, not a spawn point, so the pin has to carry the hedge with it.
  assert.match(pin.note, /drops Flowing Black Silk Sash/);
  assert.match(pin.note, /within about 30 units/);
});

test("a mob nothing on your list wants is not marked", () => {
  const hunt = buildHunt([item("Bone Chips", [drop("a decaying skeleton", "Lower Guk")])]);
  assert.deepEqual(huntPins(hunt, [known("Ghoul Lord")]), []);
});

test("a hunted mob with no positioned kills is left off rather than guessed at", () => {
  const hunt = buildHunt([item("Sash", [drop("Ghoul Lord", "Lower Guk")])]);
  assert.deepEqual(huntPins(hunt, [known("Ghoul Lord", { area: undefined })]), []);
});

test("the wiki's article and case meet the kill log's stripped name", () => {
  const hunt = buildHunt([item("Fang", [drop("A Froglok Ilis Knight", "Lower Guk")])]);
  const pins = huntPins(hunt, [known("froglok ilis knight")]);
  assert.equal(pins.length, 1);
  // Named as the kill log has it — that's what the map's own lists are keyed by.
  assert.equal(pins[0].mob, "froglok ilis knight");
});

test("a mob on your list in its own right is marked with nothing to drop", () => {
  const hunt = buildHunt([], [{ mob: "Ghoul Lord", zones: ["Lower Guk"] }]);
  const [pin] = huntPins(hunt, [known("Ghoul Lord")]);
  assert.equal(pin.target, true);
  assert.deepEqual(pin.items, []);
  assert.match(pin.note, /On your list/);
});

test("a mob wanted in another zone is still marked where you have killed it", () => {
  // The hunt zone is the wiki's wording for where an item drops; the position is a kill recorded
  // here. Where you've actually killed it wins — that's the only thing that can place anything.
  const hunt = buildHunt([item("Sash", [drop("Ghoul Lord", "Upper Guk")])]);
  const pins = huntPins(hunt, [known("Ghoul Lord", { zone: "Lower Guk" })]);
  assert.equal(pins.length, 1);
  assert.deepEqual(pins[0].items, ["Sash"]);
});

test("everything one mob is wanted for lands on its one pin", () => {
  const hunt = buildHunt(
    [item("Sash", [drop("Ghoul Lord", "Lower Guk")]), item("Robe", [drop("Ghoul Lord", "Upper Guk")])],
    [{ mob: "Ghoul Lord", zones: ["Lower Guk"] }],
  );
  const pins = huntPins(hunt, [known("Ghoul Lord")]);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].target, true);
  assert.deepEqual(pins[0].items.sort(), ["Robe", "Sash"]);
});

test("a spot you already pinned by hand isn't marked twice", () => {
  const hunt = buildHunt([item("Sash", [drop("Ghoul Lord", "Lower Guk")])]);
  assert.deepEqual(huntPins(hunt, [known("Ghoul Lord")], [{ y: 100, x: -200 }]), []);
  // A pin somewhere else in the zone is a different claim and doesn't suppress it.
  assert.equal(huntPins(hunt, [known("Ghoul Lord")], [{ y: 0, x: 0 }]).length, 1);
});

test("a position that is nobody's but a peer's says so", () => {
  const hunt = buildHunt([item("Sash", [drop("Ghoul Lord", "Lower Guk")])]);
  const theirs = known("Ghoul Lord", { myKills: 0, contributors: ["Bob"] });
  assert.match(huntPins(hunt, [theirs])[0].note, /Bob' kills, not yours/);
  // Pooled with your own, it says that instead — the figure is yours *and* theirs.
  const pooled = known("Ghoul Lord", { myKills: 4, contributors: ["Bob"] });
  assert.match(huntPins(hunt, [pooled])[0].note, /pooled with Bob/);
});

test("a mob you asked for by name leads, then it's by name", () => {
  const hunt = buildHunt(
    [item("Sash", [drop("Zombie", "Lower Guk"), drop("Ancient Croc", "Lower Guk")])],
    [{ mob: "Ghoul Lord", zones: ["Lower Guk"] }],
  );
  const pins = huntPins(hunt, [known("Zombie"), known("Ancient Croc"), known("Ghoul Lord")]);
  assert.deepEqual(pins.map((p) => p.mob), ["Ghoul Lord", "Ancient Croc", "Zombie"]);
});

test("an empty hunt marks nothing", () => {
  assert.deepEqual(huntPins([], [known("Ghoul Lord")]), []);
});
