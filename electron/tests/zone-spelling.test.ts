/**
 * The same zone, spelled wrong — and, much more importantly, two zones that merely look alike.
 *
 * The rule is one edit wide, so the whole risk is in what it *refuses*: EverQuest names its places in
 * pairs (East/West Karana, North/South Qeynos, Ashengate East/West) and merging any of them would
 * pool two camps' kills into one lie. So the corpus test below is the load-bearing one — it runs the
 * rule over every zone name the app ships and asserts nothing collides — and it stays honest if the
 * expansion table is ever regenerated.
 *
 * See [ADR 0075](../../specs/decisions/0075-a-zone-s-misspelling-is-the-same-zone.md).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sameZoneOrMisspelling, zoneSpelling } from "../../src/shared/zones/spelling";
import { createZoneResolver } from "../../src/shared/zones/resolve";
import { ZONE_EXPANSIONS } from "../../src/shared/zones/expansions";
import { CURATED_ZONES } from "../../src/shared/map/zones";
import { zoneKey } from "../../src/shared/names";

/** Every zone name the app ships: the fandom expansion table plus the names we state by hand. */
const ALL_ZONES: string[] = [...ZONE_EXPANSIONS.flatMap((e) => e.zones), ...CURATED_ZONES.map((z) => z.name)];

const name = (n: string) => n;

test("a spelling is the fold with the punctuation and spacing closed up", () => {
  assert.equal(zoneSpelling("The Ocean of Tears"), "oceanoftears");
  // The backtick and the typewriter apostrophe are already one by `zoneKey`; here they're neither.
  assert.equal(zoneSpelling("Erud`s Crossing"), zoneSpelling("Eruds Crossing"));
  // Decoration is gone before the letters are taken.
  assert.equal(zoneSpelling("Blackburrow 3 (Adaptive)"), "blackburrow");
});

test("the todo's case: one x is not a different forest", () => {
  assert.ok(sameZoneOrMisspelling("Toxxulia Forest", "Toxulia Forest"));
  assert.ok(sameZoneOrMisspelling("Toxulia Forest", "The Toxxulia Forest 2 (Adaptive)"));
  // Everything `sameZone` already answered still answers — this is a superset of it, aliases included.
  assert.ok(sameZoneOrMisspelling("The Feerrott", "feerrott"));
  assert.ok(sameZoneOrMisspelling("Kerra Isle", "Kerra Ridge"));
  assert.ok(!sameZoneOrMisspelling(undefined, "Toxxulia Forest"));
  assert.ok(!sameZoneOrMisspelling("Toxxulia Forest", ""));
});

test("EverQuest's paired zones stay two zones", () => {
  for (const [a, b] of [
    ["East Commonlands", "West Commonlands"],
    ["East Karana", "West Karana"],
    ["North Qeynos", "South Qeynos"],
    ["Northern Felwithe", "Southern Felwithe"],
    ["Northern Desert of Ro", "Southern Desert of Ro"],
    ["Ashengate East", "Ashengate West"],
    // The one pair in the whole corpus that *is* a single edit apart: a trailing letter is how the
    // game numbers siblings, which is why the rule requires the last character to agree.
    ["Plane of Time A", "Plane of Time B"],
  ] as const) {
    assert.ok(!sameZoneOrMisspelling(a, b), `${a} must not be ${b}`);
  }
  // A short name can't afford an edit at all: one letter is most of it.
  assert.ok(!sameZoneOrMisspelling("Guk", "Gukk"));
});

test("no two zones the app ships are one edit apart", () => {
  const collisions: string[] = [];
  for (let i = 0; i < ALL_ZONES.length; i++) {
    for (let j = i + 1; j < ALL_ZONES.length; j++) {
      const [a, b] = [ALL_ZONES[i], ALL_ZONES[j]];
      if (zoneKey(a) === zoneKey(b)) continue; // the table lists a few zones twice
      if (sameZoneOrMisspelling(a, b)) collisions.push(`${a} ↔ ${b}`);
    }
  }
  assert.deepEqual(collisions, [], "the rule merged two real zones");
});

test("a misspelling of any zone resolves back to it, or to nothing", () => {
  // The property that makes the `typo` tier shippable. A typo can land between two zones that are
  // themselves two edits apart ("Estkarana" is one edit from both Karanas), and the answer there must
  // be silence — which is `sole`'s job, not the rule's.
  const resolver = createZoneResolver(ALL_ZONES, name, { typo: true });
  for (const zone of ALL_ZONES) {
    if (zone.length < 8) continue;
    // An interior letter dropped: a slip a mapmaker's label plausibly has in it.
    const typo = zone.slice(0, 3) + zone.slice(4);
    const match = resolver.resolve(typo);
    if (!match) continue;
    assert.equal(zoneKey(match.item), zoneKey(zone), `${typo} resolved to ${match.item}`);
  }
});

test("the tier only answers when one candidate is near, and only when asked", () => {
  const zones = ["Toxxulia Forest", "Nektulos Forest"];
  assert.equal(createZoneResolver(zones, name, { typo: true }).resolve("Toxulia Forest")?.item, "Toxxulia Forest");
  assert.equal(createZoneResolver(zones, name, { typo: true }).resolve("Toxulia Forest")?.how, "typo");
  // Off by default: how bad a wrong answer is depends on who's asking.
  assert.equal(createZoneResolver(zones, name).resolve("Toxulia Forest"), undefined);
  // An exact hit never reaches the tier.
  assert.equal(createZoneResolver(zones, name, { typo: true }).resolve("Nektulos Forest")?.how, "exact");
});

// Naming a group of spellings used to live here, as "whichever the batch used most". It doesn't any
// more: a name chosen from the data makes the same records aggregate differently on different days, so
// the canonical name comes from the mapping table instead (`placeName`, ADR 0083 —
// `zone-place.test.ts`). What's left in this module is the *rule*, which only ever answers a filter.
