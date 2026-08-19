/**
 * Routing across the graph. Four things this has to get right:
 *
 *  - **a boundary node is the crossing** — zoning costs nothing and shows up as no leg, and the walk
 *    that follows is measured in the *next* zone's coordinates;
 *  - **a conveyance you haven't got isn't used** — druid and wizard ports are off unless asked for;
 *  - **a place you've ruled out isn't used either, and costs you only itself** — `avoid` takes one ring
 *    out without taking the druid network with it (ADR 0109);
 *  - **an unplaced border prices its walks as guesses**, and the route says so rather than reporting a
 *    number that looks measured;
 *  - **no route is a real answer**, not an exception.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { zoneSuccors, zoneWalks } from "../../src/shared/travel/build";
import {
  answerRoute,
  findRoute,
  isRouteEnd,
  routeInstructions,
  travelZone,
  zoneName,
  type TravelRoute,
} from "../../src/shared/travel/route";
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

/** A zone's safe point — a place that says how you got to it, since walking isn't the way. */
function succor(zone: string, x: number): TravelNode {
  return { ...place(zone, x, "Succor"), via: "succor" };
}

/**
 * A graph with its within-zone edges materialised, the way a real build leaves them — the router reads
 * stored edges, so a fixture without them is a fixture of a different program.
 */
function graph(nodes: TravelNode[], extra: TravelEdge[] = [], zoneNames: Record<string, string> = {}): TravelGraph {
  const zones = new Map<string, TravelNode[]>();
  for (const node of nodes) {
    for (const zone of node.zones) zones.set(zone, [...(zones.get(zone) ?? []), node]);
  }
  const edges = [
    ...[...zones].flatMap(([zone, inZone]) => [...zoneWalks(inZone, zone), ...zoneSuccors(inZone, zone)]),
    ...extra,
  ];
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

test("a succor is a free ride to the zone's own safe point, and only when it's asked for", () => {
  // Right at the far side of the zone, 100 from the way out and 4900 from where you're standing.
  const g = graph([boundary("a", 5000, "b", 0), succor("a", 4900)], [], { a: "Alpha", b: "Beta" });
  const from = { zone: "a", at: { y: 0, x: 0, z: 0 } };

  const walked = findRoute(g, from, "b");
  assert.equal(walked?.cost, 5000, "off by default, so it's the whole zone on foot");
  assert.deepEqual(walked?.modes, []);

  const evac = findRoute(g, from, "b", { succor: true });
  assert.ok(evac);
  // Cast where you stand, then walk the last 100 — the walk it saves is the entire point of it.
  assert.equal(evac.cost, 100);
  assert.deepEqual(evac.modes, ["succor"]);
  assert.deepEqual(evac.steps.map((s) => s.node.id), [" start", "a#succor", "a|b", " goal"]);
  // **It crosses nothing.** The trip is still the two zones it always was, and the leg names the zone
  // it happened *inside* — which is how the panel words it "within Alpha" rather than "across" it.
  assert.deepEqual(files(evac), ["a", "b"]);
  assert.deepEqual(evac.steps.map((s) => s.from?.across?.zone), [undefined, "a", "a", "b"]);
});

test("a succor works in a zone you're only passing through, not just the one you start in", () => {
  // Where most of the saving is: you zone in at one end of a big zone, evacuate, and walk out of the
  // near side. The free edges run from *every* node in the zone, so arriving at a border is enough.
  const g = graph([boundary("a", 0, "b", 0), boundary("b", 9000, "c", 0), succor("b", 8900)], [], {
    a: "Alpha",
    b: "Beta",
    c: "Gamma",
  });

  assert.equal(findRoute(g, "a", "c")?.cost, 9000);

  const evac = findRoute(g, "a", "c", { succor: true });
  assert.ok(evac);
  assert.equal(evac.cost, 100);
  assert.deepEqual(evac.steps.map((s) => s.node.id), [" start", "a|b", "b#succor", "b|c", " goal"]);
  // Beta's safe point is Beta's alone — nothing here says you can evacuate into a zone you aren't in.
  assert.equal(findRoute(g, "a", "c", { succor: true })?.zones.length, 3);
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

/**
 * The chain again, but with a ring in **c as well as d** — the fixture for "not *that* port".
 *
 * One ring can only ever show that ruling it out falls back to walking, which a toggle already does.
 * Two show the thing that matters: the network keeps working, and the answer is the *next best* route
 * rather than the worst one.
 */
function twoRings(): TravelGraph {
  const nodes = [
    boundary("a", 1000, "b", 0),
    boundary("b", 1000, "c", 0),
    boundary("c", 1000, "d", 0),
    place("c", 900, "Ring"),
    place("d", 900, "Ring"),
    { id: "net:druid", kind: "hub" as const, label: "druid network", zones: [], at: {} },
  ];
  const ports: TravelEdge[] = [
    { from: "net:druid", to: "c#ring", mode: "druid", cost: 0 },
    { from: "net:druid", to: "d#ring", mode: "druid", cost: 0 },
  ];
  return graph(nodes, ports, { a: "Alpha", b: "Beta", c: "Gamma", d: "Delta" });
}

test("a port you haven't got is ruled out on its own — the rest of the network still works", () => {
  const from = { zone: "a", at: { y: 0, x: 0, z: 0 } };
  const to = { zone: "d", at: { y: 0, x: 1000, z: 0 } };
  const druid = { druid: true };

  // The best route: cast to d's own ring, walk the last 100.
  assert.equal(findRoute(twoRings(), from, to, druid)?.cost, 100);

  // You haven't got Circle of Delta. That is *not* a reason to lose Circle of Gamma: the route lands
  // at c's ring instead and walks on, which is the next best answer rather than the worst one.
  const next = findRoute(twoRings(), from, to, { ...druid, avoid: ["d#ring"] });
  assert.ok(next);
  assert.equal(next.cost, 1100, "100 across Gamma to the border, then 1000 across Delta");
  assert.deepEqual(next.modes, ["druid"], "the network survived losing one of its destinations");
  assert.deepEqual(next.steps.map((s) => s.node.id).slice(1, -1), ["net:druid", "c#ring", "c|d"]);

  // Both gone and there's nothing to cast to, so it's the walk — the same answer the toggle gives,
  // reached the long way round, which is the point: the toggle is the blunt version of this.
  const walked = findRoute(twoRings(), from, to, { ...druid, avoid: ["c#ring", "d#ring"] });
  assert.equal(walked?.cost, 4000);
  assert.deepEqual(walked?.modes, []);
});

test("a border can be ruled out too, and only that border", () => {
  const from = { zone: "a", at: { y: 0, x: 0, z: 0 } };
  const to = { zone: "d", at: { y: 0, x: 1000, z: 0 } };

  // It's the only way through the middle of the chain, so refusing it refuses the trip — and says so
  // as an ordinary "unreachable", because the graph answered exactly what it was asked.
  assert.equal(answerRoute(chain(), from, to, { avoid: ["b|c"] }).refused, "unreachable");

  // The same refusal with a port allowed is no refusal at all: what was ruled out is one border, not
  // every way past it.
  assert.equal(findRoute(chain(), from, to, { druid: true, avoid: ["b|c"] })?.cost, 100);
});

test("ruling out somewhere the graph hasn't got changes nothing", () => {
  // A settings file outlives the pack it was written against, and a place id is a pack's own
  // (`<zone>#<slug of its label>`). A stale entry has to be inert rather than an error.
  const from = { zone: "a", at: { y: 0, x: 0, z: 0 } };
  const to = { zone: "d", at: { y: 0, x: 1000, z: 0 } };
  const asked = findRoute(chain(), from, to, { druid: true, avoid: ["d#druid-rings", ""] });
  assert.equal(asked?.cost, findRoute(chain(), from, to, { druid: true })?.cost);
});

test("the route's two virtual ends are marked as such", () => {
  // A UI offers "route around this" per step and must not offer it on where you're standing. Asked of
  // the step rather than of its position in the list, which is the same fact spelled a breakable way.
  const route = findRoute(chain(), "a", "d", { druid: true })!;
  assert.deepEqual(route.steps.map(isRouteEnd), [true, false, false, true]);
});

/** A route as the panel lays it out: `<distance> <verb> to <where>`, one string per row. */
const reads = (route: TravelRoute | undefined) =>
  routeInstructions(route!).map((r) => {
    // The **row's** figure, not the step's: a border the route only walked past is no instruction, and
    // its distance is carried onto the row that follows it.
    const cost = r.step.from ? `${Math.round(r.cost)}` : "start";
    return r.how ? `${cost} ${r.how} to ${r.where}` : `${cost} ${r.where}`;
  });

test("a route reads as instructions — how far, what you do, where it leaves you", () => {
  const route = findRoute(chain(), { zone: "a", at: { y: 0, x: 0, z: 0 } }, { zone: "d", at: { y: 0, x: 1000, z: 0 } });

  // A **border is named by the side you come out on**: the node is "a ↔ b", which is true and is not
  // an instruction — you'd say "run to Beta". Which of the two it is, is in the *next* leg's zone.
  // Every row is a real walk here, arrival included: both ends gave a position, so the last leg is
  // the measured walk from the border to where you're actually going.
  assert.deepEqual(reads(route), [
    "start Alpha",
    "1000 Run to Beta",
    "1000 Run to Gamma",
    "1000 Run to Delta",
    "1000 Run to Delta",
  ]);
});

test("an arrival nobody walked is not an instruction", () => {
  // With no position for the destination the last leg is zero, a guess, and names the zone the border
  // above it just named — which read on screen as RunnyEye Citadel twice over, the second time as `0?`.
  const route = findRoute(chain(), { zone: "a", at: { y: 0, x: 0, z: 0 } }, "d");
  assert.deepEqual(reads(route), ["start Alpha", "1000 Run to Beta", "1000 Run to Gamma", "1000 Run to Delta"]);
  assert.equal(route!.steps[route!.steps.length - 1].node.id, " goal", "the step is still in the route itself");

  // A zero that was *measured* is not a guess and stays: standing on the line is a fact, not a shrug.
  const onTheLine = findRoute(chain(), { zone: "a", at: { y: 0, x: 0, z: 0 } }, { zone: "d", at: { y: 0, x: 0, z: 0 } });
  assert.deepEqual(reads(onTheLine).at(-1), "0 Run to Delta");

  // And a trip with nothing else to show still says where you started rather than emptying out.
  const nowhere = findRoute(graph([boundary("a", 0, "b", 0)], [], { a: "Alpha", b: "Beta" }), "a", "b");
  assert.deepEqual(reads(nowhere), ["start Alpha", "0 Run to Beta"]);
});

test("a hub is not a place, so a teleport is one instruction and not two", () => {
  // `net:druid` sits in the trail between the start and the ring. Left in, one port reads as
  // "Teleport to druid network" *then* "Teleport to Ring" — and it costs nothing, so taking it out
  // loses no distance, which the sum below is the guard for.
  const route = findRoute(chain(), "a", { zone: "d", at: { y: 0, x: 1000, z: 0 } }, { druid: true });
  assert.ok(
    route!.steps.some((s) => s.node.kind === "hub"),
    "the hub really is in the steps",
  );

  assert.deepEqual(reads(route), ["start Alpha", "0 Teleport to Ring · Delta", "100 Run to Delta"]);
  // (the arrival here is a measured 100, so nothing was trimmed)
  assert.equal(
    routeInstructions(route!).reduce((n, r) => n + (r.step.from?.cost ?? 0), 0),
    route!.cost,
    "and every unit of the route's cost is still on a row",
  );
});

test("a boat says Boat, and a succor says Succor at the place it never left the zone for", () => {
  const boat = graph([{ ...boundary("a", 0, "b", 0), via: "boat" as const }], [], { a: "Alpha", b: "Beta" });
  assert.deepEqual(reads(findRoute(boat, "a", "b")), ["start Alpha", "0 Boat to Beta"]);

  // The safe point is by the border and you are 5000 away from both, so evacuating is the cheap way
  // out — which is the only reason the router picks it, and what puts a Succor row on screen.
  const evac = graph([boundary("a", 0, "b", 0), succor("a", 100)], [], { a: "Alpha", b: "Beta" });
  const from = { zone: "a", at: { y: 0, x: 5000, z: 0 } };
  assert.deepEqual(reads(findRoute(evac, from, "b", { succor: true })), [
    "start Alpha",
    "0 Succor to Succor · Alpha",
    "100 Run to Beta",
  ]);
});

test("a border with two crossings is not a hop between them", () => {
  // One border, two crossing points — near the start by one and near the gnome by the other — which
  // used to make the path through it cheaper than the walk, since each edge took its own nearest pair.
  // The router refuses to walk *through* a node inside one zone, so the honest direct walk wins and the
  // dock never becomes a step at all.
  const dock: TravelNode = {
    id: "a|sea",
    kind: "boundary",
    label: "Alpha ↔ The Sea",
    zones: ["a", "sea"],
    via: "boat",
    at: { a: [{ y: 3280, x: 0, z: 0 }, { y: 0, x: 3400, z: 0 }], sea: [{ y: 0, x: 0, z: 0 }] },
  };
  const gnome: TravelNode = {
    id: "a|b",
    kind: "boundary",
    label: "Alpha ↔ Beta",
    zones: ["a", "b"],
    via: "translocator",
    at: { a: [{ y: 0, x: 3406, z: 0 }], b: [{ y: 0, x: 0, z: 0 }] },
  };
  const g = graph([dock, gnome], [], { a: "Alpha", b: "Beta", sea: "The Sea" });
  const route = findRoute(g, { zone: "a", at: { y: 0, x: 0, z: 0 } }, "b")!;

  assert.deepEqual(route.steps.map((s) => s.node.id), [" start", "a|b", " goal"], "straight to the gnome");
  assert.equal(Math.round(route.cost), 3406, "the walk, not 3280 + 6 through the dock");
  assert.deepEqual(reads(route), ["start Alpha", "3406 Run to the translocator · Alpha", "0 Translocate to Beta"]);
});

test("a succor is never mistaken for a place you walked past", () => {
  // It also arrives and leaves inside one zone, and it is the whole instruction — the walk it saves is
  // the reason the toggle exists. The difference is how you got there: walked in, or cast.
  const g = graph([boundary("a", 0, "b", 0), succor("a", 100)], [], { a: "Alpha", b: "Beta" });
  const from = { zone: "a", at: { y: 0, x: 5000, z: 0 } };
  assert.deepEqual(reads(findRoute(g, from, "b", { succor: true })), [
    "start Alpha",
    "0 Succor to Succor · Alpha",
    "100 Run to Beta",
  ]);
});

test("a border nobody placed is not a shortcut across the zone it sits in", () => {
  // The reported case. `UNKNOWN_CROSSING` is what it costs to reach a border with no coordinates —
  // and it cost the same to *leave*, which made an unplaced border a 4,000-unit teleport between any
  // two points in its zone. The real walk from Greater Faydark's line to Butcherblock's translocator
  // is 6,858; the graph quoted 4,000 and hopped through a border nobody drew.
  const g = graph(
    [
      boundary("butcher", -3061, "gfaydark", 0),
      { ...boundary("butcher", 3256, "oot", 0), via: "translocator" as const },
      // In Butcherblock and nowhere in it — the far side named the border, this side never did.
      { id: "butcher|kaladima", kind: "boundary" as const, label: "x", zones: ["butcher", "kaladima"], at: { kaladima: at(0) } },
    ],
    [],
    { butcher: "Butcherblock Mountains", gfaydark: "Greater Faydark", oot: "Ocean of Tears", kaladima: "South Kaladim" },
  );

  const route = findRoute(g, "gfaydark", "oot")!;
  // The honest walk, straight across, rather than two guesses that happen to add up to less.
  assert.equal(Math.round(route.cost), 6317);
  assert.deepEqual(route.steps.map((s) => s.node.id), [" start", "butcher|gfaydark", "butcher|oot", " goal"]);
  // The unplaced border is still reachable as a destination — it just isn't a way through.
  assert.ok(findRoute(g, "gfaydark", "kaladima"));
});

test("a block still leaves the detour it was written for", () => {
  // Walking through a node is refused **only where the direct walk exists**, which is everywhere
  // except the one thing that removes it: a block saying two places in a zone aren't joined.
  const nodes = [boundary("a", 0, "b", 0), boundary("a", 500, "c", 0), boundary("a", 900, "d", 0)];
  const full = graph(nodes, [], { a: "Alpha", b: "Beta", c: "Gamma", d: "Delta" });
  assert.equal(Math.round(findRoute(full, "b", "d")!.cost), 900, "straight across Alpha");

  // Now say you can't walk between those two directly. The way round is through the third.
  const blocked = { ...full, edges: full.edges.filter((e) => ![e.from, e.to].every((id) => id === "a|b" || id === "a|d")) };
  assert.equal(Math.round(findRoute(blocked, "b", "d")!.cost), 900, "500 to Gamma's line, then 400 on");
});

test("a crossing you have to be at is two instructions: the walk, then the free ride", () => {
  // A boundary node *is* the crossing, so arriving at Butcherblock's translocator meant both walking
  // to it and taking it — and the row read `4.1k Translocate to The Ocean of Tears`, pricing the ride
  // at the length of the walk. The ride is free; what costs is getting there.
  const g = graph(
    [boundary("a", 0, "b", 0), { ...boundary("a", 4133, "sea", 0), via: "translocator" as const }],
    [],
    { a: "Alpha", b: "Beta", sea: "The Sea" },
  );
  assert.deepEqual(reads(findRoute(g, { zone: "a", at: { y: 0, x: 0, z: 0 } }, "sea")), [
    "start Alpha",
    "4133 Run to the translocator · Alpha",
    "0 Translocate to The Sea",
  ]);

  // The distance is said once, so the rows still sum to what the route costs.
  const route = findRoute(g, { zone: "a", at: { y: 0, x: 0, z: 0 } }, "sea")!;
  assert.equal(routeInstructions(route).reduce((n, r) => n + r.cost, 0), route.cost);
});

test("standing on the dock already is one instruction, and a zone line always is", () => {
  // Nothing to split off: a walk of nothing is not a walk, and stepping over a zone line really is one
  // act — walking to it and crossing it are the same moment.
  const boat = graph([{ ...boundary("a", 0, "b", 0), via: "boat" as const }], [], { a: "Alpha", b: "Beta" });
  assert.deepEqual(reads(findRoute(boat, "a", "b")), ["start Alpha", "0 Boat to Beta"]);

  const line = graph([boundary("a", 900, "b", 0)], [], { a: "Alpha", b: "Beta" });
  assert.deepEqual(reads(findRoute(line, { zone: "a", at: { y: 0, x: 0, z: 0 } }, "b")), [
    "start Alpha",
    "900 Run to Beta",
  ]);
});

test("a port is cast where you stand, so it has no walk to split off", () => {
  const route = findRoute(chain(), "a", { zone: "d", at: { y: 0, x: 1000, z: 0 } }, { druid: true });
  assert.deepEqual(reads(route), ["start Alpha", "0 Teleport to Ring · Delta", "100 Run to Delta"]);
});
