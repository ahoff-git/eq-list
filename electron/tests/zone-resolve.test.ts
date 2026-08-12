/**
 * Matching a zone name against the zones we know about.
 *
 * Two properties are load-bearing and pull against each other, so both are checked here:
 *
 *  - **It resolves rephrasings.** The log, the map packs and fandom name the same place three ways,
 *    and a name that means a zone we have must find it.
 *  - **It refuses to guess.** A wrong zone is worse than no zone at every call site — a wrong map
 *    file plots your position somewhere else entirely — so ambiguity, weak spelling and a zone the
 *    list simply lacks must all come back undefined.
 *
 * The second is tested against the *real* 344-zone expansion table rather than a fixture: a
 * hand-picked list can't show that no zone in the game collides with another.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createZoneResolver, resolveZone, zoneOrderKey, zoneWords } from "../../src/shared/zones/resolve";
import { ZONE_EXPANSIONS, zoneExpansion } from "../../src/shared/zones/expansions";
import { zoneKey } from "../../src/shared/names";

/** Every zone name the shipped table carries — the widest candidate list the app has. */
const ALL_ZONES: string[] = ZONE_EXPANSIONS.flatMap((e) => e.zones);

const name = (n: string) => n;

test("identifying words drop the filler and close up apostrophes", () => {
  assert.deepEqual(zoneWords("The Castle of Mistmoore"), ["castle", "mistmoore"]);
  // "Erud's" is one word, not "erud" plus a stray "s" that would match anything.
  assert.deepEqual(zoneWords("Erud`s Crossing"), ["eruds", "crossing"]);
  // The difficulty and ruleset are already gone by the time words are taken.
  assert.deepEqual(zoneWords("Blackburrow 3 (Adaptive)"), ["blackburrow"]);
});

test("word order stops mattering, but the words themselves still do", () => {
  assert.equal(zoneOrderKey("Mistmoore Castle"), zoneOrderKey("The Castle of Mistmoore"));
  assert.equal(zoneOrderKey("Castle Mistmoore"), zoneOrderKey("Mistmoore Castle"));
  assert.notEqual(zoneOrderKey("East Commonlands"), zoneOrderKey("West Commonlands"));
});

test("the todo's case: three spellings of one castle all land on the table's", () => {
  for (const spelling of ["Mistmoore Castle", "The Castle of Mistmoore", "castle  mistmoore"]) {
    const match = resolveZone(spelling, ALL_ZONES, name);
    assert.equal(match?.item, "Castle Mistmoore", `${spelling} should resolve`);
  }
  // A rephrasing is only "exact" when the fold already agreed; otherwise the order tier answered.
  assert.equal(resolveZone("The Castle of Mistmoore", ALL_ZONES, name)?.how, "order");
  assert.equal(resolveZone("castle  mistmoore", ALL_ZONES, name)?.how, "exact");
  // And the decoration still folds away first, so a harder castle is the same castle.
  assert.equal(resolveZone("Mistmoore Castle 3 (Adaptive)", ALL_ZONES, name)?.item, "Castle Mistmoore");
});

test("every zone in the game resolves to itself, and never to another", () => {
  // The one property that makes the loose tiers safe to ship: run the whole table against itself
  // with every tier switched on and nothing may drift onto a neighbour.
  const resolver = createZoneResolver(ALL_ZONES, name, { narrow: true, fuzzy: true });
  for (const zone of ALL_ZONES) {
    const match = resolver.resolve(zone);
    assert.equal(zoneKey(match?.item ?? ""), zoneKey(zone), `${zone} resolved to ${match?.item}`);
  }
});

test("a name that means nothing we have comes back undefined, not a near miss", () => {
  const resolver = createZoneResolver(ALL_ZONES, name, { narrow: true, fuzzy: true });
  for (const missing of [
    // Real zones fandom's table simply lacks. The tempting wrong answers are "Tenebrous Mountains"
    // and "Kedge Keep"; both are refused on the margin rule.
    "Butcherblock Mountains",
    "Kerra Ridge",
    // Legends' own zones, which no EverQuest table will ever have.
    "EverQuest Legends Tutorial",
    "New Sebilis Expedition",
    "Somewhere Invented",
    "",
  ]) {
    assert.equal(resolver.resolve(missing), undefined, `${missing || "(empty)"} must not resolve`);
  }
});

test("a sub-zone finds its parent, but only when asked to", () => {
  const zones = ["Qeynos", "Freeport", "Neriak", "Neriak Fourth Gate"];
  assert.equal(resolveZone("North Qeynos", zones, name, { narrow: true })?.item, "Qeynos");
  assert.equal(resolveZone("East Freeport", zones, name, { narrow: true })?.how, "narrower");
  // Off by default, because how bad a wrong answer is depends on who's asking.
  assert.equal(resolveZone("North Qeynos", zones, name), undefined);
  // The specific zone always wins over the broad one — narrowing only runs on a miss.
  assert.equal(resolveZone("Neriak Fourth Gate", zones, name, { narrow: true })?.how, "exact");
  // ...and where two candidates both fit, the more specific is the answer.
  assert.equal(resolveZone("Neriak Fourth Gate West", zones, name, { narrow: true })?.item, "Neriak Fourth Gate");
});

test("ambiguity is refused rather than broken by list order", () => {
  // Two real zones whose words are a rephrasing of each other would make "order" a coin flip.
  const twins = ["Tower of Frozen Shadow", "Frozen Shadow Tower"];
  assert.equal(resolveZone("The Shadow Tower Frozen", twins, name), undefined);
  // Same rule one tier down: two equally specific parents mean no parent.
  const both = ["Kaladim", "Kaladim North"];
  assert.equal(resolveZone("North Kaladim South", ["Kaladim South", "Kaladim North"], name, { narrow: true }), undefined);
  assert.equal(resolveZone("North Kaladim", both, name, { narrow: true })?.item, "Kaladim North");
});

test("a duplicate spelling of the winner doesn't count as a rival", () => {
  // The real table lists "Freeport Sewers" twice; a zone named twice must still be matchable.
  const dupes = ["Freeport Sewers", "Freeport Sewers"];
  assert.equal(resolveZone("The Sewers of Freeport", dupes, name)?.item, "Freeport Sewers");
});

test("the expansion table now places the zones the app actually names", () => {
  // The 16 curated names fandom spells differently were all "unknown" before the resolver; these
  // are the ones a rule can reach, and each has to land on the right expansion rather than merely
  // land on something.
  for (const [zone, expansion] of [
    ["Clan Crushbone", "Original Release"],
    ["Northern Felwithe", "Original Release"],
    ["Neriak Third Gate", "Original Release"],
    ["North Qeynos", "Original Release"],
    ["East Freeport", "Original Release"],
    ["East Commonlands", "Original Release"],
    // Reached by alias, not by rule — no threshold could have ranked these first.
    ["RunnyEye Citadel", "Original Release"],
    ["Northern Desert of Ro", "Original Release"],
  ] as const) {
    assert.equal(zoneExpansion(zone)?.expansion, expansion, `${zone}`);
  }
});

test("resolving is cheap when asked the same thing twice", () => {
  // The map filters its whole zone list through the expansion lookup on render, so the misses —
  // which are the expensive ones, having run every tier — have to be remembered too.
  let reads = 0;
  const counted = createZoneResolver(ALL_ZONES, (n) => {
    reads++;
    return n;
  });
  const afterBuild = reads;
  for (let i = 0; i < 50; i++) counted.resolve("Somewhere Invented");
  assert.equal(reads, afterBuild, "names are read once, at build");
});
