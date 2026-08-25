/**
 * **A difficulty can never cost you a map** — the exhaustive version of that claim
 * ([ADR 0139](../../specs/decisions/0139-a-difficulty-can-never-cost-a-map.md)).
 *
 * The other zone tests check the rules one example at a time. This one checks the *property*, over
 * every zone the app ships crossed with every shape a difficulty is written in — because the failure
 * this guards against is a map window that silently shows nothing, and the shape that causes it is
 * always one nobody thought to write a case for. Twenty-four shapes were failing when this was
 * written, including every one of the tier names the server actually uses.
 *
 * Two halves, and the second is the one that keeps the first honest:
 *
 *   - **Nothing may cost a map.** Decorated name in, same map out. ~10,000 lookups.
 *   - **Nothing may merge two zones.** The fold that reaches all those shapes must not quietly make
 *     one camp out of two, so the whole shipped corpus is checked for collisions and the single real
 *     zone name that ends in a tier word — `Crystallos, Lair of the Awakened` — has to survive intact.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findZone, mapZoneName } from "../../src/shared/map/zones";
import { zonesFromFiles } from "../../src/shared/map/map-sources";
import { CURATED_ZONES, ZONE_NAME_PAIRS } from "../../src/shared/zones/gazetteer";
import { ZONE_EXPANSIONS } from "../../src/shared/zones/expansions.generated";
import { placeKey, samePlace } from "../../src/shared/zones/place";
import { zoneBaseName, zoneDifficulty, zoneKey, zoneMode } from "../../src/shared/names";
import type { Zone } from "../../src/shared/map/types";

/** The tiers the server runs, in the wording the players quote them in. */
const TIERS = ["Awakened", "Adaptive", "Fused", "Refined"];

/**
 * Every way difficulty `n` of `base` might reach us: from the log, from a peer's shared data, from a
 * wiki page, or typed by someone quoting the tier list. Deliberately more shapes than the game is
 * known to write — the whole point is that guessing which one it writes is the mistake.
 */
function shapes(base: string, n: number): string[] {
  const tier = TIERS[n - 1] ?? "Awakened";
  return [
    // the number alone, in each enclosure
    `${base} ${n}`, `${base} (${n})`, `${base} [${n}]`, `${base} +${n}`,
    // the number as the tier list writes it
    `${base} D${n}`, `${base} (D${n})`, `${base} [D${n}]`, `${base} d${n}`,
    `${base} Difficulty ${n}`, `${base} difficulty ${n}`,
    // the ruleset by name, with no number at all
    `${base} ${tier}`, `${base} (${tier})`, `${base} [${tier}]`, `${base} - ${tier}`,
    // both together, in every order and enclosure
    `${base} ${n} ${tier}`, `${base} ${n} (${tier})`, `${base} ${n} [${tier}]`, `${base} ${n} - ${tier}`,
    `${base} D${n} (${tier})`, `${base} Difficulty ${n} (${tier})`,
    // and the noise a real log line, or a paste, arrives with
    `  ${base}   ${n}  (${tier})  `, `${base.toUpperCase()} ${n}`, `${base.toLowerCase()} (${tier})`,
    `the ${base} ${n}`,
  ];
}

/** A pack holding every file the gazetteer knows — the zone list a real install produces. */
const zones = zonesFromFiles("stock", [...new Set(CURATED_ZONES.map((z) => z.file))]);

test("no difficulty, in any shape, changes which map you get", () => {
  let checked = 0;
  const failures: string[] = [];

  for (const zone of zones) {
    /*
     * The baseline is what the *undecorated* name draws, not `zone.file`. Those differ on purpose for
     * a zone two files both draw: the loser keeps its short name and the gazetteer routes the real
     * name to the winner (ADR 0075/0111). Asserting `zone.file` would be asserting that duplicate
     * handling is broken. The property under test is only ever "a difficulty changes nothing".
     */
    const baseline = findZone(zone.name, zones);
    if (!baseline) continue;

    for (const n of [0, 1, 2, 3, 4]) {
      for (const written of shapes(zone.name, n)) {
        checked++;
        const got = findZone(written, zones);
        if (got?.file !== baseline.file) {
          failures.push(`${JSON.stringify(written)} → ${got?.file ?? "NO MAP"} (wanted ${baseline.file})`);
        }
      }
    }
  }

  // The count is asserted so that a refactor which quietly stops generating shapes can't pass by
  // checking nothing — the bug this file exists for would sail straight through an empty loop.
  assert.ok(checked > 9000, `only ${checked} lookups — the matrix stopped covering the corpus`);
  assert.deepEqual(failures, [], `${failures.length} of ${checked} lookups lost the map`);
});

test("a difficulty never leaks into the name the map window uses", () => {
  // `mapZoneName` is what titles the window, scopes its pins and builds its wiki link (ADR 0134), so
  // an ornament surviving into it is the visible half of the same bug.
  for (const zone of zones) {
    for (const n of [0, 2, 4]) {
      for (const written of shapes(zone.name, n)) {
        const out = mapZoneName(written, zones);
        assert.equal(zoneDifficulty(out), undefined, `${JSON.stringify(written)} → ${JSON.stringify(out)}`);
        assert.equal(zoneMode(out), undefined, `${JSON.stringify(written)} → ${JSON.stringify(out)}`);
      }
    }
  }
});

test("every difficulty of a camp the gazetteer can place is one camp, so its records pool", () => {
  /*
   * The reading half of the same rule (ADR 0083): the map has to draw one zone, and the kill log, the
   * loot ledger and the drop rates have to agree that it *is* one zone.
   *
   * Over the **gazetteer's** names, not the pack's labels, and the difference is a stated trade-off
   * rather than a gap in coverage. `placeName` falls back to the rule-only fold for a name no table
   * knows, deliberately — that is what stops it renaming `Crystallos, Lair of the Awakened` to
   * `Crystallos, Lair of the` — so a *bare* tier word on an unplaceable name groups only its own
   * variants. Pack labels like "Tox" are exactly such names, and the log never writes one; every name
   * a log does write is in here.
   */
  for (const zone of CURATED_ZONES.slice(0, 40)) {
    const base = placeKey(zone.name);
    for (const n of [1, 2, 3, 4]) {
      for (const written of shapes(zone.name, n)) {
        assert.equal(placeKey(written), base, `${JSON.stringify(written)} filed under a different camp`);
        assert.ok(samePlace(written, zone.name), `${JSON.stringify(written)} is not the same place`);
      }
    }
  }
});

/**
 * A name lifted out of **prose** brings the sentence's punctuation with it — a wiki page's
 * `Zone: Blackburrow 3.`, a pasted line, a peer's note. Every ornament rule anchors at the end of the
 * string, so one stray full stop used to hide all of them: `Blackburrow.` found its map (the resolver's
 * word tiers split punctuation out) and `Blackburrow 3.` found nothing (ADR 0139).
 */
test("a name that arrived with a sentence's punctuation still finds its map", () => {
  const want = findZone("Blackburrow", zones)?.file;
  assert.ok(want, "the fixture needs Blackburrow");

  for (const written of [
    "Blackburrow.", "Blackburrow!", "Blackburrow,", "Blackburrow;", "Blackburrow:", "Blackburrow?",
    "Blackburrow 3.", "Blackburrow (Fused).", "Blackburrow 3 (Fused).", "Blackburrow D3.",
    "Blackburrow Difficulty 3!", "  Blackburrow 3 (Fused).  ",
  ]) {
    assert.equal(findZone(written, zones)?.file, want, written);
    assert.equal(zoneKey(written), zoneKey("Blackburrow"), written);
  }

  // Not every trailing character is punctuation *around* a name: nine shipped names end in a
  // parenthesis and eight in a quote, so those stay part of the name.
  assert.equal(zoneBaseName('The Void "A"'), 'The Void "A"');
});

// ── the other direction: the fold must not invent a merge ─────────────────────

/**
 * Every zone name the app states as a zone *in its own right* — the gazetteer's, and all 22
 * expansions'.
 *
 * **Aliases are left out on purpose.** `ZONE_NAME_PAIRS` exists to make names collide — "Kelethin" is
 * "Greater Faydark" — so including them would make the collision test below assert that the alias
 * table doesn't work. What that test asks is whether the *fold* merges two zones nobody said were one.
 */
function shippedNames(): string[] {
  const names = new Set<string>();
  for (const zone of CURATED_ZONES) names.add(zone.name);
  for (const expansion of ZONE_EXPANSIONS) for (const zone of expansion.zones) names.add(zone);
  return [...names];
}

/** The alias table's own names, for the one test that wants to see the declared merges. */
const aliasNames = (): string[] => ZONE_NAME_PAIRS.flatMap((p) => [p.alias, p.canonical]);

test("exactly one shipped zone name ends in a tier word, and it keeps it", () => {
  /*
   * This is the measurement the guarded half of the fold rests on, pinned so it can't drift. A build
   * that adds a zone whose name *ends* in "Awakened", "Fused" and so on would make the resolver's
   * bare-tier reading able to rename it — and this test is where that shows up, before a player's map
   * goes blank. The remedy would be to drop the bare-tier tier, not to widen this list.
   */
  const corpus = [...new Set([...shippedNames(), ...aliasNames()])];
  const trailing = corpus.filter((name) =>
    TIERS.some((tier) => name.toLowerCase().trimEnd().endsWith(tier.toLowerCase())),
  );
  assert.deepEqual(trailing, ["Crystallos, Lair of the Awakened"]);

  // And nothing about it is folded by *rule*: only the resolver may read the word off, and only after
  // trying the name as written, which is what makes Crystallos match itself.
  const crystallos = "Crystallos, Lair of the Awakened";
  assert.equal(zoneBaseName(crystallos), crystallos);
  assert.match(zoneKey(crystallos), /awakened$/);
  const pack: Zone[] = zonesFromFiles("stock", ["crystallos"]).map((z) => ({ ...z, name: crystallos }));
  assert.equal(findZone(crystallos, pack)?.file, "crystallos", "a real zone must match itself first");
});

test("reaching every difficulty shape has not merged two different zones", () => {
  // A fold loose enough to catch `Blackburrow Difficulty 3` is loose enough to be dangerous, so the
  // whole corpus is checked. The pairs listed here are the gazetteer's own aliases and revamp tags —
  // deliberate merges that predate this fold — and the point of naming them is that a *new* one shows
  // up as a failure rather than as one more line nobody reads.
  const allowed = new Set([
    "clan crushbone", "runnyeye citadel", "northern desert of ro", "estate of unrest",
    "ocean of tears", "ruins of old paineel", "cazic-thule", "qeynos aqueducts",
    "splitpaw lair", "chardok", "frontier mountains", "temple of droga", "ruins of lxanvom",
  ]);

  const byKey = new Map<string, Set<string>>();
  for (const name of shippedNames()) {
    const key = zoneKey(name);
    if (!byKey.has(key)) byKey.set(key, new Set());
    byKey.get(key)!.add(name);
  }

  const merged = [...byKey]
    .filter(([key, names]) => names.size > 1 && !allowed.has(key))
    .map(([key, names]) => `${key} <- ${[...names].join(" | ")}`);
  assert.deepEqual(merged, []);
});
