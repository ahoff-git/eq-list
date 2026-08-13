/**
 * Which expansion a zone came with, and whether that means you can go there.
 *
 * The load-bearing property is that it **fails open**: excluding a zone the server has would cut it out
 * of the map and every route silently, which is much worse than offering one it hasn't. So the table is
 * checked in both directions — the zones it must exclude, and the zones it must never exclude.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  outOfEraSet,
  SERVER_EXPANSIONS,
  unavailableReason,
  ZONE_EXPANSIONS,
  zoneAvailable,
  zoneExpansion,
  zoneUnavailable,
} from "../../src/shared/zones/expansions";

test("the generated table is release-ordered, and the original release owns its zones", () => {
  // Order decides which expansion owns a zone two of them list, so a classic zone in a later
  // expansion's revamp table must not be attributed to it — and then excluded from the whole app.
  assert.equal(ZONE_EXPANSIONS[0].expansion, "Original Release");
  const dates = ZONE_EXPANSIONS.map((e) => Date.parse(e.released)).filter((t) => Number.isFinite(t));
  assert.deepEqual(dates, [...dates].sort((a, b) => a - b), "expansions are in release order");
});

test("a zone from an expansion this server doesn't run is refused, and says which", () => {
  const argath = zoneExpansion("Argath, Bastion of Illdaera");
  assert.equal(argath?.expansion, "Veil of Alaris");
  assert.equal(argath?.onServer, false);
  assert.equal(zoneUnavailable("Argath, Bastion of Illdaera"), "future");
  assert.equal(zoneAvailable("Argath, Bastion of Illdaera"), false);
  assert.equal(unavailableReason("future", argath), "Veil of Alaris — not on this server");

  // A few more from expansions well past this server, to show it isn't one hand-listed zone.
  for (const zone of ["Sarith, City of Tides", "Shadow Haven", "Plane of Knowledge", "Vex Thal"]) {
    assert.equal(zoneAvailable(zone), false, `${zone} should not be reachable`);
  }
});

test("a zone this server has is available, whichever way its name is written", () => {
  for (const zone of ["Greater Faydark", "Ak'Anon", "Ak`Anon", "The Feerrott", "Feerrott", "Blackburrow 3"]) {
    assert.equal(zoneAvailable(zone), true, `${zone} should be reachable`);
  }
  const faydark = zoneExpansion("greater faydark");
  assert.equal(faydark?.expansion, "Original Release");
  assert.ok(SERVER_EXPANSIONS.includes(faydark!.expansion));
});

test("a zone the table has never heard of is available — it fails open", () => {
  // Legends has custom zones, and eqlwiki names 28 zones differently from fandom. Excluding those
  // would remove real places from the map and every route, so the unknown answer is "yes".
  //
  // `Gukbottom` used to stand in here as a file name nothing could place; the gazetteer folds it onto
  // Lower Guk now (ADR 0076), which is the point of it — so this asks with names no table can know.
  for (const zone of ["New Sebilis Expedition", "EQL Tutorial", "Somewhere Invented", "Brewalls Own Map"]) {
    assert.equal(zoneExpansion(zone), undefined, `${zone} is not in the table`);
    assert.equal(zoneAvailable(zone), true, `${zone} must not be excluded`);
  }
});

test("the live era list is what makes Kunark closed today and open later", () => {
  // The server *has* Kunark, so the table says nothing against it — being open is eqlwiki's business,
  // and that's the half that changes without a code change.
  assert.equal(zoneExpansion("Timorous Deep")?.expansion, "The Ruins of Kunark");
  assert.equal(zoneUnavailable("Timorous Deep"), undefined, "the table alone doesn't close it");

  const closed = outOfEraSet(["Timorous Deep", "Firiona Vie"]);
  assert.equal(zoneUnavailable("Timorous Deep", closed), "out-of-era");
  assert.equal(unavailableReason("out-of-era"), "not in this era yet");
  // Folded like every other zone name, so the wiki's wording and a map's needn't match exactly.
  assert.equal(zoneUnavailable("The Timorous Deep", closed), "out-of-era");
  // And the day it opens, the same call says yes with nothing edited here.
  assert.equal(zoneAvailable("Timorous Deep", outOfEraSet([])), true);
});

test("a permanent refusal outranks a temporary one", () => {
  // If both applied, "not on this server" is the truer thing to say: an era opening won't help.
  const closed = outOfEraSet(["Argath, Bastion of Illdaera"]);
  assert.equal(zoneUnavailable("Argath, Bastion of Illdaera", closed), "future");
});
