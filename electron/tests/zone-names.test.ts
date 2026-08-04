/**
 * Black-box tests for naming map files from the maps' own exit labels.
 *
 * The cases here are the real ones: `gfaydark` is only "The Greater Faydark" if you believe
 * adjacency over spelling, and `sebilis` is only *not* "Western Cabilis" for the same reason. The
 * whole module exists because either signal alone is confidently wrong.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { nameScore, solveZoneNames, zoneLinkName, type ZoneLinks } from "../../src/shared/map/zone-names";

const links = (entries: Record<string, string[]>): ZoneLinks =>
  new Map(Object.entries(entries).map(([file, names]) => [file, new Set(names)]));

test("an exit label names a zone; anything else doesn't", () => {
  assert.equal(zoneLinkName("to The Lesser Faydark"), "The Lesser Faydark");
  assert.equal(zoneLinkName("To Plane of Knowledge"), "Plane of Knowledge");
  assert.equal(zoneLinkName("Succor"), null);
  assert.equal(zoneLinkName("Willaen (Banker)"), null);
});

test("the packs' trailing notes are stripped, and two-destination labels dropped", () => {
  assert.equal(zoneLinkName("to The Northern Desert of Ro (click)"), "The Northern Desert of Ro");
  assert.equal(zoneLinkName("to Erud's Crossing (translocator)"), "Erud's Crossing");
  // A label naming two zones belongs to neither, so it can't be allowed to name one.
  assert.equal(zoneLinkName("to East Freeport & The Butcherblock Mountains (Translocator Narrik)"), null);
  assert.equal(zoneLinkName("to Erudin or South Qeynos (boat or translocator)"), null);
});

test("nameScore reads a short name as a contraction", () => {
  assert.equal(nameScore("crushbone", "Crushbone"), 100); // exact
  assert.ok(nameScore("gfaydark", "The Greater Faydark") > 0); // g·faydark, a subsequence
  assert.ok(nameScore("nektulos", "Nektulos Forest") > nameScore("nektulos", "The Nexus"));
  assert.equal(nameScore("qey2hh1", "Qeynos Hills"), 0); // nothing in common — this needs an alias
});

test("adjacency names a file whose spelling barely matches", () => {
  // "gfaydark" scores poorly against "The Greater Faydark", but its neighbours confirm it: the
  // maps that link to it are exactly the zones it links back to.
  const solved = solveZoneNames(
    links({
      gfaydark: ["Clan Crushbone", "The Lesser Faydark", "Northern Felwithe"],
      crushbone: ["The Greater Faydark"],
      lfaydark: ["The Greater Faydark"],
      felwithea: ["The Greater Faydark"],
    }),
  );
  assert.equal(solved.gfaydark, "The Greater Faydark");
  assert.equal(solved.crushbone, "Clan Crushbone");
  assert.equal(solved.lfaydark, "The Lesser Faydark");
});

test("a well-spelled name with no neighbours to confirm it is refused", () => {
  // Spelling alone offers `sebilis` "Western Cabilis". Nothing links the two, so it's not taken —
  // this is the failure the adjacency check exists to prevent.
  const solved = solveZoneNames(
    links({
      sebilis: ["Trakanon's Teeth"],
      cabeast: ["Field of Bone", "Western Cabilis"],
      fieldofbone: ["Cabilis East"],
    }),
  );
  assert.notEqual(solved.sebilis, "Western Cabilis");
});

test("one name goes to one file, so the right claimant wins it", () => {
  // Both files can spell "Cabilis West"; only one is linked to as it.
  const solved = solveZoneNames(
    links({
      cabwest: ["Field of Bone", "Cabilis East"],
      cabeast: ["Cabilis West"],
      fieldofbone: ["Cabilis West"],
    }),
  );
  assert.equal(solved.cabwest, "Cabilis West");
  assert.notEqual(solved.cabeast, "Cabilis West");
  // And no name is handed out twice.
  const names = Object.values(solved);
  assert.equal(new Set(names).size, names.length);
});

test("a zone nothing links to is left unnamed rather than guessed at", () => {
  const solved = solveZoneNames(links({ gukbottom: [], guktop: [] }));
  assert.deepEqual(solved, {});
});

test("a file never takes the name of a zone it links to — that's a neighbour, not itself", () => {
  const solved = solveZoneNames(
    links({
      innothule: ["Guk", "The Feerrott"],
      feerrott: ["Innothule Swamp"],
      guktop: ["Innothule Swamp"],
    }),
  );
  assert.equal(solved.innothule, "Innothule Swamp");
  assert.notEqual(solved.feerrott, "Innothule Swamp");
});
