/**
 * Reading travel points off map labels. The interesting half is what's *refused*: a label that says
 * a border is here without saying where it goes can't join anything, and a destination invented for
 * it would be a guess.
 *
 * Every label here is a real shape from the corpus (see poi-kinds.ts's tallies).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MapPoi } from "../../src/shared/map/eqmap";
import { deadConveyance, harvestZone, transportCrossing, travelPoint } from "../../src/shared/travel/harvest";

const poi = (label: string, y = 0, x = 0, z = 0): MapPoi => ({ label, y, x, z, size: 3 });

test("`to X` and `from X` are the same thing — a border with X, here", () => {
  const out = travelPoint(poi("to Clan Crushbone", 100, -200, 5));
  assert.deepEqual(out, { label: "to Clan Crushbone", at: { y: 100, x: -200, z: 5 }, kind: "border", to: "Clan Crushbone" });

  // The way in is the same place as the way out, so it harvests the same way: the builder joins both
  // sides into one node, and which wording a pack chose stops mattering there.
  const back = travelPoint(poi("from Greater Faydark"));
  assert.equal(back?.kind, "border");
  assert.equal(back?.to, "Greater Faydark");
});

test("the noise a pack appends to an exit label isn't part of the zone's name", () => {
  // Same rules as the gazetteer's — `zoneLinkName` owns them, and this is the reuse, not a copy.
  assert.equal(travelPoint(poi("to The Plane of Knowledge (Click Book)"))?.to, "The Plane of Knowledge");
});

test("a label that names no single destination is refused rather than guessed at", () => {
  // A border with no destination: real, drawn, and useless to a graph.
  assert.equal(travelPoint(poi("Zone Line")), undefined);
  // Two destinations belong to neither, which is `zoneLinkName`'s rule and the right one.
  assert.equal(travelPoint(poi("to East Freeport & The Butcherblock Mountains")), undefined);
  // Not travel at all.
  assert.equal(travelPoint(poi("a gnoll pup")), undefined);
  assert.equal(travelPoint(poi("Forge")), undefined);
});

test("a labelled ferry destination is a border like any other", () => {
  // A boat costs no walking and asks nothing of you but turning up, which is what a zone line is. So
  // where a pack labels both ends this way, the two pair into one boundary with no help from anyone.
  const boat = travelPoint(poi("to Timorous Deep (Boat)"));
  assert.equal(boat?.kind, "border");
  assert.equal(boat?.to, "Timorous Deep");

  assert.equal(travelPoint(poi("to Lesser Faydark"))?.kind, "border");
});

test("a conveyance that says where it goes has its destination read, not thrown away", () => {
  // The bug that cut Odus off the graph. Only labels *starting* with "to" became borders, so every
  // `Boat to X` / `Translocator to X` — which states a connection just as plainly — joined nothing, and
  // a continent reachable only by boat was an island.
  const boat = travelPoint(poi("Boat to Butcherblock Mountains"));
  assert.equal(boat?.to, "Butcherblock Mountains");
  assert.equal(boat?.crossing, "boat");

  assert.equal(travelPoint(poi("Translocator to Erudin"))?.to, "Erudin");
  // A trailing parenthetical is the ruleset-tag shape the shared zone fold already strips, so the
  // route's own name for the crossing doesn't stop it resolving.
  assert.equal(travelPoint(poi("Boat to Erudin (Sea of Storms)"))?.to, "Erudin (Sea of Storms)");

  // `zoneLinkName`'s rules apply here too, which is the point of handing the tail to it: a conveyance
  // that can't pick one destination names none.
  assert.equal(travelPoint(poi("Boat to East Freeport & The Butcherblock Mountains"))?.to, undefined);
  // And a conveyance that says nothing about where it goes still waits for a person.
  assert.equal(travelPoint(poi("Dock"))?.to, undefined);
});

test("a conveyance says how you'd cross, in the words a route shows", () => {
  assert.equal(travelPoint(poi("Druid Rings"))?.crossing, "ring");
  assert.equal(travelPoint(poi("Spires"))?.crossing, "spire");
  assert.equal(travelPoint(poi("Dock"))?.crossing, "boat");
  assert.equal(travelPoint(poi("Translocator Narrik"))?.crossing, "translocator");
  // A portal is recognised as a portal now, rather than falling through — it still joins nothing until
  // a person says where it goes, but a route can at least say what it is.
  assert.equal(travelPoint(poi("Portal"))?.crossing, "portal");
  assert.equal(travelPoint(poi("Portal"))?.kind, "place");

  // A gnome standing on a dock is a gnome, and a portal is checked last, being the vaguest.
  assert.equal(transportCrossing("Dock (Translocator Narrik)"), "translocator");
  assert.equal(transportCrossing("Portal to the Spires"), "spire");
  // Nothing recognisable is still nothing — the fallthrough is the point.
  assert.equal(transportCrossing("Bank"), undefined);
});

test("a succor point names nowhere because it goes nowhere, so it's a place rather than a dropped exit", () => {
  // `poiKind` files it under zone lines — it's drawn where the exits are — and it names no destination,
  // which for anything else means "a border we can't use". A succor is the one where that's not a gap:
  // it has no far side, being the spot inside *this* zone an evacuation drops you at.
  const succor = travelPoint(poi("Succor", 10, 20, 30));
  assert.deepEqual(succor, { label: "Succor", at: { y: 10, x: 20, z: 30 }, kind: "place", crossing: "succor" });

  // The other spellings the packs use, which reach here down the *other* path — `Evac Point` reads as a
  // plain name to the shared classifier, and gets re-read like `Druid Rings` does.
  assert.equal(travelPoint(poi("Succor Point"))?.crossing, "succor");
  assert.equal(travelPoint(poi("Evac Point"))?.crossing, "succor");
  assert.equal(travelPoint(poi("Evacuate"))?.crossing, "succor");

  // A label that does name a destination is a border, whatever else it mentions — the succor reading is
  // only ever reached once nothing has resolved.
  assert.equal(travelPoint(poi("to North Karana (Succor)"))?.kind, "border");

  // Not offered: "Safe Spot" is where you camp far more often than where you land, and a wrong safe
  // point is a free ride to the wrong end of the zone.
  assert.equal(travelPoint(poi("Safe Spot")), undefined);
  assert.equal(transportCrossing("Safe Point"), undefined);
});

test("a conveyance the shared classifier files as a plain name is still a conveyance", () => {
  // `poiKind` reads "Druid Rings" as a name — its transport vocabulary spells the ring singular — so
  // trusting that verdict alone would lose the druid network on every pack that writes it plural.
  assert.equal(travelPoint(poi("Druid Rings"))?.kind, "place");

  // The boundary that makes re-reading safe: only its two *fallback* kinds are offered, so a person
  // whose name mentions a dock stays a person.
  assert.equal(travelPoint(poi("a dock worker")), undefined, "an article means a mob, and mobs aren't offered");
  assert.equal(travelPoint(poi("Dock Merchant")), undefined, "a shop by the water is a shop");
});

test("a zone's harvest keeps the file's own order, and counts what it dropped", () => {
  const { zone, points, dropped } = harvestZone("gfaydark", [
    poi("to Lesser Faydark", 1),
    poi("Zone Line"),
    poi("to Clan Crushbone", 2),
    poi("a wood elf guard"),
  ]);
  assert.equal(zone, "gfaydark");
  // Order is what makes a place's node id stable across rebuilds.
  assert.deepEqual(points.map((p) => p.to), ["Lesser Faydark", "Clan Crushbone"]);
  assert.deepEqual(dropped, ["Zone Line"], "a mob isn't a dropped exit, but a nameless border is");
});

test("a conveyance the map calls dead is no travel point at all", () => {
  // The whole corpus, both packs, ~1,200 files — four words, five labels, one meaning. Greater
  // Faydark's *only* druid ring is the abandoned one, which is exactly why reading it as live is worse
  // than not reading it: a hub makes every ring a destination from every zone, so one dead marker
  // offers the whole world a free ride to a circle of stones that doesn't work.
  for (const label of [
    "Abandoned Druid Ring",
    "Ruined Druid ring",
    "Inactive Druid Ring",
    "Broken Wizard Spire",
    "Broken Portal",
  ]) {
    assert.ok(deadConveyance(label), label);
    assert.equal(travelPoint(poi(label)), undefined, label);
  }

  // The live ones are untouched, including in a zone that has both.
  assert.equal(travelPoint(poi("Druid Ring"))?.crossing, "ring");
  assert.equal(travelPoint(poi("Wizard Spires"))?.crossing, "spire");
  assert.deepEqual(
    harvestZone("gfaydark", [poi("Abandoned Druid Ring"), poi("Wizard Spires"), poi("to Lesser Faydark")]).points.map(
      (p) => p.label,
    ),
    ["Wizard Spires", "to Lesser Faydark"],
  );
});

test("a dead word only counts when it sits on the conveyance", () => {
  // The loose version — the two words anywhere in the label — reads a boat to a place with "Broken" in
  // its name as a broken boat. One word between them is the ceiling, which is what `Broken Wizard
  // Spire` needs and what these must not reach.
  assert.equal(deadConveyance("to the Broken Skull Rock (boat)"), false);
  assert.equal(deadConveyance("Ruined Temple of Cazic-Thule"), false);
  assert.equal(deadConveyance("Abandoned Orc Shovel"), false);
  // And a border into a dead crossing goes too, since the check runs before the label is read as one.
  assert.equal(travelPoint(poi("to Paineel (broken portal)")), undefined);
});
