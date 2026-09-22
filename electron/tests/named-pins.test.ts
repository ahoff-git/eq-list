/**
 * Black-box tests for named pins: every mob eqlwiki calls "named" here is marked wherever anything
 * can place it, whether or not it's on the hunt list (ADR 0265). Guards where a candidate comes
 * from (the zone's own roster, or a kill that roster doesn't list), the same three-source ranking
 * `hunt-pins.ts` uses, and the dedup against a spot already marked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { namedPins, unplacedNamedMobs } from "../../src/shared/map/named-pins";
import type { MobKnowledge, MobObservation } from "../../src/shared/mob-stats";

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

test("marks a named mob the zone's own roster lists, where this zone's kills place it", () => {
  const [pin, ...rest] = namedPins({ npcs: [{ name: "Ghoul Lord" }], known: [known("Ghoul Lord")], mine: [mine("Ghoul Lord")] });
  assert.equal(rest.length, 0);
  assert.equal(pin.mob, "Ghoul Lord");
  assert.equal(pin.title, "Ghoul Lord");
  assert.deepEqual([pin.y, pin.x, pin.spread], [100, -200, 30]);
  assert.equal(pin.source, "yours");
  assert.match(pin.note, /Named spawn/);
});

test("a roster entry the wiki doesn't call named is not marked", () => {
  // Not a real mob name — the category is broad enough (6,500+ members) that almost any genuine EQ
  // mob risks being a member, which is itself the caveat this feature carries.
  const mob = "a completely fictitious test mob";
  assert.deepEqual(namedPins({ npcs: [{ name: mob }], known: [known(mob)] }), []);
});

test("a named mob nothing can place is left off rather than guessed at", () => {
  assert.deepEqual(namedPins({ npcs: [{ name: "Ghoul Lord" }], known: [known("Ghoul Lord", { area: undefined })] }), []);
  assert.deepEqual(namedPins({ npcs: [{ name: "Ghoul Lord" }] }), []);
});

test("a named mob missing from the roster is still marked from a kill alone", () => {
  // The zone's own wiki page can be unfetched or stale; a kill recorded here is evidence enough.
  const [pin] = namedPins({ npcs: [], known: [known("Ghoul Lord")] });
  assert.equal(pin.mob, "Ghoul Lord");
});

test("the wiki's article and zone parenthetical meet the kill log's stripped name", () => {
  const pins = namedPins({ npcs: [{ name: "A Froglok Ilis Knight" }], known: [known("froglok ilis knight")] });
  assert.equal(pins.length, 1);
  // Named as whatever placed it has it — here the kill log, which is what the map's lists are keyed by.
  assert.equal(pins[0].mob, "froglok ilis knight");
});

test("a spot already drawn — by hand or by a hunt pin — isn't marked twice", () => {
  const at = (y: number, x: number) =>
    namedPins({ npcs: [{ name: "Ghoul Lord" }], known: [known("Ghoul Lord")], placed: [{ y, x }] });
  assert.deepEqual(at(100, -200), []);
  // A pin somewhere else in the zone is a different claim and doesn't suppress it.
  assert.equal(at(0, 0).length, 1);
});

test("named mobs are sorted by name", () => {
  const pins = namedPins({
    npcs: [{ name: "Zombie" }, { name: "Ancient Croc" }, { name: "Ghoul Lord" }],
    known: [known("Zombie"), known("Ancient Croc"), known("Ghoul Lord")],
  });
  assert.deepEqual(pins.map((p) => p.mob), ["Ancient Croc", "Ghoul Lord", "Zombie"]);
});

test("an empty roster and no kills marks nothing", () => {
  assert.deepEqual(namedPins({}), []);
});

// ── the three sources ────────────────────────────────────────────────────────

test("a peer's kills place a mob you have never killed, and the mark says whose they are", () => {
  const theirs = known("Ghoul Lord", { myKills: 0, contributors: ["Bob"] });
  const [pin] = namedPins({ npcs: [{ name: "Ghoul Lord" }], known: [theirs], mine: [] });
  assert.equal(pin.source, "peers");
  assert.match(pin.note, /Bob' kills, not yours/);
});

test("your kills pooled with a peer's are marked as pooled", () => {
  const pooled = known("Ghoul Lord", { myKills: 4, contributors: ["Bob"] });
  const [pin] = namedPins({ npcs: [{ name: "Ghoul Lord" }], known: [pooled], mine: [mine("Ghoul Lord")] });
  assert.equal(pin.source, "pooled");
});

test("the wiki places a named mob nobody has killed here, no zone check needed", () => {
  // Unlike a hunted mob's wiki fallback, a roster name needs no zone match: it came from this
  // zone's own page, so it is already known to be about here.
  const wiki = { "Minotaur Lord": { zone: "Steamfont Mountains", loc: { y: 1555, x: -2410 } } };
  const [pin] = namedPins({ npcs: [{ name: "Minotaur Lord" }], wiki });
  assert.equal(pin.source, "wiki");
  assert.deepEqual([pin.y, pin.x], [1555, -2410]);
  assert.equal(pin.spread, undefined);
});

test("a kill of your own outranks the page's coordinate", () => {
  const wiki = { "Ghoul Lord": { zone: "Lower Guk", loc: { y: 1, x: 2 } } };
  const [pin] = namedPins({ npcs: [{ name: "Ghoul Lord" }], known: [known("Ghoul Lord")], mine: [mine("Ghoul Lord")], wiki });
  assert.equal(pin.source, "yours");
  assert.deepEqual([pin.y, pin.x], [100, -200]);
});

test("only the named mobs this zone's kills can't place are worth asking the wiki about", () => {
  const npcs = [{ name: "Ghoul Lord" }, { name: "Zombie" }];
  assert.deepEqual(unplacedNamedMobs({ npcs, known: [known("Ghoul Lord")] }), ["Zombie"]);
  assert.deepEqual(unplacedNamedMobs({ npcs, mine: [mine("Zombie")] }), ["Ghoul Lord"]);
  assert.deepEqual(unplacedNamedMobs({ npcs, known: [known("Ghoul Lord", { area: undefined })] }), ["Ghoul Lord", "Zombie"]);
});
