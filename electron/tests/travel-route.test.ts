/**
 * Routing across the graph. Four things this has to get right:
 *
 *  - **a boundary node is the crossing** — zoning costs nothing and shows up as no leg, and the walk
 *    that follows is measured in the *next* zone's coordinates;
 *  - **a conveyance you haven't got isn't used** — druid and wizard ports are off unless asked for;
 *  - **an unplaced border prices its walks as guesses**, and the route says so rather than reporting a
 *    number that looks measured;
 *  - **no route is a real answer**, not an exception.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { zoneWalks } from "../../src/shared/travel/build";
import { answerRoute, findRoute, travelZone, zoneName, type TravelRoute } from "../../src/shared/travel/route";
import { UNKNOWN_CROSSING, type TravelEdge, type TravelGraph, type TravelNode } from "../../src/shared/travel/types";

const at = (x: number) => [{ y: 0, x, z: 0 }];

/** The files a route passed through. Its `zones` carry the friendly name too — asserted separately. */
const files = (route: TravelRoute | undefined) => route?.zones.map((z) => z.zone);

/** A border between two zones, with its position in each. */
function boundary(a: string, ax: number, b: string, bx?: number): TravelNode {
  const [first, second] = [a, b].sort();
  return {
    id: `${first}|${second}`,
    kind: "boundary",
    label: `${a} ↔ ${b}`,
    zones: [first, second],
    at: { [a]: at(ax), ...(bx === undefined ? {} : { [b]: at(bx) }) },
  };
}

function place(zone: string, x: number, label: string): TravelNode {
  return { id: `${zone}#${label.toLowerCase()}`, kind: "place", label, zones: [zone], at: { [zone]: at(x) } };
}

/**
 * A graph with its walks materialised, the way a real build leaves them — the router reads stored
 * edges, so a fixture without them is a fixture of a different program.
 */
function graph(nodes: TravelNode[], extra: TravelEdge[] = [], zoneNames: Record<string, string> = {}): TravelGraph {
  const zones = new Map<string, TravelNode[]>();
  for (const node of nodes) {
    for (const zone of node.zones) zones.set(zone, [...(zones.get(zone) ?? []), node]);
  }
  const edges = [...[...zones].flatMap(([zone, inZone]) => zoneWalks(inZone, zone)), ...extra];
  return { source: { id: "test" }, zoneNames, nodes, edges };
}

/**
 * Four zones in a chain, each border 1000 apart along x in the zone between them, plus druid rings in
 * `a` and `d` — so the same trip can be walked or ported.
 */
function chain(): TravelGraph {
  const nodes = [
    boundary("a", 1000, "b", 0),
    boundary("b", 1000, "c", 0),
    boundary("c", 1000, "d", 0),
    place("a", 0, "Ring"),
    place("d", 900, "Ring"),
    { id: "net:druid", kind: "hub" as const, label: "druid network", zones: [], at: {} },
  ];
  const ports: TravelEdge[] = [
    // One way out of the hub only — a port is cast from where you stand, so a ring is an arrival.
    { from: "net:druid", to: "a#ring", mode: "druid", cost: 0 },
    { from: "net:druid", to: "d#ring", mode: "druid", cost: 0 },
  ];
  return graph(nodes, ports, { a: "Alpha", b: "Beta", c: "Gamma", d: "Delta" });
}

test("zoning is free and costs no leg — the walk after it is measured in the next zone", () => {
  const g = graph([boundary("a", 100, "b", 5000), place("b", 5400, "Camp")], [], { a: "Alpha", b: "Beta" });

  const route = findRoute(g, { zone: "a", at: { y: 0, x: 0, z: 0 } }, { zone: "b", at: { y: 0, x: 5400, z: 0 } });
  assert.ok(route);
  // 100 to the border in a's frame, then 400 from it in b's — the two frames never mix, and crossing
  // between them is not a step.
  assert.equal(route.cost, 500);
  assert.equal(route.assumed, false);
  assert.deepEqual(route.steps.map((s) => s.node.id), [" start", "a|b", " goal"]);
  assert.deepEqual(route.steps.map((s) => s.from?.across?.zone), [undefined, "a", "b"]);
  assert.deepEqual(files(route), ["a", "b"]);
});

test("the nearest of a border's several crossings is the one used", () => {
  const node = boundary("a", 100, "b", 0);
  node.at.a = [...at(100), ...at(900)];
  const g = graph([node, place("a", 1000, "Camp")], [], { a: "Alpha", b: "Beta" });

  // From the camp at 1000, the far crossing at 900 is the near one.
  const route = findRoute(g, { zone: "a", at: { y: 0, x: 1000, z: 0 } }, "b");
  assert.equal(route?.cost, 100);
});

test("with no position to start from there is nothing to charge, and the route admits it", () => {
  const g = graph([boundary("a", 500, "b", 0)], [], { a: "Alpha", b: "Beta" });
  const route = findRoute(g, "a", "b");
  assert.ok(route);
  assert.equal(route.cost, 0);
  assert.equal(route.assumed, true, "free is a stand-in, not a measurement");
});

test("walking several zones adds up, and each leg names the zone it crossed", () => {
  const route = findRoute(chain(), { zone: "a", at: { y: 0, x: 0, z: 0 } }, { zone: "d", at: { y: 0, x: 1000, z: 0 } });
  assert.ok(route);
  // 1000 to a's border, 1000 across b, 1000 across c, then 1000 from d's border to the destination.
  assert.equal(route.cost, 4000);
  assert.equal(route.assumed, false, "both ends were given a position, so every leg is measured");
  assert.deepEqual(files(route), ["a", "b", "c", "d"]);
  assert.deepEqual(route.modes, [], "walked the whole way");
});

test("a druid port is not used unless it's asked for", () => {
  const from = { zone: "a", at: { y: 0, x: 0, z: 0 } };
  const to = { zone: "d", at: { y: 0, x: 1000, z: 0 } };

  assert.equal(findRoute(chain(), from, to)?.cost, 4000);

  const ported = findRoute(chain(), from, to, { druid: true });
  assert.ok(ported);
  // Cast where you stand, arrive at d's ring, walk the last 100. **Nothing is charged for getting to a
  // ring to leave** — that's the whole difference from a boat, which you have to go and board.
  assert.equal(ported.cost, 100);
  assert.deepEqual(ported.modes, ["druid"]);
  assert.deepEqual(ported.steps.map((s) => s.node.id).slice(1, -1), ["net:druid", "d#ring"]);
  assert.deepEqual(files(ported), ["a", "d"], "the hub is in no zone, so it isn't one of them");
});

test("a port can be cast from a zone that has no ring of its own", () => {
  // The thing the walk-to-the-ring model got wrong: a druid standing in b — which has no ring anywhere
  // in it — can still port to d's. Every ring is a destination *from anywhere*.
  const inB = { zone: "b", at: { y: 0, x: 500, z: 0 } };
  const to = { zone: "d", at: { y: 0, x: 1000, z: 0 } };

  const walked = findRoute(chain(), inB, to);
  assert.ok(walked);
  assert.deepEqual(walked.modes, [], "with no port allowed it's a walk out through the borders");

  const ported = findRoute(chain(), inB, to, { druid: true });
  assert.ok(ported);
  assert.equal(ported.cost, 100, "the port is free; only the walk from d's ring is charged");
  assert.deepEqual(ported.steps.map((s) => s.node.id).slice(1, -1), ["net:druid", "d#ring"]);
  assert.ok(ported.cost < walked.cost, "and it's the route worth taking");
});

test("a zone you only pass through by conveyance is still a zone you went through", () => {
  // Nothing is *walked* in the middle zone, so the walks alone would leave it out of the summary —
  // and "Ak'Anon then Steamfont" is not where that translocator goes.
  const g = graph(
    [place("a", 0, "Translocator"), place("mid", 0, "Translocator"), place("z", 0, "Translocator")],
    [
      { from: "a#translocator", to: "mid#translocator", mode: "gnome", cost: 0 },
      { from: "mid#translocator", to: "a#translocator", mode: "gnome", cost: 0 },
      { from: "mid#translocator", to: "z#translocator", mode: "gnome", cost: 0 },
      { from: "z#translocator", to: "mid#translocator", mode: "gnome", cost: 0 },
    ],
  );
  assert.deepEqual(files(findRoute(g, "a", "z")), ["a", "mid", "z"]);
});

test("a boat needs no toggle, because by the time it is in the graph it is a border", () => {
  // The same chain as above, stated as borders instead — which is what `manual-links.ts` produces for
  // a ferry. Every option is off and the route still works, because nothing here is a conveyance.
  const g = graph([boundary("freporte", 0, "oot", 0), boundary("oot", 400, "butcher", 0)]);
  const route = findRoute(g, "freporte", "butcher", { druid: false, wizard: false, gnome: false });
  assert.ok(route);
  assert.deepEqual(route.modes, []);
  assert.deepEqual(files(route), ["freporte", "oot", "butcher"]);
  // And the walk across the island between the two docks is charged, which a free boat edge never was.
  assert.equal(route.cost, 400);
});

test("a wizard toggle doesn't open the druid network", () => {
  const route = findRoute(chain(), { zone: "a", at: { y: 0, x: 0, z: 0 } }, { zone: "d", at: { y: 0, x: 1000, z: 0 } }, { wizard: true });
  assert.equal(route?.cost, 4000);
});

test("a gnome is public transport, so it's on unless switched off", () => {
  const g = graph([place("a", 0, "Translocator"), place("z", 0, "Translocator")], [
    { from: "a#translocator", to: "z#translocator", mode: "gnome", cost: 0 },
    { from: "z#translocator", to: "a#translocator", mode: "gnome", cost: 0 },
  ]);
  assert.deepEqual(findRoute(g, "a", "z")?.modes, ["gnome"]);
  assert.equal(findRoute(g, "a", "z", { gnome: false }), undefined);
});

test("a walk from a border nobody labelled on this side is priced as a guess, and flagged", () => {
  // `a|b` has no position in b, so crossing b to reach `b|c` is a stand-in.
  const g = graph([boundary("a", 0, "b"), boundary("b", 500, "c", 0)], [], { a: "Alpha", b: "Beta", c: "Gamma" });

  const route = findRoute(g, { zone: "a", at: { y: 0, x: 0, z: 0 } }, "c");
  assert.ok(route);
  assert.equal(route.cost, UNKNOWN_CROSSING);
  assert.equal(route.assumed, true);
});

test("already there: one zone is a straight line, not a trip out through a border", () => {
  const route = findRoute(chain(), { zone: "a", at: { y: 0, x: 0, z: 0 } }, { zone: "a", at: { y: 0, x: 300, z: 0 } });
  assert.ok(route);
  assert.equal(route.cost, 300);
  assert.deepEqual(files(route), ["a"]);
  assert.equal(route.steps.length, 2);
});

test("nowhere to go is an answer, not a throw", () => {
  const g = graph([place("a", 0, "Camp"), place("z", 0, "Camp")]);
  assert.equal(findRoute(g, "a", "z"), undefined);
  assert.equal(findRoute(g, "a", "nowhere"), undefined, "an unknown zone can't be routed to");
});

test("every zone a route mentions carries the name a person reads, not the file name", () => {
  // The whole point: a consumer printing a route should never have to remember to look a name up, and
  // should never be able to show `felwithea` by accident.
  const g = graph([boundary("felwithea", 0, "gfaydark", 500)], [], {
    felwithea: "Northern Felwithe",
    gfaydark: "Greater Faydark",
  });

  const route = findRoute(g, "felwithea", "Greater Faydark")!;
  assert.deepEqual(route.zones, [
    { zone: "felwithea", name: "Northern Felwithe" },
    { zone: "gfaydark", name: "Greater Faydark" },
  ]);
  // The legs too, and the virtual ends' labels — every place a zone surfaces.
  assert.deepEqual(route.steps.map((s) => s.from?.across?.name), [undefined, "Northern Felwithe", "Greater Faydark"]);
  assert.equal(route.steps[0].node.label, "Northern Felwithe");
  assert.equal(route.steps.at(-1)!.node.label, "Greater Faydark");
});

test("a zone the graph never named shows a tidied file name, not a bare one", () => {
  // `zonesFromFiles` already falls back to `prettyZoneName`, so this is the backstop for a zone that
  // isn't in `zoneNames` at all — "Gukbottom" beats "gukbottom", and both beat nothing.
  const g = graph([boundary("gukbottom", 0, "gukmid", 100)]);
  assert.equal(zoneName(g, "gukbottom"), "Gukbottom");
  assert.deepEqual(findRoute(g, "gukbottom", "gukmid")?.zones.map((z) => z.name), ["Gukbottom", "Gukmid"]);
});

test("a zone with a map file resolves by file name too, even with no nodes in it", () => {
  // There were three resolvers and they disagreed about this: the router wanted a *node* in the zone,
  // while the manual pass accepted any zone with a map file. So an isolated zone could be routed to by
  // its long name and not by its file name, and an excluded zone asked for by file said "no such zone".
  const g = {
    ...graph([boundary("a", 0, "b", 0)], [], { a: "Alpha", b: "Beta", lonely: "Lonely Vale", pok: "The Plane of Knowledge" }),
    absent: ["pok"],
  };

  // `lonely` has a map file and no travel nodes at all. Both spellings agree, and both say the same
  // thing about why you can't get there.
  assert.equal(travelZone(g, "Lonely Vale"), "lonely");
  assert.equal(travelZone(g, "lonely"), "lonely", "its file name is a name too");
  assert.equal(answerRoute(g, "Alpha", "Lonely Vale").refused, "unreachable");
  assert.equal(answerRoute(g, "Alpha", "lonely").refused, "unreachable");

  // And an excluded zone is "not in the game" whichever way it's asked for — it used to be
  // "unknown-to" by file, because its nodes were gone.
  assert.equal(answerRoute(g, "Alpha", "The Plane of Knowledge").refused, "absent");
  assert.equal(answerRoute(g, "Alpha", "pok").refused, "absent");

  // A zone with neither a file nor a node is still unknown, which is the answer that must survive.
  assert.equal(travelZone(g, "Atlantis"), undefined);
});

test("a zone is found by its long name or by its map file, folded like every other zone name", () => {
  const g = chain();
  assert.equal(travelZone(g, "Alpha"), "a");
  assert.equal(travelZone(g, "alpha"), "a");
  assert.equal(travelZone(g, "d"), "d", "an unnamed zone is known by its file");
  assert.equal(travelZone(g, "Atlantis"), undefined);
  // The same trip, asked for both ways.
  assert.deepEqual(files(findRoute(g, "Alpha", "Delta")), files(findRoute(g, "a", "d")));
});

test("a refusal says which of the four things went wrong, and how much was looked at", () => {
  // "No route" covers four situations that want four different sentences, so the UI is told which.
  const empty = { source: { id: "test" }, zoneNames: {}, nodes: [], edges: [] };
  assert.equal(answerRoute(empty, "a", "b").refused, "no-graph");

  const g = chain();
  assert.equal(answerRoute(g, "Atlantis", "Delta").refused, "unknown-from");
  assert.equal(answerRoute(g, "Alpha", "Atlantis").refused, "unknown-to");

  // Both zones real, nothing joining them: an island in the graph.
  const split = graph([boundary("a", 0, "b", 0), boundary("y", 0, "z", 0)]);
  assert.equal(answerRoute(split, "a", "z").refused, "unreachable");

  // And a port switched off is the same shape of answer, not a special case.
  const ported = answerRoute(chain(), "a", "d", { druid: false });
  assert.ok(ported.route, "walkable either way in this fixture");
  assert.equal(answerRoute(chain(), "a", "d", { druid: true }).route?.modes[0], "druid");
});

test("a zone that isn't in the game gets its own refusal, not \"unreachable\"", () => {
  // The maps draw it and the server hasn't opened it. Saying "no way through" would send a person
  // looking for a route that cannot exist; saying which zone, and that it isn't there, ends the search.
  const g = { ...graph([boundary("a", 0, "b", 0)], [], { a: "Alpha", b: "Beta", pok: "The Plane of Knowledge" }), absent: ["pok"] };

  const answer = answerRoute(g, "Alpha", "The Plane of Knowledge");
  assert.equal(answer.refused, "absent");
  assert.equal(answer.absent, "The Plane of Knowledge", "named as a person reads it");
  // Either end, since a hand-picked origin can name one too.
  assert.equal(answerRoute(g, "The Plane of Knowledge", "Alpha").refused, "absent");
  // And a zone that's merely unreachable still says so.
  assert.equal(answerRoute(graph([boundary("a", 0, "b", 0), boundary("y", 0, "z", 0)]), "a", "z").refused, "unreachable");
});

test("an answer carries what the graph knows, so \"no route\" is believable", () => {
  const answer = answerRoute(chain(), "a", "d");
  assert.deepEqual(answer.knows, { zones: 4, borders: 3 });
  assert.ok(answer.route);
  assert.equal(answer.refused, undefined);
});
