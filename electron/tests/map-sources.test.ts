/**
 * Black-box tests for turning a folder of map files into zones. The risk this module manages is a
 * *confident wrong answer* — a file labelled as a zone it isn't — so most of these pin what must
 * NOT happen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { prettyZoneName, zonesFromFiles } from "../../src/shared/map/map-sources";
import { CURATED_ZONES, findZone, sortZones } from "../../src/shared/map/zones";

/** A slice of a real maps folder, including the near-misses that make naming dangerous. */
const FILES = [
  "gfaydark", "lfaydark", "crushbone", "felwithea", "felwitheb", "qey2hh1", "qeynos", "qeynos2",
  "commonlands", "commons", "ecommons", "unrest", "runnyeye", "newsebexp", "nektulos", "toxxulia",
  "tox", "gukbottom", "akanon", "feerrott", "northro", "nro", "steamfontmts", "steamfont",
];

test("a curated zone takes its own file, and nothing else does", () => {
  const byFile = new Map(zonesFromFiles("brewall", FILES).map((z) => [z.file!, z.name]));
  assert.equal(byFile.get("gfaydark"), "Greater Faydark");
  assert.equal(byFile.get("qey2hh1"), "Qeynos Hills");
  assert.equal(byFile.get("felwithea"), "Northern Felwithe");
  assert.equal(byFile.get("felwitheb"), "Southern Felwithe");
  assert.equal(byFile.get("runnyeye"), "RunnyEye Citadel");
  // `qeynos` is South Qeynos, and nothing curated claims it, so it keeps its file name — it must
  // never inherit "Qeynos Hills" from the file next to it.
  assert.equal(byFile.get("qeynos"), "Qeynos");
});

test("a zone we can't name keeps its file name, and is still offered", () => {
  const zones = zonesFromFiles("brewall", FILES);
  assert.equal(zones.find((z) => z.file === "gukbottom")?.name, "Gukbottom");
  assert.equal(zones.length, FILES.length);
  assert.ok(zones.every((z) => z.file && z.key.startsWith("brewall:")));
});

test("a solved name is used where nothing curated applies", () => {
  const zones = zonesFromFiles("brewall", ["gukbottom", "kithicor"], {
    gukbottom: "Ruins of Old Guk",
    kithicor: "Kithicor Forest",
  });
  const byFile = new Map(zones.map((z) => [z.file!, z.name]));
  assert.equal(byFile.get("gukbottom"), "Ruins of Old Guk");
  assert.equal(byFile.get("kithicor"), "Kithicor Forest");
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
  const names = CURATED_ZONES.map((z) => z.name);
  assert.equal(new Set(names).size, names.length, "a name is curated twice");
});

test("findZone matches a log's wording — case, and a leading 'the'", () => {
  const zones = zonesFromFiles("stock", FILES);
  assert.equal(findZone("The Feerrott", zones)?.file, "feerrott");
  assert.equal(findZone("feerrott", zones)?.file, "feerrott"); // the log's own casing
  assert.equal(findZone("greater faydark", zones)?.file, "gfaydark");
  assert.equal(findZone("stock:gfaydark", zones)?.file, "gfaydark"); // by key
  assert.equal(findZone("Nowhere At All", zones), undefined);
});

test("sortZones groups a family together", () => {
  const zones = sortZones(zonesFromFiles("stock", ["felwitheb", "gfaydark", "felwithea", "lfaydark"]));
  assert.deepEqual(
    zones.map((z) => z.file),
    ["gfaydark", "lfaydark", "felwithea", "felwitheb"], // Faydark…, then Felwithe…
  );
});
