/**
 * Joining harvested points into a graph. The load-bearing behaviours, all consequences of one
 * decision — **a border is one node, in both its zones** (ADR 0062):
 *
 *  - both halves of a border collapse into one node holding its position in each zone's own frame;
 *  - **crossing costs no edge at all**, and the edges that exist are walks within a zone;
 *  - a zone offering several ways across to one neighbour keeps all of them, and a walk takes the
 *    nearest — an average would put the border somewhere none of them is;
 *  - a destination no map file answers to is **reported**, not silently dropped.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTravelGraph } from "../../src/shared/travel/build";
import type { ZoneHarvest, TravelPoint } from "../../src/shared/travel/harvest";
import type { TravelCrossing } from "../../src/shared/travel/types";

const border = (to: string, y = 0, x = 0): TravelPoint => ({ label: `to ${to}`, at: { y, x, z: 0 }, kind: "border", to });
const place = (crossing: TravelCrossing, label = "Druid Rings"): TravelPoint => ({ label, at: { y: 0, x: 0, z: 0 }, kind: "place", crossing });
const zone = (name: string, points: TravelPoint[]): ZoneHarvest => ({ zone: name, points, dropped: [] });

const NAMES = {
  gfaydark: "Greater Faydark",
  lfaydark: "Lesser Faydark",
  crushbone: "Clan Crushbone",
  butcher: "Butcherblock Mountains",
};

/** Walk edges as `from→to @zone: cost`, sorted — the whole edge set, readably. */
const walks = (edges: { from: string; to: string; zone?: string; cost: number; mode: string }[]) =>
  edges
    .filter((e) => e.mode === "walk")
    .map((e) => `${e.from}→${e.to} @${e.zone}: ${Math.round(e.cost)}`)
    .sort();

test("both halves of a border are one node, holding its position in each zone", () => {
  const { graph } = buildTravelGraph(
    { id: "stock" },
    [zone("gfaydark", [border("Lesser Faydark", 0, 100)]), zone("lfaydark", [border("Greater Faydark", 0, 900)])],
    NAMES,
  );

  assert.equal(graph.nodes.length, 1);
  const [node] = graph.nodes;
  assert.equal(node.id, "gfaydark|lfaydark", "sorted, so one border has one name");
  assert.equal(node.kind, "boundary");
  assert.equal(node.label, "Greater Faydark ↔ Lesser Faydark");
  assert.deepEqual(node.zones, ["gfaydark", "lfaydark"]);
  assert.deepEqual(node.at, { gfaydark: [{ y: 0, x: 100, z: 0 }], lfaydark: [{ y: 0, x: 900, z: 0 }] });

  // **Crossing is not an edge.** Standing at the node is standing in both zones, so there is nothing
  // to traverse — and with one boundary per zone there is nothing to walk to either.
  assert.deepEqual(graph.edges, []);
});

test("a zone's boundaries are joined to each other by the distance between them", () => {
  // The shape from the amended requirement: zone A with borders to B, C and D gets a node per border
  // and a walk between each pair, priced in A's coordinates.
  const { graph, report } = buildTravelGraph(
    { id: "stock" },
    [
      zone("a", [border("b", 0, 0), border("c", 0, 300), border("d", 400, 0)]),
      zone("b", []),
      zone("c", []),
      zone("d", []),
    ],
    { a: "A", b: "B", c: "C", d: "D" },
  );

  assert.deepEqual(graph.nodes.map((n) => n.id).sort(), ["a|b", "a|c", "a|d"]);
  assert.equal(report.boundaries, 3);
  assert.deepEqual(walks(graph.edges), [
    "a|b→a|c @a: 300",
    "a|b→a|d @a: 400",
    "a|c→a|b @a: 300",
    "a|c→a|d @a: 500",
    "a|d→a|b @a: 400",
    "a|d→a|c @a: 500",
  ]);
});

test("branching continues from a boundary into the next zone, in that zone's own frame", () => {
  const { graph } = buildTravelGraph(
    { id: "stock" },
    [
      zone("a", [border("b", 0, 0)]),
      // B's own coordinates for the same border, and its own border onward to C.
      zone("b", [border("a", 0, 5000), border("c", 0, 5700)]),
      zone("c", [border("b", 0, 0)]),
    ],
    { a: "A", b: "B", c: "C" },
  );

  // One node per border, and the walk across B is measured in B's coordinates — not A's.
  assert.deepEqual(graph.nodes.map((n) => n.id).sort(), ["a|b", "b|c"]);
  assert.deepEqual(walks(graph.edges), ["a|b→b|c @b: 700", "b|c→a|b @b: 700"]);
});

test("several ways across one border are all kept, and a walk takes the nearest", () => {
  const { graph } = buildTravelGraph(
    { id: "stock" },
    [
      // Two exits to Lesser Faydark, plus one to Crushbone to walk to.
      zone("gfaydark", [border("Lesser Faydark", 0, 100), border("Lesser Faydark", 0, 900), border("Clan Crushbone", 0, 0)]),
      zone("lfaydark", []),
      zone("crushbone", []),
    ],
    NAMES,
  );

  const boundary = graph.nodes.find((n) => n.id === "gfaydark|lfaydark")!;
  assert.deepEqual(boundary.at.gfaydark, [{ y: 0, x: 100, z: 0 }, { y: 0, x: 900, z: 0 }]);
  // The nearer crossing is 100 away from the Crushbone border, the further one 900. Which of the two
  // pairs with which arrival in Lesser Faydark is a question nothing can answer — so it isn't asked.
  assert.deepEqual(walks(graph.edges), [
    "crushbone|gfaydark→gfaydark|lfaydark @gfaydark: 100",
    "gfaydark|lfaydark→crushbone|gfaydark @gfaydark: 100",
  ]);
});

test("a border only one mapmaker drew is still a border, and says its walks are guesses", () => {
  const { graph, report } = buildTravelGraph(
    { id: "stock" },
    [
      zone("gfaydark", [border("Clan Crushbone", 0, 0)]),
      // Crushbone never labels the way back, but it does have another border to walk to.
      zone("crushbone", [border("Butcherblock Mountains", 0, 500)]),
      zone("butcher", []),
    ],
    NAMES,
  );

  const node = graph.nodes.find((n) => n.id === "crushbone|gfaydark")!;
  assert.deepEqual(Object.keys(node.at), ["gfaydark"], "we know it exists, not where it lands");
  // Both of Crushbone's borders are one-sided here — neither Greater Faydark's counterpart nor
  // Butcherblock's is drawn — and both are named, because that's the list to go and check.
  assert.deepEqual(report.oneSided, ["butcher|crushbone", "crushbone|gfaydark"]);
  // So the walk across Crushbone is priced as a stand-in rather than measured, and flagged.
  const crossing = graph.edges.find((e) => e.zone === "crushbone")!;
  assert.equal(crossing.cost, 2000);
  assert.equal(crossing.assumed, true);
});

test("a destination no map file answers to becomes no node, and says so", () => {
  const { graph, report } = buildTravelGraph(
    { id: "stock" },
    [zone("gfaydark", [border("The Plane of Growth"), border("Lesser Faydark")]), zone("lfaydark", [])],
    NAMES,
  );

  assert.deepEqual(report.unresolved, [{ name: "The Plane of Growth", from: ["gfaydark"] }]);
  // Without a far side there's no boundary, only a label — a node for it would join nothing and
  // pretend to be a crossing.
  assert.deepEqual(graph.nodes.map((n) => n.id), ["gfaydark|lfaydark"]);
});

test("a zone name is resolved exactly, after folding — never by containment", () => {
  // "commonlands" sits inside "east commonlands"; a loose match would join the wrong zones, which is
  // the mistake ADR 0059 settled for every other zone comparison in the app.
  const { report } = buildTravelGraph(
    { id: "stock" },
    [zone("ecommons", [border("The Commonlands")]), zone("wcommons", [])],
    { ecommons: "East Commonlands", wcommons: "West Commonlands" },
  );
  assert.deepEqual(report.unresolved.map((u) => u.name), ["The Commonlands"]);
});

test("a zone name resolves through EverQuest's backtick as well as a typed apostrophe", () => {
  // The maps write `to Ak\`Anon`; the catalogue types "Ak'Anon".
  const { graph } = buildTravelGraph(
    { id: "stock" },
    [zone("steamfontmts", [border("Ak`Anon")]), zone("akanon", [border("Steamfont Mountains")])],
    { steamfontmts: "Steamfont Mountains", akanon: "Ak'Anon" },
  );
  assert.deepEqual(graph.nodes.map((n) => n.id), ["akanon|steamfontmts"]);
});

test("a teleport network becomes a hub; one zone's worth of rings is not a network", () => {
  const { graph, report } = buildTravelGraph(
    { id: "stock" },
    [zone("lfaydark", [place("ring")]), zone("gfaydark", [place("ring")]), zone("crushbone", [place("spire", "Spires")])],
    NAMES,
  );

  const hub = graph.nodes.find((n) => n.id === "net:druid");
  assert.equal(hub?.kind, "hub");
  assert.deepEqual(hub?.zones, [], "a network is in no zone");
  assert.equal(graph.edges.filter((e) => e.mode === "druid").length, 4, "two members, both ways");

  // The lone spire keeps its node — a person may pair it — but an empty hub would be a lie.
  assert.equal(graph.nodes.some((n) => n.id === "net:wizard"), false);
  assert.ok(graph.nodes.some((n) => n.label === "Spires"));
  assert.deepEqual(report.networks, [
    { network: "druid", zones: ["gfaydark", "lfaydark"] },
    { network: "wizard", zones: ["crushbone"] },
  ]);
});

test("a ring is walkable from its zone's borders, like anything else in the zone", () => {
  const { graph } = buildTravelGraph(
    { id: "stock" },
    [zone("gfaydark", [border("Lesser Faydark", 0, 600), place("ring")]), zone("lfaydark", [])],
    NAMES,
  );
  assert.deepEqual(walks(graph.edges), [
    "gfaydark#druid-rings→gfaydark|lfaydark @gfaydark: 600",
    "gfaydark|lfaydark→gfaydark#druid-rings @gfaydark: 600",
  ]);
});

test("a conveyance that names its destination becomes a border, and says how you cross", () => {
  // Two continents, joined only the way the packs really label it. Before this, both sides were
  // unpaired docks and Odus was an island — which is the Ak'Anon → Toxxulia Forest bug.
  const ferry = (to: string, x = 0): TravelPoint => ({
    label: `Boat to ${to}`,
    at: { y: 0, x, z: 0 },
    kind: "place",
    crossing: "boat",
    to,
  });
  const { graph, report } = buildTravelGraph(
    { id: "stock" },
    [zone("butcher", [ferry("Erudin", 100)]), zone("erudnext", [ferry("Butcherblock Mountains", 900)])],
    { butcher: "Butcherblock Mountains", erudnext: "Erudin" },
  );

  assert.deepEqual(graph.nodes.map((n) => n.id), ["butcher|erudnext"]);
  const [node] = graph.nodes;
  assert.equal(node.kind, "boundary");
  // The conveyance names itself on the border, so a route can say "take the boat" rather than leaving
  // you to wonder why two zones an ocean apart are next to each other.
  // The name is the two zones; **how** you cross is `via`, one field a UI can badge and a script can
  // print — it used to be appended here too, so every consumer showed it twice or had to check.
  assert.equal(node.label, "Butcherblock Mountains ↔ Erudin");
  assert.equal(node.via, "boat");
  assert.deepEqual(node.at, { butcher: [{ y: 0, x: 100, z: 0 }], erudnext: [{ y: 0, x: 900, z: 0 }] });
  assert.deepEqual(report.isolated, [], "neither side is cut off any more");
});

test("a conveyance whose destination no map file answers to keeps its node", () => {
  // The border it claims can't be made, but the dock is real and drawn — so it stays, for
  // `manual-links.ts` to pair, and the miss is reported rather than swallowed.
  const { graph, report } = buildTravelGraph(
    { id: "stock" },
    [zone("butcher", [{ label: "Boat to Erudin", at: { y: 0, x: 0, z: 0 }, kind: "place", crossing: "boat", to: "Erudin" }])],
    { butcher: "Butcherblock Mountains" },
  );
  assert.deepEqual(graph.nodes.map((n) => n.label), ["Boat to Erudin"]);
  assert.deepEqual(report.unresolved, [{ name: "Erudin", from: ["butcher"] }]);
});

test("docks are found and listed, but never wired to each other — a boat has two particular ends", () => {
  const dock = (): TravelPoint => ({ label: "Dock", at: { y: 0, x: 0, z: 0 }, kind: "place", crossing: "boat" });
  const { graph, report } = buildTravelGraph(
    { id: "stock" },
    [zone("freporte", [dock()]), zone("butcher", [dock()]), zone("oot", [dock()])],
    { freporte: "East Freeport", butcher: "Butcherblock Mountains", oot: "Ocean of Tears" },
  );

  // Hubbing these would say every dock in the world reaches every other for nothing.
  assert.equal(graph.nodes.some((n) => n.id === "net:boat"), false);
  assert.deepEqual(graph.edges, []);
  // Found and reported all the same, because that's the list of runs to pair up by hand.
  assert.deepEqual(report.networks, [{ network: "boat", zones: ["butcher", "freporte", "oot"] }]);
});

test("a zone the server hasn't got never enters the graph, and nor do the borders into it", () => {
  // A pack surveys EverQuest, not this server. Left in, a zone half the world labels an exit to becomes
  // a hub that shortcuts the map — so it's an input to *creation*, which is what makes re-running the
  // build safe: there's no second pass to forget.
  const zones = [
    zone("gfaydark", [border("The Plane of Knowledge", 0, 0), border("Butcherblock Mountains", 0, 900)]),
    zone("poknowledge", [border("Greater Faydark"), border("East Freeport")]),
    zone("butcher", [border("Greater Faydark")]),
    zone("freporte", [border("The Plane of Knowledge")]),
  ];
  const names = { ...NAMES, poknowledge: "The Plane of Knowledge", freporte: "East Freeport" };

  // Without the exception it's real, well-connected, and the only thing joining Freeport to Faydwer.
  const { graph: kept } = buildTravelGraph({ id: "stock" }, zones, names);
  assert.equal(kept.nodes.filter((n) => n.zones.includes("poknowledge")).length, 2);

  const { graph, report } = buildTravelGraph({ id: "stock" }, zones, names, ["The Plane of Knowledge"]);
  assert.deepEqual(graph.nodes.map((n) => n.id), ["butcher|gfaydark"], "only what's really adjacent");
  assert.deepEqual(graph.absent, ["poknowledge"], "remembered, so a route can say why");
  // Two zones labelled an exit into it (Greater Faydark and Freeport), and both are refused. Its own
  // two points aren't counted here at all — the zone is skipped wholesale, not border by border.
  assert.deepEqual(report.absent, [{ zone: "poknowledge", borders: 2 }]);
  // And a refused border is **not** an unresolved destination: a map file does answer to it.
  assert.deepEqual(report.unresolved, []);
  // Freeport is left with nothing, which is the truth about a world without the Plane of Knowledge.
  assert.deepEqual(report.isolated, ["freporte"], "and the excluded zone isn't listed as isolated");
});

test("an excluded zone is named either way round — as you'd say it, or as its map file", () => {
  const zones = [zone("poknowledge", [border("Greater Faydark")]), zone("gfaydark", [border("The Plane of Knowledge")])];
  const names = { ...NAMES, poknowledge: "The Plane of Knowledge" };
  for (const named of ["The Plane of Knowledge", "the plane of knowledge", "poknowledge"]) {
    const { graph } = buildTravelGraph({ id: "stock" }, zones, names, [named]);
    assert.deepEqual(graph.nodes, [], `named as ${JSON.stringify(named)}`);
  }
  // A zone this pack never had is no error — there was nothing to leave out.
  const { graph, report } = buildTravelGraph({ id: "stock" }, zones, names, ["The Plane of Growth"]);
  assert.deepEqual(report.absent, []);
  assert.equal(graph.absent, undefined);
  assert.equal(graph.nodes.length, 1, "and the real border is untouched");
});

test("a zone with no way in or out is named, because that's the list to work through by hand", () => {
  const { report } = buildTravelGraph(
    { id: "stock" },
    [zone("gfaydark", [border("Lesser Faydark")]), zone("lfaydark", [border("Greater Faydark")]), zone("crushbone", [])],
    NAMES,
  );
  assert.deepEqual(report.isolated, ["crushbone"]);
});

test("a border with a zone's own name is no border", () => {
  const { graph, report } = buildTravelGraph({ id: "stock" }, [zone("gfaydark", [border("Greater Faydark")])], NAMES);
  assert.deepEqual(graph.nodes, []);
  assert.deepEqual(report.isolated, ["gfaydark"]);
});
