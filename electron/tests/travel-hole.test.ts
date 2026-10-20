/**
 * The Hole — the zone that showed a border can be several places, and that some crossings only go one
 * way. Built from Brewall's own labels, verbatim, at their own coordinates.
 *
 * What was wrong: The Hole's zone line to Paineel (at the top) and its portal to Paineel (at the
 * bottom) were one node, and so were the portals to Neriak and Erudin Palace and those zones' `from The
 * Hole` landings. Standing at a node is standing at all of its positions, so Paineel → Neriak Third Gate
 * came out at 25 units — through a level 40–55 dungeon — and Neriak → Paineel went back up a portal that
 * only comes down.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTravelGraph } from "../../src/shared/travel/build";
import { harvestZone, travelPoint } from "../../src/shared/travel/harvest";
import { applyManual } from "../../src/shared/travel/manual";
import { MANUAL_TRAVEL } from "../../src/shared/travel/manual-links";
import { findRoute } from "../../src/shared/travel/route";
import type { MapPoi } from "../../src/shared/map/eqmap";

/** A label as the map file has it, in the graph's `/loc` frame (the file stores `-x, -y`). */
const poi = (label: string, fileX: number, fileY: number, z: number): MapPoi => ({
  label: label.replace(/_/g, " "),
  x: -fileX,
  y: -fileY,
  z,
  size: 3,
});

const MAPS: Record<string, MapPoi[]> = {
  hole: [
    poi("to_Erudin_Palace_(portal)", -329.7535, -46.9167, -385.8416),
    poi("to_Paineel", 940.193, -611.4799, -94.8749),
    poi("to_Neriak_-_Third_Gate_(portal)", -346.9917, -63.6779, -385.8416),
    poi("to_Paineel_(portal)", -365.6127, -47.1272, -385.8416),
    poi("Succor", 1050, -640, 0),
  ],
  paineel: [
    poi("to_The_Ruins_of_Old_Paineel", 942.0237, -605.75, -97.3425),
    poi("to_The_Ruins_of_Old_Paineel_(fall_down)", -233.4521, -775.1282, 0.368),
  ],
  neriakc: [poi("from_The_Hole_(portal)", 811, -512, -27.9969)],
  erudnint: [poi("to_Erudin", -806.9344, -712.0956, 0.626), poi("from_The_Hole", -885, -630, -32.997)],
  erudnext: [poi("to_Erudin_Palace", 183.3911, 644.8334, 69.3446)],
};

const NAMES = {
  hole: "The Ruins of Old Paineel",
  paineel: "Paineel",
  neriakc: "Neriak Third Gate",
  erudnint: "Erudin Palace",
  erudnext: "Erudin",
};

const build = (wiki: { zone: string; to: string }[] = []) => {
  const harvests = Object.entries(MAPS).map(([zone, pois]) => harvestZone(zone, pois));
  const { graph, report } = buildTravelGraph({ id: "brewall" }, harvests, NAMES, [], wiki);
  return { graph: applyManual(graph, MANUAL_TRAVEL).graph, report };
};

const node = (graph: ReturnType<typeof build>["graph"], id: string) => graph.nodes.find((n) => n.id === id);
const ids = (route: ReturnType<typeof findRoute>) => route?.steps.map((s) => s.node.id) ?? [];

test("a label says which way it goes: a portal and a fall out, a `from` in, a zone line both", () => {
  const way = (label: string) => travelPoint({ label, x: 0, y: 0, z: 0, size: 3 })?.way;
  assert.equal(way("to Paineel (portal)"), "out");
  assert.equal(way("to The Ruins of Old Paineel (fall down)"), "out");
  assert.equal(way("to The Ruins of Old Paineel (Hole - jump)"), "out");
  assert.equal(way("to Deepshade (one-way)"), "out");
  assert.equal(way("to Nagafen`s Lair (5) One-Way"), "out");
  assert.equal(way("from The Hole"), "in");
  assert.equal(way("to Paineel"), undefined);
  // The words that make a fall live inside zone names too, which is why they only count in brackets.
  assert.equal(way("to Befallen"), undefined);
  assert.equal(way("to Stoneroot Falls"), undefined);
  assert.equal(travelPoint({ label: "to Paineel (portal)", x: 0, y: 0, z: 0, size: 3 })?.crossing, "portal");
});

test("a one-way crossing is its own node, apart from the border between the same two zones", () => {
  const { graph } = build();
  const top = node(graph, "hole|paineel")!;
  assert.deepEqual(top.at.hole, [{ x: -940.193, y: 611.4799, z: -94.8749 }], "the zone line alone — not the portal");
  assert.equal(top.into, undefined);

  const portal = node(graph, "hole>paineel")!;
  assert.equal(portal.into, "paineel");
  assert.equal(portal.via, "portal");
  assert.equal(portal.label, "The Ruins of Old Paineel → Paineel");

  // The landings the far side labels join the portal that lands there.
  assert.deepEqual(Object.keys(node(graph, "hole>neriakc")!.at).sort(), ["hole", "neriakc"]);
  assert.deepEqual(Object.keys(node(graph, "hole>erudnint")!.at).sort(), ["erudnint", "hole"]);
  assert.equal(node(graph, "erudnint|hole"), undefined, "Erudin Palace's `from The Hole` is no border");

  // The fall lands somewhere nobody labelled, so it has no position in The Hole.
  assert.deepEqual(Object.keys(node(graph, "paineel>hole")!.at), ["paineel"]);
});

test("Paineel to Neriak is the walk down The Hole, not a step through its zone line", () => {
  const route = findRoute(build().graph, "Paineel", "Neriak Third Gate");
  assert.deepEqual(ids(route), [" start", "hole|paineel", "hole>neriakc", " goal"]);
  // From the zone line at the top to the portal room at the bottom: ~1,430 units, where it was 25.
  assert.ok(route!.cost > 1400, `cost ${route!.cost}`);
});

test("nothing goes back up a portal: Neriak and Erudin Palace don't reach Paineel through The Hole", () => {
  const { graph } = build();
  assert.equal(findRoute(graph, "Neriak Third Gate", "Paineel"), undefined);
  assert.equal(findRoute(graph, "Erudin Palace", "Paineel"), undefined);
  assert.equal(findRoute(graph, "Neriak Third Gate", "The Ruins of Old Paineel"), undefined);
});

test("from the portal room, the portal to Paineel is the way out", () => {
  const route = findRoute(build().graph, { zone: "hole", at: { x: 350, y: 50, z: -385 } }, "Paineel");
  assert.deepEqual(ids(route), [" start", "hole>paineel", " goal"]);
  assert.ok(route!.cost < 50);
});

test("the fall lands at the bottom of the pit, and nothing walks back up from there", () => {
  const { graph } = build();
  const fromFall = graph.edges.filter((e) => e.from === "paineel>hole" && e.mode === "walk").map((e) => e.to).sort();
  // Down to the portals, yes; up to the zone line or the succor point beside it, no.
  assert.deepEqual(fromFall, ["hole>erudnint", "hole>neriakc", "hole>paineel"]);
  assert.ok(graph.edges.some((e) => e.from === "hole|paineel" && e.to === "paineel>hole"), "the walk down is kept");
  // And nobody walks *to* the top of a fall in The Hole — that would be climbing it.
  assert.ok(!graph.edges.some((e) => e.to === "paineel>hole" && e.zone === "hole" && e.from === "hole#succor"));
});

test("the wiki's adjacency doesn't hand back the way up a portal", () => {
  // eqlwiki lists Neriak Third Gate as next to The Hole — true, by the portal. Read as a border, it
  // would be a two-way crossing nobody can take upwards.
  const { graph, report } = build([{ zone: "The Ruins of Old Paineel", to: "Neriak Third Gate" }]);
  assert.equal(report.claimed.already, 1);
  assert.equal(node(graph, "hole|neriakc"), undefined);
});

test("a `from X` beside a `to X` stays the landing of an ordinary border", () => {
  // Chardok labels both `to The Burning Woods` and `from The Burning Woods`, and the Woods labels
  // `to Chardok`: one two-way zone line, landing somewhere other than where you leave.
  const harvests = [
    harvestZone("chardok", [poi("to_The_Burning_Woods", 0, 0, 0), poi("from_The_Burning_Woods", 100, 0, 0)]),
    harvestZone("burningwood", [poi("to_Chardok", 500, 0, 0)]),
  ];
  const { graph } = buildTravelGraph({ id: "brewall" }, harvests, { chardok: "Chardok", burningwood: "The Burning Woods" });
  assert.deepEqual(graph.nodes.map((n) => n.id), ["burningwood|chardok"]);
  assert.equal(graph.nodes[0].at.chardok.length, 2);
  assert.ok(findRoute(graph, "Chardok", "The Burning Woods"));
  assert.ok(findRoute(graph, "The Burning Woods", "Chardok"));
});
