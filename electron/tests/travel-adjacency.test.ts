/**
 * The wiki's Adjacent Zones, and what the graph is allowed to do with it.
 *
 * Three things have to hold or the second source makes the graph worse rather than wider:
 *
 *  - **it only ever adds** — a border a mapmaker drew keeps its coordinates, because the wiki cannot
 *    say where a crossing is and the mapmaker can;
 *  - **what it adds has no position**, so a route through it is a stand-in wearing a `?` rather than a
 *    number that looks measured;
 *  - **a zone the server hasn't opened is still refused**, since the wiki describes EverQuest and this
 *    graph describes what is reachable today.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTravelGraph } from "../../src/shared/travel/build";
import { statedAdjacencies } from "../../src/shared/zones/adjacency";
import { WIKI_ADJACENT } from "../../src/shared/zones/adjacency.generated";
import type { TravelPoint, ZoneHarvest } from "../../src/shared/travel/harvest";

const border = (to: string, x = 0): TravelPoint => ({ label: `to ${to}`, at: { y: 0, x, z: 0 }, kind: "border", to });
const zone = (name: string, points: TravelPoint[] = []): ZoneHarvest => ({ zone: name, points, dropped: [], board: [] });

const NAMES = {
  misty: "Misty Thicket",
  rivervale: "Rivervale",
  runnyeye: "RunnyEye Citadel",
  freporte: "East Freeport",
  oot: "Ocean of Tears",
  burningwood: "The Burning Wood",
};

test("adjacency is symmetric, so each stated pair is offered once", () => {
  // The wiki writes it twice — Misty Thicket lists Rivervale and Rivervale lists Misty Thicket — so a
  // consumer reading the table raw does the same work twice and reports twice the additions it made.
  const pairs = statedAdjacencies({ A: ["B", "C"], B: ["A"], C: ["A", "C"] });
  assert.deepEqual(pairs, [
    { zone: "A", to: "B" },
    { zone: "A", to: "C" },
  ]);
});

test("the wiki adds a border no map established, with no position and marked as a claim", () => {
  const { graph, report } = buildTravelGraph(
    { id: "brewall" },
    [zone("freporte", [border("Ocean of Tears", 100)]), zone("oot")],
    NAMES,
    [],
    [{ zone: "Misty Thicket", to: "Rivervale" }],
  );
  // Neither zone drew a way to the other, and now the border exists — with nothing to draw.
  const added = graph.nodes.find((n) => n.id === "misty|rivervale");
  assert.equal(added?.claimed, true);
  assert.deepEqual(added?.at, {});
  assert.deepEqual(report.claimed.added, ["misty|rivervale"]);
});

test("a border a map drew is never overridden — the wiki only counts it", () => {
  // Precedence, and the whole of it: an exact map label beats the wiki. A person standing in the zone
  // wrote that coordinate down, and it is the only source that can say where the crossing is.
  const { graph, report } = buildTravelGraph(
    { id: "brewall" },
    [zone("freporte", [border("Ocean of Tears", 100)]), zone("oot", [border("East Freeport", 900)])],
    NAMES,
    [],
    [{ zone: "East Freeport", to: "Ocean of Tears" }],
  );
  const border0 = graph.nodes.find((n) => n.id === "freporte|oot");
  assert.deepEqual(border0?.at.freporte?.map((a) => a.x), [100], "the map's coordinate, untouched");
  assert.equal(border0?.claimed, undefined, "and it is not a claim — a mapmaker drew it");
  assert.deepEqual(report.claimed.added, []);
  assert.equal(report.claimed.already, 1);
});

test("the wiki cannot reopen a zone the server hasn't got, or name one this pack lacks", () => {
  const { graph, report } = buildTravelGraph(
    { id: "brewall" },
    [zone("misty", [border("Rivervale", 0)]), zone("rivervale", [border("Misty Thicket", 0)]), zone("burningwood")],
    NAMES,
    ["The Burning Wood"],
    [
      { zone: "Misty Thicket", to: "The Burning Wood" },
      { zone: "Misty Thicket", to: "Plane of Mischief" },
    ],
  );
  assert.equal(graph.nodes.filter((n) => n.claimed).length, 0);
  assert.deepEqual(report.claimed.absent.map((p) => p.to), ["The Burning Wood"]);
  assert.deepEqual(report.claimed.unknown.map((p) => p.to), ["Plane of Mischief"]);
});

test("the shipped table is well formed, and says nothing about a zone twice", () => {
  // It is generated, so this guards the generator rather than the data: a row that named itself, or a
  // name with the wiki's markup left in, would quietly become a border nobody meant.
  for (const [zoneName, others] of Object.entries(WIKI_ADJACENT)) {
    assert.ok(zoneName.trim(), "a zone with no name");
    assert.ok(!others.includes(zoneName), `${zoneName} lists itself`);
    assert.deepEqual([...new Set(others)], [...others], `${zoneName} lists a neighbour twice`);
    for (const other of others) assert.ok(!/[[\]|{}]/.test(other), `markup left in ${JSON.stringify(other)}`);
  }
  assert.ok(statedAdjacencies().length > 100, "and the table is actually populated");
});
