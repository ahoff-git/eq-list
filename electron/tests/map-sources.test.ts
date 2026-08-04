/**
 * Black-box tests for turning a folder of map files into zones. The risk this module exists
 * to manage is a *confident wrong answer* — a file labelled as a zone it isn't — so most of
 * these pin what must NOT be matched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { IMAGE_SOURCE, prettyZoneName, zoneFileCandidates, zonesFromFiles } from "../../src/shared/map/map-sources";
import { baseZones } from "../../src/shared/map/zones";
import type { Zone } from "../../src/shared/map/types";

/** A slice of a real maps folder, including the near-misses that make naming dangerous. */
const FILES = [
  "gfaydark", "lfaydark", "crushbone", "felwithea", "felwitheb", "qey2hh1", "qeynos", "qeynos2",
  "commonlands", "commons", "ecommons", "unrest", "runnyeye", "newsebexp", "nektulos", "toxxulia",
  "tox", "gukbottom", "akanon", "feerrott", "northro", "nro", "steamfontmts", "steamfont",
];

test("candidates put the alias first, then the plain name", () => {
  assert.equal(zoneFileCandidates("Greater Faydark")[0], "gfaydark");
  assert.deepEqual(zoneFileCandidates("Toxxulia Forest").slice(0, 2), ["toxxulia", "tox"]);
  // No alias needed when the name *is* the file name.
  assert.deepEqual(zoneFileCandidates("Crushbone"), ["crushbone"]);
  // Punctuation is dropped, which is how Ak'Anon finds akanon.
  assert.ok(zoneFileCandidates("Ak'Anon").includes("akanon"));
  // "X of Y" → "y", which is how The Estate of Unrest finds unrest.
  assert.ok(zoneFileCandidates("The Estate of Unrest").includes("unrest"));
});

test("a zone is never named after a file belonging to a different zone", () => {
  // The two traps a looser rule falls into: dropping a trailing word maps Qeynos Hills onto
  // South Qeynos, and taking the last word maps East Commonlands onto the Commonlands.
  assert.ok(!zoneFileCandidates("Qeynos Hills").includes("qeynos"));
  assert.ok(!zoneFileCandidates("East Commonlands").includes("commonlands"));
  assert.ok(!zoneFileCandidates("East Commonlands").includes("commons"));
});

test("zonesFromFiles names what it can and shows the file name for the rest", () => {
  const zones = zonesFromFiles("brewall", FILES, baseZones);
  const byFile = new Map(zones.map((z) => [z.file!, z.name]));

  assert.equal(byFile.get("gfaydark"), "Greater Faydark");
  assert.equal(byFile.get("qey2hh1"), "Qeynos Hills");
  assert.equal(byFile.get("felwithea"), "Northern Felwithe");
  assert.equal(byFile.get("felwitheb"), "Southern Felwithe");
  assert.equal(byFile.get("runnyeye"), "RunnyEye Citadel");
  // A zone we can't name keeps its file name, which is honest and still selectable.
  assert.equal(byFile.get("gukbottom"), "Gukbottom");
  assert.equal(byFile.get("qeynos"), "Qeynos");
  // Every file is offered, and each carries the file it came from.
  assert.equal(zones.length, FILES.length);
  assert.ok(zones.every((z) => z.file && z.key.startsWith("brewall:")));
});

test("two files can't claim one zone name — that would fake a layer", () => {
  // `toxxulia` and `tox` are the same zone twice; only one may take the real name, because
  // zones sharing a name are treated as layers of one place (see zoneLayers).
  const zones = zonesFromFiles("stock", FILES, baseZones);
  const names = zones.map((z) => z.name);
  assert.equal(new Set(names).size, names.length, `duplicate names: ${names.join(", ")}`);
  assert.equal(names.filter((n) => n === "Toxxulia Forest").length, 1);
  assert.equal(names.filter((n) => n === "Northern Desert of Ro").length, 1);
  assert.equal(names.filter((n) => n === "Steamfont Mountains").length, 1);
});

test("the alias order decides which spelling wins, and the loser stays reachable", () => {
  const zones = zonesFromFiles("stock", FILES, baseZones);
  const byFile = new Map(zones.map((z) => [z.file!, z.name]));
  // `toxxulia` is listed first in the alias, so it takes the name...
  assert.equal(byFile.get("toxxulia"), "Toxxulia Forest");
  // ...and the other spelling is still in the list under its file name.
  assert.equal(byFile.get("tox"), "Tox");
});

test("a folder with none of our known zones still yields a usable list", () => {
  const zones = zonesFromFiles("goodurden", ["someplace", "elsewhere"], baseZones);
  assert.deepEqual(
    zones.map((z) => z.name),
    ["Someplace", "Elsewhere"],
  );
});

test("prettyZoneName only capitalizes — it doesn't invent words", () => {
  assert.equal(prettyZoneName("gukbottom"), "Gukbottom");
  assert.equal(prettyZoneName("qey2hh1"), "Qey2hh1");
});

test("file-backed zones need no calibration, and don't claim any", () => {
  const zones: Zone[] = zonesFromFiles("brewall", ["gfaydark"], baseZones);
  assert.equal(zones[0].scale, undefined);
  assert.equal(zones[0].center, undefined);
  assert.equal(zones[0].mapImg, undefined);
  // The bundled-image source id is distinct from any folder's.
  assert.notEqual(zones[0].key, IMAGE_SOURCE);
});
