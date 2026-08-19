/**
 * The hand-authored pass. What matters here is that it's **additive and addressable**: a place is
 * named by zone plus a piece of its label (so it survives switching map packs), a boat is stated as a
 * **border** rather than a priced ride, and adding to a network the maps already found extends that
 * network rather than standing up a second.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTravelGraph } from "../../src/shared/travel/build";
import type { TravelPoint, ZoneHarvest } from "../../src/shared/travel/harvest";
import { applyManual, type TravelManual } from "../../src/shared/travel/manual";
import { NOT_IN_GAME, STALE_DRAWINGS } from "../../src/shared/travel/manual-links";
import { findRoute } from "../../src/shared/travel/route";

const NAMES = {
  freporte: "East Freeport",
  butcher: "Butcherblock Mountains",
  oot: "Ocean of Tears",
  gfaydark: "Greater Faydark",
};

const dock = (x = 0, label = "Dock"): TravelPoint => ({ label, at: { y: 0, x, z: 0 }, kind: "place", crossing: "boat" });
const ring = (): TravelPoint => ({ label: "Druid Rings", at: { y: 0, x: 0, z: 0 }, kind: "place", crossing: "ring" });
const border = (to: string, x = 0): TravelPoint => ({ label: `to ${to}`, at: { y: 0, x, z: 0 }, kind: "border", to });

/** A graph from harvests, so the manual pass is always applied to a real build's output. */
function built(zones: Record<string, TravelPoint[]>) {
  const harvests: ZoneHarvest[] = Object.entries(zones).map(([zone, points]) => ({ zone, points, dropped: [], board: [] }));
  return buildTravelGraph({ id: "stock" }, harvests, NAMES).graph;
}

const BOAT: TravelManual = {
  links: [
    {
      shape: "boundary",
      via: "boat",
      places: [{ zone: "freporte", label: "dock" }, { zone: "butcher", label: "dock" }],
      why: "The Freeport–Butcherblock run.",
    },
  ],
};

test("a boat is a border between two zones, positioned at each end's dock", () => {
  const before = built({ freporte: [dock(100)], butcher: [dock(900)] });
  const { graph: after, report } = applyManual(before, BOAT);

  assert.deepEqual(report.applied, [{ why: "The Freeport–Butcherblock run.", kind: "boundary", edges: 0 }]);
  assert.deepEqual(report.boundaries, ["butcher|freporte"]);

  const node = after.nodes.find((n) => n.id === "butcher|freporte")!;
  assert.equal(node.kind, "boundary");
  assert.equal(node.label, "Butcherblock Mountains ↔ East Freeport", "the name is the two zones");
  assert.equal(node.via, "boat", "how you cross is one field, which a UI badges and a script prints");
  assert.deepEqual(node.at, { butcher: [{ y: 0, x: 900, z: 0 }], freporte: [{ y: 0, x: 100, z: 0 }] });

  // No mode, no cost, no toggle: crossing it is as unconditional as a zone line, so there is no edge
  // for it at all and nothing in the route says a conveyance was used.
  assert.equal(after.edges.some((e) => e.mode !== "walk"), false);
  const route = findRoute(after, "East Freeport", "Butcherblock Mountains")!;
  assert.deepEqual(route.modes, []);
  assert.deepEqual(route.zones.map((z) => z.zone), ["freporte", "butcher"]);
});

test("a boat the maps already paired up themselves only gains coordinates", () => {
  // `to Butcherblock Mountains (Boat)` and its counterpart harvest as an ordinary border, so the
  // build already made the node. The entry must extend it, not stand up a second one.
  const before = built({
    freporte: [border("Butcherblock Mountains", 100), dock(200)],
    butcher: [border("East Freeport", 900), dock(800)],
  });
  assert.equal(before.nodes.filter((n) => n.kind === "boundary").length, 1);

  const { graph: after } = applyManual(before, BOAT);
  const boundaries = after.nodes.filter((n) => n.kind === "boundary");
  assert.equal(boundaries.length, 1, "one border, whoever found it");
  assert.deepEqual(boundaries[0].at.freporte, [{ y: 0, x: 100, z: 0 }, { y: 0, x: 200, z: 0 }]);
  // And the walks in that zone were recomputed, so the dock's coordinate can win: the border is now
  // reachable at 200, which is where the dock is.
  const walk = after.edges.find((e) => e.mode === "walk" && e.zone === "freporte" && e.from === "freporte#dock")!;
  assert.equal(walk.cost, 0, "the dock is one of the border's own crossing points");
});

test("the input graph is left alone — the generated file stays the record of what the maps said", () => {
  const before = built({ freporte: [dock()], butcher: [dock()] });
  const edges = before.edges.length;
  const nodes = before.nodes.length;
  const at = JSON.stringify(before.nodes.map((n) => n.at));
  applyManual(before, BOAT);
  assert.equal(before.edges.length, edges);
  assert.equal(before.nodes.length, nodes);
  assert.equal(JSON.stringify(before.nodes.map((n) => n.at)), at, "not even a position was added in place");
});

test("a border whose far side has no dock drawn is still a border, priced as a guess", () => {
  const before = built({ freporte: [dock()], butcher: [border("Greater Faydark", 700)], gfaydark: [border("Butcherblock Mountains")] });
  const { graph: after } = applyManual(before, BOAT);

  const node = after.nodes.find((n) => n.id === "butcher|freporte")!;
  assert.deepEqual(Object.keys(node.at), ["freporte"], "nothing in Butcherblock said where the dock is");
  // Walking on from it across Butcherblock is a stand-in, and the route says so — but the crossing
  // isn't lost, which is the point.
  const walk = after.edges.find((e) => e.mode === "walk" && e.zone === "butcher" && e.from === "butcher|freporte")!;
  assert.equal(walk.cost, 2000);
  assert.equal(walk.assumed, true);

  const route = findRoute(after, "East Freeport", "Greater Faydark")!;
  assert.deepEqual(route.zones.map((z) => z.zone), ["freporte", "butcher", "gfaydark"]);
  assert.equal(route.assumed, true);
});

test("a border entry that doesn't name exactly two zones states nothing, and says so", () => {
  const manual: TravelManual = {
    links: [
      {
        shape: "boundary",
        places: [{ zone: "freporte", label: "dock" }, { zone: "oot", label: "dock" }, { zone: "butcher", label: "dock" }],
        why: "Three zones is a chain of borders, not one border.",
      },
    ],
  };
  const { graph: after, report } = applyManual(built({ freporte: [dock()], oot: [dock()], butcher: [dock()] }), manual);
  assert.deepEqual(report.badBoundaries, ["Three zones is a chain of borders, not one border."]);
  assert.deepEqual(report.boundaries, []);
  assert.equal(after.nodes.some((n) => n.kind === "boundary"), false);
});

test("an entry naming a zone this pack has no map for is reported, not applied", () => {
  const manual: TravelManual = {
    links: [
      {
        shape: "boundary",
        places: [{ zone: "freporte", label: "dock" }, { zone: "atlantis", label: "dock" }],
        why: "A zone that doesn't exist here.",
      },
    ],
  };
  const { graph: after, report } = applyManual(built({ freporte: [dock()] }), manual);
  assert.deepEqual(report.unknownZones, ["atlantis"]);
  assert.deepEqual(report.applied, [], "one end is no border");
  assert.equal(after.nodes.some((n) => n.kind === "boundary"), false);
});

test("a port place this pack never labelled is invented, and wired into its zone as a guess", () => {
  const before = built({ butcher: [ring(), border("Greater Faydark", 700)], oot: [ring()], gfaydark: [border("Butcherblock Mountains")] });
  const { graph: after, report } = applyManual(before, {
    links: [
      { shape: "network", mode: "druid", places: [{ zone: "gfaydark", name: "Faydark ring" }], why: "A ring this pack never drew." },
    ],
  });

  assert.deepEqual(report.invented, ["manual:gfaydark#faydark-ring"]);
  const invented = after.nodes.find((n) => n.id === "manual:gfaydark#faydark-ring")!;
  assert.deepEqual(invented.at, {}, "we know it's in Greater Faydark, not where");
  // Walks are stored, so it would be an island without being wired in.
  const walk = after.edges.find((e) => e.mode === "walk" && e.from === invented.id)!;
  assert.equal(walk.to, "butcher|gfaydark");
  assert.equal(walk.cost, 2000);
  assert.equal(walk.assumed, true);
});

test("adding to a network the maps already found extends it, rather than making a second one", () => {
  const before = built({ butcher: [ring()], oot: [ring()] });
  assert.ok(before.nodes.some((n) => n.id === "net:druid"), "the maps found this one themselves");

  const { graph: after } = applyManual(before, {
    links: [{ shape: "network", mode: "druid", places: [{ zone: "freporte", name: "Freeport ring" }], why: "A ring this pack never drew." }],
  });

  assert.equal(after.nodes.filter((n) => n.kind === "hub").length, 1, "one network, not two");
  assert.deepEqual(findRoute(after, "East Freeport", "Ocean of Tears", { druid: true })?.modes, ["druid"]);
});

test("dropping a zone from a network keeps the place and removes the free ride", () => {
  const before = built({ butcher: [ring()], oot: [ring()] });
  const { graph: after, report } = applyManual(before, {
    links: [],
    drop: [{ network: "druid", zone: "oot", why: "The ring is drawn but doesn't work." }],
  });

  assert.deepEqual(report.networksDropped, [{ network: "druid", zone: "oot" }]);
  assert.ok(after.nodes.some((n) => n.id === "oot#druid-rings"), "still a real place on the map");
  assert.equal(findRoute(after, "Butcherblock Mountains", "Ocean of Tears", { druid: true }), undefined);
});

test("a block removes the walk rather than being remembered alongside it", () => {
  const before = built({
    butcher: [border("East Freeport", 0), border("Greater Faydark", 900)],
    freporte: [],
    gfaydark: [],
  });
  assert.ok(findRoute(before, "East Freeport", "Greater Faydark"));

  const { graph: after, report } = applyManual(before, {
    links: [],
    blocks: [{ zone: "butcher", a: "East Freeport", b: "Greater Faydark", why: "Opposite sides of a locked door." }],
  });

  assert.equal(report.blocked, 2, "both directions");
  assert.equal(after.edges.filter((e) => e.mode === "walk" && e.zone === "butcher").length, 0);
  assert.equal(findRoute(after, "East Freeport", "Greater Faydark"), undefined);
});

test("a block survives a zone whose walks were recomputed for a border in the same pass", () => {
  // The recompute would otherwise put back exactly the walk a person just said isn't one.
  //
  // Butcherblock deliberately has *only* its two borders. A block is a claim about one pair, so a
  // third node in the zone — its own dock, say, standing where the boat lands — is legitimately a way
  // round it, and that would test nothing about the recompute.
  const before = built({
    butcher: [border("Greater Faydark", 900)],
    freporte: [dock()],
    gfaydark: [],
  });
  const { graph: after, report } = applyManual(before, {
    ...BOAT,
    blocks: [{ zone: "butcher", a: "East Freeport", b: "Greater Faydark", why: "The dock is walled off from the pass." }],
  });

  assert.deepEqual(report.boundaries, ["butcher|freporte"]);
  assert.equal(report.blocked, 2);
  assert.equal(findRoute(after, "East Freeport", "Greater Faydark"), undefined);
});

test("a block needs two real places, and says so when it doesn't get them", () => {
  const before = built({ butcher: [dock(0, "West Dock"), border("East Freeport", 500)], freporte: [] });
  const { graph: after, report } = applyManual(before, {
    links: [],
    blocks: [
      { zone: "butcher", a: "west dock", b: "east dock", why: "No such place." },
      { zone: "butcher", a: "west dock", b: "west dock", why: "Matches one place twice." },
    ],
  });
  assert.deepEqual(report.unresolvedBlocks, [
    "butcher: west dock ↔ east dock",
    "butcher: west dock ↔ west dock",
  ]);
  assert.equal(report.blocked, 0);
  assert.ok(findRoute(after, "Butcherblock Mountains", "East Freeport"));
});

test("a hand-authored place names its zone either way round — its name or its map file", () => {
  // The shipped table says "South Qeynos"; this pack's file is `qeynos`. A file name differs between
  // packs while a zone's name doesn't, so an entry shouldn't have to guess which one is in front of it.
  const before = built({ freporte: [dock(100)], butcher: [dock(900)] });
  const byName: TravelManual = {
    links: [
      {
        shape: "boundary",
        via: "translocator",
        places: [{ zone: "East Freeport", label: "dock" }, { zone: "Butcherblock Mountains", label: "dock" }],
        why: "Named by zone, not by file.",
      },
    ],
  };
  const { graph: after, report } = applyManual(before, byName);
  assert.deepEqual(report.unknownZones, [], "both zones were found");
  assert.deepEqual(report.boundaries, ["butcher|freporte"]);
  // The same border the file-named entry makes, positioned at the same two docks.
  const node = after.nodes.find((n) => n.id === "butcher|freporte")!;
  assert.deepEqual(node.at, { butcher: [{ y: 0, x: 900, z: 0 }], freporte: [{ y: 0, x: 100, z: 0 }] });
});

test("the shipped table is applied without complaint about its own shape", () => {
  // Not a check that the data is *right* — nothing here can know that. It checks the entries parse,
  // resolve and produce links, which is what would break if the shape drifted.
  const { MANUAL_TRAVEL } = require("../../src/shared/travel/manual-links") as typeof import("../../src/shared/travel/manual-links");
  // Entries name zones the way a person would, so the stand-in graph has to know those names.
  const zones = [...new Set(MANUAL_TRAVEL.links.flatMap((l) => l.places.map((p) => p.zone)))];
  const zoneNames = Object.fromEntries(zones.map((z) => [z.toLowerCase().replace(/[^a-z]/g, ""), z]));
  const { report } = applyManual({ source: { id: "test" }, zoneNames, nodes: [], edges: [] }, MANUAL_TRAVEL);

  assert.equal(report.unknownZones.length, 0);
  assert.deepEqual(report.badBoundaries, [], "every border entry names exactly two zones");
  assert.equal(report.applied.length, MANUAL_TRAVEL.links.length, "every entry contributed something");
  assert.deepEqual(report.unresolvedBlocks, []);
});

/** A border whose label carries a translocator's name, the way the packs write them. */
const gnome = (to: string, who: string, x: number): TravelPoint => ({
  label: `to ${to} (Translocator ${who})`,
  at: { y: 0, x, z: 0 },
  kind: "border",
  to,
});

test("a hand-authored place finds the border its own label was consumed into", () => {
  // Greater Faydark labels `to Ocean of Tears (Translocator Sedina)`, so the builder makes that border
  // and **renames it** `Greater Faydark ↔ Ocean of Tears` — after which nothing mentions Sedina, and a
  // second border the same gnome serves was stated with no position at all, while his coordinate sat
  // on the border beside it. `TravelNode.labels` keeps what the mapmaker actually wrote.
  const before = built({
    gfaydark: [gnome("Ocean of Tears", "Sedina", 215)],
    oot: [border("Greater Faydark", 900)],
    freporte: [],
  });
  assert.ok(
    before.nodes.find((n) => n.id === "gfaydark|oot")?.labels?.some((l) => l.includes("Sedina")),
    "the label the border was read from is kept",
  );

  const { graph } = applyManual(before, {
    links: [
      {
        shape: "boundary",
        via: "translocator",
        places: [{ zone: "Greater Faydark", label: "Sedina" }, { zone: "East Freeport", label: "Setikan" }],
        why: "Sedina ↔ Setikan.",
      },
    ],
  });

  // Sedina's real position, taken from the border his own label made — not a stand-in.
  assert.deepEqual(graph.nodes.find((n) => n.id === "freporte|gfaydark")?.at.gfaydark?.map((a) => a.x), [215]);
  // And listed once. The entry matched the very node it was contributing to, which used to make one
  // spot look like two crossings of the same border.
  assert.deepEqual(graph.nodes.find((n) => n.id === "gfaydark|oot")?.at.gfaydark?.map((a) => a.x), [215]);
});

test("two borders through one gnome are one gnome, so the walk between them is nothing", () => {
  // Setikan runs Greater Faydark ↔ East Freeport *and* East Freeport ↔ Butcherblock: two borders on
  // one pair of feet. Arriving by one is standing where you board the other. Priced as an ordinary
  // walk between two unplaced nodes it came out at UNKNOWN_CROSSING each way, which is how a chain of
  // free rides across Antonica was quoted at thousands of units of walking.
  const before = built({
    gfaydark: [gnome("Ocean of Tears", "Sedina", 215)],
    oot: [border("Greater Faydark", 900)],
    freporte: [],
    butcher: [],
  });
  const { graph, report } = applyManual(before, {
    links: [
      {
        shape: "boundary",
        via: "translocator",
        places: [{ zone: "Greater Faydark", label: "Sedina" }, { zone: "East Freeport", label: "Setikan" }],
        why: "Sedina ↔ Setikan.",
      },
      {
        shape: "boundary",
        via: "translocator",
        places: [{ zone: "East Freeport", label: "Setikan" }, { zone: "Butcherblock Mountains", label: "Fithop" }],
        why: "Setikan ↔ Fithop.",
      },
    ],
  });

  const between = graph.edges.filter(
    (e) =>
      e.zone === "freporte" &&
      e.mode === "walk" &&
      [e.from, e.to].every((id) => id === "freporte|gfaydark" || id === "butcher|freporte"),
  );
  assert.equal(between.length, 2, "both ways");
  assert.deepEqual(between.map((e) => e.cost), [0, 0]);
  // A fact, not a stand-in: it rests on the two borders *being* one place, not on knowing where that
  // place is — so it must not wear the `?` a guessed figure does.
  assert.ok(!between.some((e) => e.assumed));
  assert.equal(report.sameSpot, 2);

  // And the trip is what it really is: a short walk to Sedina, then ride for nothing.
  const route = findRoute(graph, { zone: "gfaydark", at: { y: 0, x: 0, z: 0 } }, "Butcherblock Mountains")!;
  assert.equal(Math.round(route.cost), 215);
});

test("the curated exclusions are real files, stated once, and never a place you can go", () => {
  // A worklist turned into a judgement, so the guard is that it stays a judgement: an entry that names
  // nothing is a typo nobody would notice, and a duplicate is a list somebody edited twice.
  assert.deepEqual([...new Set(NOT_IN_GAME)], [...NOT_IN_GAME], "an entry is listed twice");
  for (const zone of NOT_IN_GAME) assert.match(zone, /^[a-z0-9]+$/, `${zone} isn't a map file name`);
  // The four the query returns that are **real places** must never end up here — losing a real zone is
  // far worse than offering an unreachable one, which is the whole reason this is curated.
  for (const real of ["hateplane", "veeshan", "charasis", "endlesscaverns"]) {
    assert.ok(!NOT_IN_GAME.includes(real), `${real} is a real zone`);
  }
  // And the case that prompted it: ten instances of Mistmoore's Catacombs, each of which drew a border
  // into Lesser Faydark.
  assert.equal(NOT_IN_GAME.filter((z) => z.startsWith("mmc")).length, 10);
});

test("a stale drawing names two files that could both be here, and never itself", () => {
  for (const [dropped, kept] of Object.entries(STALE_DRAWINGS)) {
    assert.notEqual(dropped, kept, `${dropped} supersedes itself`);
    assert.ok(!(kept in STALE_DRAWINGS), `${kept} is both kept and dropped`);
  }
});
