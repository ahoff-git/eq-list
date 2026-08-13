/**
 * Black-box tests for turning a folder of map files into zones. The risk this module manages is a
 * *confident wrong answer* — a file labelled as a zone it isn't — so most of these pin what must
 * NOT happen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { STOCK_ONLY_ZONES, prettyZoneName, stockOnly, zonesFromFiles, zonesFromSources } from "../../src/shared/map/map-sources";
import { CURATED_ZONES, findZone, sortZones } from "../../src/shared/map/zones";

/** A slice of a real maps folder, including the near-misses that make naming dangerous. */
const FILES = [
  "gfaydark", "lfaydark", "crushbone", "felwithea", "felwitheb", "qey2hh1", "qeytoqrg", "qeynos", "qeynos2",
  "commonlands", "commons", "ecommons", "unrest", "runnyeye", "newsebexp", "nektulos", "toxxulia",
  "tox", "gukbottom", "akanon", "feerrott", "northro", "nro", "steamfontmts", "steamfont",
];

test("a curated zone takes its own file, and nothing else does", () => {
  const byFile = new Map(zonesFromFiles("brewall", FILES).map((z) => [z.file!, z.name]));
  assert.equal(byFile.get("gfaydark"), "Greater Faydark");
  assert.equal(byFile.get("qeytoqrg"), "Qeynos Hills");
  assert.equal(byFile.get("qey2hh1"), "West Karana"); // the neighbour, not the hills
  assert.equal(byFile.get("felwithea"), "Northern Felwithe");
  assert.equal(byFile.get("felwitheb"), "Southern Felwithe");
  assert.equal(byFile.get("runnyeye"), "RunnyEye Citadel");
  // `qeynos` IS South Qeynos (its exits: North Qeynos, the Aqueducts, the Erud's Crossing
  // translocator), and it is curated as such — but it must never inherit "Qeynos Hills" from the
  // file next to it, which is the mistake the whole two-signal rule exists to refuse.
  assert.equal(byFile.get("qeynos"), "South Qeynos");
  assert.notEqual(byFile.get("qeynos"), "Qeynos Hills");
});

test("a zone we can't name keeps its file name, and is still offered", () => {
  const zones = zonesFromFiles("brewall", FILES);
  // `commonlands` is a file the gazetteer has no name for — the classic zone is `commons`.
  assert.equal(zones.find((z) => z.file === "commonlands")?.name, "Commonlands");
  assert.equal(zones.length, FILES.length);
  assert.ok(zones.every((z) => z.file && z.key.startsWith("brewall:")));
});

test("a solved name is used where nothing curated applies", () => {
  // Invented short names on purpose: the gazetteer names 80-odd real files, so a test about the
  // *solver* has to ask about a file no table could have named (a pack's own custom map).
  const zones = zonesFromFiles("brewall", ["someplace", "elsewhere"], {
    someplace: "Ruins of Old Guk",
    elsewhere: "Kithicor Forest",
  });
  const byFile = new Map(zones.map((z) => [z.file!, z.name]));
  assert.equal(byFile.get("someplace"), "Ruins of Old Guk");
  assert.equal(byFile.get("elsewhere"), "Kithicor Forest");
});

test("the curated list outranks a solved name", () => {
  // The real case: the solver offers `neriaka` the Fourth Gate, which is a different zone's file.
  const zones = zonesFromFiles("brewall", ["neriaka"], { neriaka: "Neriak - Fourth Gate" });
  assert.equal(zones[0].name, "Neriak Foreign Quarter");
});

test("no two zones share a name — that would be one place listed twice", () => {
  // `tox`/`toxxulia`, `northro`/`nro` and `steamfont`/`steamfontmts` are the same zones twice.
  const names = zonesFromFiles("stock", FILES, { tox: "Toxxulia Forest", nro: "Northern Desert of Ro" }).map(
    (z) => z.name,
  );
  assert.equal(new Set(names).size, names.length, `duplicates: ${names.join(", ")}`);
  assert.equal(names.filter((n) => n === "Toxxulia Forest").length, 1);
  assert.equal(names.filter((n) => n === "Northern Desert of Ro").length, 1);
});

test("a name a letter out is the same claim, not a second zone", () => {
  // The reported case: the pack's label for `tox` misspells the forest, so uniqueness by exact string
  // let the same place into the picker twice — once with a map, once without (ADR 0075).
  const zones = zonesFromFiles("stock", FILES, { tox: "Toxulia Forest", nro: "Northern Desert of Roo" });
  const byFile = new Map(zones.map((z) => [z.file!, z.name]));
  assert.equal(byFile.get("toxxulia"), "Toxxulia Forest");
  assert.equal(byFile.get("tox"), "Tox", "the loser falls back to its file name");
  assert.equal(byFile.get("nro"), "Nro");
  assert.equal(zones.filter((z) => z.name.toLowerCase().includes("tox")).length, 2, "one zone, one map, one stub");
});

test("the loser of a duplicate stays reachable under its file name", () => {
  const byFile = new Map(zonesFromFiles("stock", ["tox", "toxxulia"]).map((z) => [z.file!, z.name]));
  assert.equal(byFile.get("toxxulia"), "Toxxulia Forest"); // the curated file
  assert.equal(byFile.get("tox"), "Tox");
});

test("a folder of zones we know nothing about still yields a usable list", () => {
  assert.deepEqual(
    zonesFromFiles("goodurden", ["someplace", "elsewhere"]).map((z) => z.name),
    ["Someplace", "Elsewhere"],
  );
});

test("prettyZoneName only capitalizes — it doesn't invent words", () => {
  assert.equal(prettyZoneName("gukbottom"), "Gukbottom");
  assert.equal(prettyZoneName("qey2hh1"), "Qey2hh1");
});

test("every curated zone is one entry with a file, and no file is claimed twice", () => {
  const files = CURATED_ZONES.map((z) => z.file);
  assert.equal(new Set(files).size, files.length, "a file is curated twice");
  // A **name** may repeat, and deliberately does: `tox` and `toxxulia` are one forest under two
  // short names, so both are listed and `zonesFromFiles` gives the name to whichever the folder has
  // (ADR 0076). What must hold is that a repeat is always a second *candidate* — never a third — and
  // that the entry which wins is the one we verified. See `zone-gazetteer.test.ts` for the pairs.
  const byName = new Map<string, string[]>();
  for (const zone of CURATED_ZONES) byName.set(zone.name, [...(byName.get(zone.name) ?? []), zone.file]);
  for (const [name, claimed] of byName) {
    assert.ok(claimed.length <= 2, `${name} is claimed by ${claimed.length} files: ${claimed.join(", ")}`);
  }
});

test("findZone matches a log's wording — case, and a leading 'the'", () => {
  const zones = zonesFromFiles("stock", FILES);
  assert.equal(findZone("The Feerrott", zones)?.file, "feerrott");
  assert.equal(findZone("feerrott", zones)?.file, "feerrott"); // the log's own casing
  assert.equal(findZone("greater faydark", zones)?.file, "gfaydark");
  assert.equal(findZone("stock:gfaydark", zones)?.file, "gfaydark"); // by key
  assert.equal(findZone("Nowhere At All", zones), undefined);
});

// A curated name pointing at the wrong file is the one mistake that doesn't fail closed: it draws
// a different zone under the right name. `qey2hh1` is West Karana — its own map links "to Qeynos
// Hills", which makes it the neighbour — and Qeynos Hills is `qeytoqrg`.
test("Qeynos Hills is its own map, not the neighbour that links to it", () => {
  const zones = zonesFromFiles("stock", ["qeytoqrg", "qey2hh1"]);
  assert.equal(findZone("Qeynos Hills", zones)?.file, "qeytoqrg");
  assert.equal(findZone("West Karana", zones)?.file, "qey2hh1");
});

test("a zone made harder is still drawn by the same map", () => {
  // The difficulty says how hard the mobs hit, not where they stand, so it can't cost you the map.
  const zones = zonesFromFiles("stock", FILES);
  assert.equal(findZone("The Feerrott 2", zones)?.file, "feerrott");
  assert.equal(findZone("Greater Faydark 4", zones)?.file, "gfaydark");
});

test("sortZones groups a family together", () => {
  const zones = sortZones(zonesFromFiles("stock", ["felwitheb", "gfaydark", "felwithea", "lfaydark"]));
  assert.deepEqual(
    zones.map((z) => z.file),
    ["gfaydark", "lfaydark", "felwithea", "felwitheb"], // Faydark…, then Felwithe…
  );
});

// ── borrowing a zone the chosen pack hasn't got (ADR 0063) ──

test("the chosen pack's zones are its own, and a zone it lacks is borrowed from the game's maps", () => {
  // Real coverage: Brewall ships no `newsebexp` (an EQL-only zone) and the game ships no
  // `blackburrow`, so on a real install each folder had a zone the other needed all along.
  const zones = zonesFromSources(
    { id: "brewall", files: ["gfaydark", "blackburrow"] },
    { id: "stock", files: ["gfaydark", "newsebexp"] },
  );
  const byName = new Map(zones.map((z) => [z.name, z]));
  assert.equal(byName.get("Greater Faydark")?.source, "brewall", "both have it, so the pack draws it");
  assert.equal(byName.get("Blackburrow")?.source, "brewall");
  const borrowed = byName.get("New Sebilis Expedition");
  assert.equal(borrowed?.source, "stock", "the pack hasn't got it, so it's borrowed");
  assert.equal(borrowed?.file, "newsebexp");
  assert.equal(borrowed?.key, "stock:newsebexp", "and its key says where it came from");
});

test("a borrowed zone is named by the folder it came from, never by the pack that lacked it", () => {
  // Invented files again: naming has to come from the *solved* names for this to say anything, and a
  // real short name would be answered by the gazetteer before either folder got a word in.
  const zones = zonesFromSources(
    { id: "brewall", files: ["someplace"], solved: { someplace: "Ruins of Old Guk" } },
    { id: "stock", files: ["someplace", "elsewhere"], solved: { elsewhere: "Kithicor Forest", someplace: "Something Else" } },
  );
  const byFile = new Map(zones.map((z) => [z.file, z.name]));
  assert.equal(byFile.get("someplace"), "Ruins of Old Guk", "the pack's own name for its own file");
  assert.equal(byFile.get("elsewhere"), "Kithicor Forest", "the backstop's name for the borrowed file");
});

test("the pack wins a name collision, so one place is never two entries", () => {
  // Two files, one zone: only one could ever be reached, and it should be the pack you picked.
  const zones = zonesFromSources(
    { id: "brewall", files: ["blackburrow"] },
    { id: "stock", files: ["oldblackburrow"], solved: { oldblackburrow: "Blackburrow" } },
  );
  assert.deepEqual(zones.map((z) => [z.name, z.source]), [["Blackburrow", "brewall"]]);
});

test("a borrowed zone doesn't sneak in under a misspelling of one the pack already draws", () => {
  // Where the duplicate usually came from: two folders labelling one place, one of them a letter out,
  // so the picker offered both and only one of them drew the map you wanted.
  const zones = zonesFromSources(
    { id: "brewall", files: ["toxxulia"] },
    { id: "stock", files: ["tox"], solved: { tox: "Toxulia Forest" } },
  );
  assert.deepEqual(zones.map((z) => [z.name, z.source]), [["Toxxulia Forest", "brewall"]]);
});

test("findZone reaches a pack whose label is a letter out", () => {
  // Otherwise the log's zone has no map at all: nothing in the folder answers to the name it says.
  const zones = zonesFromFiles("brewall", ["tox"], { tox: "Toxulia Forest" });
  assert.equal(findZone("Toxxulia Forest", zones)?.file, "tox");
  // But it still won't reach a zone that merely looks like the one asked for.
  assert.equal(findZone("West Commonlands", zonesFromFiles("stock", ["ecommons"]))?.file, undefined);
});

test("with no backstop, or when the backstop is the chosen source, nothing changes", () => {
  const files = ["gfaydark", "crushbone"];
  const alone = zonesFromSources({ id: "stock", files });
  assert.deepEqual(alone, zonesFromFiles("stock", files));
  assert.deepEqual(zonesFromSources({ id: "stock", files }, { id: "stock", files }), alone);
});

test("a zone on the stock-only list is drawn from the game's maps even when the pack has one", () => {
  // The exception to "your pack wins": a pack's map for a particular zone can be the wrong one to use,
  // and preferring the pack in general can't fix one bad file.
  const zones = zonesFromSources(
    { id: "brewall", files: ["lavastorm", "gfaydark"], solved: { lavastorm: "Brewall's Lavastorm" } },
    { id: "stock", files: ["lavastorm", "kithicor"], solved: { lavastorm: "Lavastorm Mountains" } },
  );
  const lava = zones.find((z) => z.file === "lavastorm");
  assert.equal(lava?.source, "stock", "drawn from the game's own maps");
  assert.equal(lava?.name, "Lavastorm Mountains", "and named by the folder that draws it (ADR 0061)");
  // Only that zone: everything else still comes from the pack you chose.
  assert.equal(zones.find((z) => z.file === "gfaydark")?.source, "brewall");
  assert.equal(zones.filter((z) => z.file === "lavastorm").length, 1, "one place, one entry");
});

test("a stock-only zone the game's maps haven't got keeps the pack's, rather than vanishing", () => {
  // A zone drawn imperfectly beats a zone not drawn at all — the override withholds a file, it doesn't
  // delete the zone.
  const zones = zonesFromSources({ id: "brewall", files: ["lavastorm"] }, { id: "stock", files: ["kithicor"] });
  assert.equal(zones.find((z) => z.file === "lavastorm")?.source, "brewall");
});

test("with no backstop at all, a stock-only zone still draws", () => {
  const zones = zonesFromSources({ id: "brewall", files: ["lavastorm"] });
  assert.equal(zones.length, 1);
  assert.equal(zones[0].source, "brewall");
});

test("the stock-only list is matched on the file name, loosely", () => {
  assert.ok(stockOnly("lavastorm"));
  assert.ok(stockOnly(" Lavastorm "), "however it was typed into the list");
  assert.ok(!stockOnly("lavastorm2"), "and not by prefix — a different zone is a different file");
  assert.ok(!stockOnly(undefined), "an image zone has no file");
  assert.ok(STOCK_ONLY_ZONES.every((f) => f === f.trim().toLowerCase()), "entries are stored ready to match");
});
