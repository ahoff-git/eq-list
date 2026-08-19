/**
 * The graph from one zone's point of view — what a map can draw of it, and what it can't.
 *
 * Three things have to be right or the drawing lies about the data it exists to check:
 *
 *  - **a border is a node with several positions**, because a zone can offer three ways into its
 *    neighbour and they are one border, not three;
 *  - **a border with no position here is the finding**, not an omission — it's the one that can't be
 *    drawn and the one an audit is looking for;
 *  - **a network is counted, not listed**, since a druid reaches every ring from anywhere and drawing
 *    that faithfully is eighteen lines off the edge of the map.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { zoneSuccors, zoneWalks } from "../../src/shared/travel/build";
import { surveyZone } from "../../src/shared/travel/survey";
import type { TravelEdge, TravelGraph, TravelNode } from "../../src/shared/travel/types";

const at = (x: number) => ({ y: 0, x, z: 0 });

function graph(nodes: TravelNode[], extra: TravelEdge[] = [], zoneNames: Record<string, string> = {}): TravelGraph {
  const zones = new Map<string, TravelNode[]>();
  for (const node of nodes) for (const zone of node.zones) zones.set(zone, [...(zones.get(zone) ?? []), node]);
  const edges = [
    ...[...zones].flatMap(([zone, inZone]) => [...zoneWalks(inZone, zone), ...zoneSuccors(inZone, zone)]),
    ...extra,
  ];
  return { source: { id: "test" }, zoneNames, nodes, edges };
}

const NAMES = { gfaydark: "Greater Faydark", lfaydark: "Lesser Faydark", butcher: "Butcherblock Mountains" };

/** Two zones, one border crossed in three places, a ring here and a ring elsewhere. */
function faydark(): TravelGraph {
  const nodes: TravelNode[] = [
    {
      id: "gfaydark|lfaydark",
      kind: "boundary",
      label: "Greater Faydark ↔ Lesser Faydark",
      zones: ["gfaydark", "lfaydark"],
      // Three ways out of Greater Faydark, and Lesser Faydark's mapmaker labelled none of them.
      at: { gfaydark: [at(100), at(200), at(300)] },
    },
    {
      id: "butcher|gfaydark",
      kind: "boundary",
      label: "Butcherblock Mountains ↔ Greater Faydark",
      zones: ["butcher", "gfaydark"],
      at: { gfaydark: [at(900)], butcher: [at(0)] },
    },
    { id: "gfaydark#ring", kind: "place", label: "Druid Ring", zones: ["gfaydark"], at: { gfaydark: [at(500)] } },
    { id: "butcher#ring", kind: "place", label: "Druid Rings", zones: ["butcher"], at: { butcher: [at(50)] } },
    { id: "net:druid", kind: "hub", label: "druid network", zones: [], at: {} },
  ];
  const ports: TravelEdge[] = [
    { from: "net:druid", to: "gfaydark#ring", mode: "druid", cost: 0 },
    { from: "net:druid", to: "butcher#ring", mode: "druid", cost: 0 },
  ];
  return graph(nodes, ports, NAMES);
}

test("a zone's survey is every node the graph puts in it, at its position there", () => {
  const survey = surveyZone(faydark(), "gfaydark");

  assert.equal(survey.zone.name, "Greater Faydark");
  assert.deepEqual(
    survey.nodes.map((n) => n.id),
    ["gfaydark|lfaydark", "butcher|gfaydark", "gfaydark#ring"],
    "the hub is in no zone, so it is in no zone's survey",
  );

  // **One border, three crossings.** Collapsing them to a point would put the border somewhere none
  // of them is; drawing three markers is drawing what the mapmaker drew.
  const [lesser] = survey.nodes;
  assert.deepEqual(lesser.at.map((a) => a.x), [100, 200, 300]);
  // Named by where it takes you, which is what a marker on this map should say.
  assert.equal(lesser.beyond?.name, "Lesser Faydark");
  // A place has no far side and its own label is the name.
  assert.equal(survey.nodes[2].beyond, undefined);
  assert.equal(survey.nodes[2].label, "Druid Ring");
});

test("a border with no position here is the finding, not an omission", () => {
  // From Lesser Faydark's side the border is real and unplaced: the graph says it's here, prices every
  // walk to it with a stand-in, and has nothing to draw. Leaving it out would read as "no such
  // border", which is the opposite of the truth and exactly what an audit is hunting.
  const survey = surveyZone(faydark(), "lfaydark");
  assert.deepEqual(survey.nodes.map((n) => [n.id, n.at.length]), [["gfaydark|lfaydark", 0]]);
  assert.equal(survey.unplaced, 1);
  assert.equal(surveyZone(faydark(), "gfaydark").unplaced, 0);
});

test("a network is counted rather than listed, and says which of it is here", () => {
  const survey = surveyZone(faydark(), "gfaydark", { druid: true });
  assert.equal(survey.networks.length, 1);
  const [druid] = survey.networks;
  assert.equal(druid.label, "Druid Rings");
  assert.equal(druid.allowed, true);
  // Every destination in the world, so the chip can open — and which of them is on this map, so a
  // marker and the group can be told they are the same thing.
  assert.deepEqual(druid.destinations.map((d) => d.zone.name), ["Butcherblock Mountains", "Greater Faydark"]);
  assert.deepEqual(druid.here, ["gfaydark#ring"]);
});

test("a network you have switched off is dimmed, never dropped", () => {
  // An audit is about what the graph holds, not about what you can currently use — and a group that
  // vanished when you unticked a box would read as a graph that had lost it.
  const off = surveyZone(faydark(), "gfaydark").networks;
  assert.deepEqual(off.map((n) => [n.mode, n.allowed]), [["druid", false]]);
  assert.equal(off[0].destinations.length, 2, "and it still knows the whole network");
});

test("a zone the graph has nothing in surveys as empty rather than throwing", () => {
  const survey = surveyZone(faydark(), "nowhere");
  assert.deepEqual(survey.nodes, []);
  assert.equal(survey.unplaced, 0);
  assert.equal(survey.networks[0].here.length, 0, "the networks are still reachable from it");
});
