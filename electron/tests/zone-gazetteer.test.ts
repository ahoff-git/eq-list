/**
 * The supplied zone gazetteer, and the two tables derived from it
 * ([ADR 0076](../../specs/decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)).
 *
 * An **alias is the one naming mistake that doesn't fail closed** — unlike a resolver match it has no
 * candidate list to be outvoted by, so it is believed everywhere and forever, and it feeds the fold
 * that keys every kill record. Going from three hand-written aliases to 250-odd derived ones is only
 * safe if the derivation is checked rather than trusted, so most of this file is about what must
 * *not* happen. One real bug is pinned here: the table spells two aliases `Qeynos (North)` and
 * `Qeynos (South)`, and the fold reads a trailing parenthetical as a ruleset tag
 * ([ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md)) — so left in, they renamed
 * the whole city of Qeynos to one of its halves.
 *
 * The file the gazetteer is built from is data supplied from outside, so these also stand as the
 * review a **re-supplied** table has to pass before it can be believed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CURATED_ZONES, ZONE_NAME_PAIRS } from "../../src/shared/zones/gazetteer";
import { zoneFold, zoneKey } from "../../src/shared/names";
import { resolveZone } from "../../src/shared/zones/resolve";
import { ZONE_EXPANSIONS, zoneAvailable } from "../../src/shared/zones/expansions";
import { zonesFromFiles } from "../../src/shared/map/map-sources";

/** The alias table as `zoneKey` will hold it: folded both sides, identities and duplicates dropped. */
const aliases = (): Map<string, string> => {
  const out = new Map<string, string>();
  for (const { alias, canonical } of ZONE_NAME_PAIRS) {
    const key = zoneFold(alias);
    const value = zoneKey(canonical);
    if (!key || key === value || out.has(key)) continue;
    out.set(key, value);
  }
  return out;
};

/** file → the name we show for it. */
const canonical = (): Map<string, string> => new Map(CURATED_ZONES.map((z) => [z.file, z.name]));

test("the supplied table names far more files than we ever curated by hand", () => {
  // Not a vanity number: every one of these is a folder file that used to show as `Gukbottom` in the
  // picker and place in no expansion. The floor guards against a derivation that silently stops.
  assert.ok(CURATED_ZONES.length >= 80, `only ${CURATED_ZONES.length} zones named`);
  assert.ok(ZONE_NAME_PAIRS.length >= 200, `only ${ZONE_NAME_PAIRS.length} alias pairs`);
  const files = CURATED_ZONES.map((z) => z.file);
  assert.equal(new Set(files).size, files.length, "a file is named twice");
  assert.ok(
    CURATED_ZONES.every((z) => z.name.trim() && z.file === z.file.trim().toLowerCase()),
    "every entry is a named, normalised short name",
  );
});

test("what we verified ourselves outranks the supplied table", () => {
  const byFile = canonical();
  // Same file, different name: ours stays, and the table's becomes an alias (checked below).
  assert.equal(byFile.get("crushbone"), "Clan Crushbone"); // the table says "Crushbone"
  assert.equal(byFile.get("kerraridge"), "Kerra Ridge"); // the table says "Kerra Isle"
  assert.equal(byFile.get("nro"), "Northern Desert of Ro"); // the table says "North Ro"
  // And the entries no EverQuest gazetteer can carry survive.
  assert.equal(byFile.get("newsebexp"), "New Sebilis Expedition");
  assert.equal(byFile.get("tutoriala"), "EverQuest Legends Tutorial");
});

test("the supplied table confirms the two entries that cost the most to work out", () => {
  const byFile = canonical();
  // `qey2hh1` names "to Qeynos Hills" on its own map because it is the neighbour, West Karana.
  assert.equal(byFile.get("qey2hh1"), "West Karana");
  assert.equal(byFile.get("qeytoqrg"), "Qeynos Hills");
  // And it explains the solver's worst confident-wrong answer: the Fourth Gate is a different file.
  assert.equal(byFile.get("neriaka"), "Neriak Foreign Quarter");
  assert.equal(byFile.get("neriakd"), "Neriak Palace");
});

test("one zone under two short names is a candidate, not a duplicate", () => {
  // Grouped by the **fold**, not the string: `steamfontmts` shows as "Steamfont Mountains" and
  // `steamfont` as "Steamfont", which are two spellings of one zone and so exactly the case this is
  // about. `nro` is *not* here any more: the verified entry now claims that file, so the table's
  // "North Ro" candidate for it is skipped and `northro` — the revamp drawing — is named by nobody.
  const byZone = new Map<string, string[]>();
  for (const zone of CURATED_ZONES) {
    const key = zoneKey(zone.name);
    byZone.set(key, [...(byZone.get(key) ?? []), zone.file]);
  }
  const shared = [...byZone.entries()].filter(([, files]) => files.length > 1);
  // Pinned exactly: a re-supplied table adding a pair here is something to look at, not to absorb.
  assert.deepEqual(
    shared.map(([key, files]) => `${key}: ${files.join(",")}`).sort(),
    ["steamfont mountains: steamfontmts,steamfont", "toxxulia forest: toxxulia,tox"],
  );
  // The folder decides which one is real, and only one is ever offered.
  const both = zonesFromFiles("stock", ["tox", "toxxulia"]).map((z) => `${z.file}=${z.name}`);
  assert.deepEqual(both, ["tox=Tox", "toxxulia=Toxxulia Forest"]);
  // A folder with only the other file is now named too — this is what the second candidate buys.
  assert.deepEqual(zonesFromFiles("stock", ["tox"]).map((z) => z.name), ["Toxxulia Forest"]);
  assert.deepEqual(zonesFromFiles("stock", ["steamfont"]).map((z) => z.name), ["Steamfont Mountains"]);
});

test("no zone name contains ' - ', which is what lets it mean a ruleset", () => {
  // The game writes `Nagafen's Lair - Solo` as well as `… 2 (Adaptive)`, and `zoneBaseName` folds the
  // dash form away. That is only safe while no real name uses the separator — the hyphens in the corpus
  // are all inside a word (`Cazic-Thule`, `Takish-Hiz`), so this is the claim to keep honest.
  const names = [...ZONE_EXPANSIONS.flatMap((e) => e.zones), ...CURATED_ZONES.map((z) => z.name)];
  assert.deepEqual(names.filter((n) => n.includes(" - ")), []);
});

test("no alias renames a zone we name", () => {
  const byKey = new Map(CURATED_ZONES.map((z) => [zoneKey(z.name), z.file]));
  const renamed: string[] = [];
  for (const [key, value] of aliases()) {
    const mine = byKey.get(key);
    if (mine && mine !== byKey.get(value)) renamed.push(`${key} (${mine}) → ${value} (${byKey.get(value)})`);
  }
  assert.deepEqual(renamed, [], "an alias points a zone's own name at another zone");
});

test("no alias folds two of the expansion table's zones together", () => {
  // The fandom table is the authority on which zones are *distinct*, so merging two of its names is
  // the failure that would pool two camps' kills. Its own repeats — a revamped zone listed twice, once
  // with the expansion in brackets — are the same place and allowed.
  const byKey = new Map<string, Set<string>>();
  for (const zone of ZONE_EXPANSIONS.flatMap((e) => e.zones)) {
    const key = zoneKey(zone);
    byKey.set(key, (byKey.get(key) ?? new Set()).add(zone));
  }
  const merged: string[] = [];
  for (const [key, names] of byKey) {
    const bare = new Set([...names].map((n) => n.replace(/\s*\([^()]*\)\s*$/, "").trim()));
    if (bare.size > 1) merged.push(`${key} ← ${[...names].join(" | ")}`);
  }
  assert.deepEqual(merged, [], "two distinct zones now fold to one key");
});

test("a parenthesised spelling is refused — it folds to the name outside the brackets", () => {
  // The bug this pins: the table lists "Qeynos (North)", whose fold is `qeynos`.
  assert.equal(zoneKey("Qeynos"), "qeynos", "the whole city must not be one of its halves");
  assert.ok(!ZONE_NAME_PAIRS.some((p) => /[()]/.test(p.alias)), "a bracketed alias reached the table");
  // The unbracketed spellings of the same names are kept, so nothing is lost by refusing them.
  assert.equal(zoneKey("North Qeynos"), "north qeynos");
  assert.equal(zoneKey("Kelethin"), "greater faydark");
});

test("the names in the wild now fold onto the ones we show", () => {
  for (const [spelling, canonicalName] of [
    ["Kerra Island", "Kerra Ridge"], // the wiki's name
    ["Kerra Isle", "Kerra Ridge"], // the log's name
    ["Crushbone", "Clan Crushbone"],
    ["Clan Runnyeye", "RunnyEye Citadel"],
    ["The Hole", "The Ruins of Old Paineel"],
    ["Sol B", "Nagafen's Lair"],
    ["Highkeep", "High Keep"],
    ["Cazic Thule", "Cazic-Thule"],
    ["Permafrost Caverns", "Permafrost Keep"],
    ["Gukbottom", "Lower Guk"], // a file name, as the picker used to show it
    ["North Ro", "Northern Desert of Ro"], // the hand entry still wins, for the expansion lookup
  ] as const) {
    assert.equal(zoneKey(spelling), zoneKey(canonicalName), `${spelling} should mean ${canonicalName}`);
  }
  // The shortest player shorthand is deliberately *not* folded: two or three letters is a lot of
  // meaning to give a string forever, and no source we read emits it. Four is the line, so "GFay"
  // (which a player might genuinely type into the picker) is kept.
  for (const short of ["EC", "WC", "SK", "NRO"]) assert.equal(zoneKey(short), short.toLowerCase());
  assert.equal(zoneKey("GFay"), zoneKey("Greater Faydark"));
});

test("an alias only ever adds a match — it never costs one", () => {
  // A rewrite moves a name onto its canonical, which must not take it *away* from a candidate list
  // holding a rephrasing of the original: "North Kaladim" is "Northern Kaladim" to the fold, and
  // "Kaladim North" is still the zone a pack labelling it that way means.
  assert.equal(resolveZone("North Kaladim", ["Kaladim", "Kaladim North"], (n) => n, { narrow: true })?.item, "Kaladim North");
  assert.equal(resolveZone("North Qeynos", ["Qeynos"], (n) => n, { narrow: true })?.item, "Qeynos");
  // And the canonical spelling still resolves the ordinary way.
  assert.equal(resolveZone("Northern Kaladim", ["Northern Kaladim"], (n) => n)?.how, "exact");
});

test("nothing the gazetteer names is excluded from the picker", () => {
  // The one way this could lose a zone rather than gain one: a name that resolves to an expansion this
  // server doesn't run would be filtered out of the map and every route, silently.
  const excluded = CURATED_ZONES.filter((z) => !zoneAvailable(z.name)).map((z) => `${z.name} (${z.file})`);
  assert.deepEqual(excluded, []);
});
