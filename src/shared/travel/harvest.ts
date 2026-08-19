/**
 * Reading a zone's travel points off its map labels.
 *
 * The packs already label their exits (`to The Lesser Faydark`) and their conveyances (`Druid Ring`,
 * `Spires`, `Dock`) — that corpus is what named the zones in the first place
 * (`map/zone-names.ts`), and it's the same corpus a travel graph needs. So which zones have a druid
 * ring is **read**, not typed from memory: the same argument
 * [ADR 0048](../../../specs/decisions/0048-a-map-label-is-read-by-its-words.md) makes for the label
 * filter and [ADR 0039](../../../specs/decisions/0039-render-the-game-s-own-maps.md) for the
 * gazetteer. Hand-authored data (`manual-links.ts`) then corrects and completes it, rather than
 * being the source.
 *
 * Pure. Which labels are zone lines and which are conveyances is `poiKind`'s existing judgement,
 * reused rather than re-decided.
 */

import type { MapPoi } from "../map/eqmap";
import { poiKind } from "../map/poi-kinds";
import { zoneLinkName } from "../map/zone-names";
import type { TravelAt, TravelCrossing } from "./types";

/**
 * One point in one zone the graph can use.
 *
 * A `border` says "the boundary with X is here, in this zone's coordinates" — whether the label was
 * written as a way out (`to X`) or a way in (`from X`), because a border is one place either way and
 * the builder joins both sides into one node.
 *
 * A `place` is somewhere in this zone travel touches: a ring, a spire, a dock — or a succor point,
 * which is the one you only ever travel *to*.
 */
export interface TravelPoint {
  label: string;
  at: TravelAt;
  kind: "border" | "place";
  /**
   * The zone the label names, as it wrote it — for a border, and for a **conveyance that says where it
   * goes** (`Boat to Butcherblock Mountains`, `Translocator to Erudin`). Those are a stated fact about
   * the world exactly as a `to X` zone line is, so the destination is read rather than discarded; the
   * builder turns it into a border if a real map file answers to it, and leaves the place alone if
   * none does.
   */
  to?: string;
  /**
   * For a place: **how you'd get here without walking**, when the label says — a dock is a `boat`,
   * `Spires` a `spire`, `Succor` a `succor`. Absent when the label names a conveyance we can't place
   * at all.
   */
  crossing?: TravelCrossing;
}

/** `from The Overthere` — the other half of a border, which some packs label instead of the exit. */
const ARRIVAL = /^(?:from)\s+(.+)$/i;

/**
 * The destination a **conveyance** names: `Boat to Butcherblock Mountains`, `Translocator to Erudin`,
 * `Portal to Ak\`Anon`. Anywhere in the label, not just the start — which is the whole difference from
 * a zone line, and the reason these used to be dropped.
 *
 * Greedy to the end of the string on purpose, so `zoneLinkName` gets the whole tail and applies its own
 * rules to it (the noise it strips, the `A & B` forms it refuses). A destination no map file answers to
 * costs nothing: the builder keeps the place and reports the miss.
 */
const CONVEYANCE_TO = /\bto\s+(.+)$/i;

/**
 * The ways across, matched against the words that already made `poiKind` call a label a conveyance —
 * `druid ring`, `spires`, `teleport…`, `portal`, `translocator`, `blimp`, `ferry`, `boat`, `dock`.
 * There is no point recognising a spelling that never reaches here: "Ring of Karana" and "Druid
 * Circle" read as plain names to the classifier, so they arrive as nothing at all, and widening
 * *this* wouldn't change that.
 */
const RING = /\bdruid\s*rings?\b/i;
const SPIRE = /\bspires?\b/i;
const BOAT = /\bboats?\b|\bferry\b|\bdocks?\b|\bblimp\b/i;
const TRANSLOCATOR = /\btranslocator\b|\bteleport(?:er|ation)?\s*(?:pad|gnome)\b/i;
const PORTAL = /\bportals?\b/i;

/**
 * Where an evacuation drops you — the one "conveyance" that goes nowhere, since it moves you inside
 * the zone you're already in.
 *
 * Only the words that mean this and nothing else. `Safe Spot` and `Safe Point` are deliberately **not**
 * here: in the packs they mark somewhere pleasant to camp far more often than they mark a succor point,
 * and a wrong safe point is a free ride to the wrong end of the zone.
 */
const SUCCOR = /\bsucco(?:u)?rs?\b|\bevac(?:uate|uation)?\b/i;

/**
 * **A conveyance the mapmaker marked dead.**
 *
 * A ring is a ring by its words ([ADR 0048](../../../specs/decisions/0048-a-map-label-is-read-by-its-words.md)),
 * and those words sometimes say it doesn't work: Greater Faydark's only druid ring is labelled
 * `Abandoned Druid Ring`, and you cannot port to it. Read as a live ring it is worse than a missing
 * one — a hub edge makes it a destination **from every zone in the world**, so one dead marker offers
 * the whole map a free ride to nowhere, and a route that takes it is confident and wrong.
 *
 * **The whole corpus, measured**, across both packs and ~1,200 files: `Abandoned Druid Ring`
 * (gfaydark), `Ruined Druid ring` (direwind), `Inactive Druid Ring` (rathemtn), `Broken Wizard Spire`
 * (nektulos), `Broken Portal` (umbral). Four words, five labels, and every one of them means the same
 * thing.
 *
 * **Adjacency is what keeps it safe.** The dead word has to sit on the conveyance — one word between
 * them at most, for `Broken Wizard Spire` — because the loose version would read `to the Broken Skull
 * Rock (boat)` as a dead boat. Matched over the corpus it catches those five and nothing else.
 */
const DEAD = /\b(?:abandoned|broken|inactive|ruined|derelict|collapsed|defunct)\s+(?:[a-z'`]+\s+)?(?:druid\s*rings?|spires?|portals?|translocators?)\b/i;

/** Does this label say its own conveyance doesn't work? See `DEAD`. */
export function deadConveyance(label: string): boolean {
  return DEAD.test(label);
}

/**
 * How a conveyance label says you cross, or `undefined` when it says nothing we recognise.
 *
 * Order matters only where a label mentions two: `Dock (Translocator Narrik)` is a gnome standing on a
 * dock, so the translocator wins — and a portal is checked last, being the vaguest of them.
 */
export function transportCrossing(label: string): TravelCrossing | undefined {
  if (SUCCOR.test(label)) return "succor";
  if (TRANSLOCATOR.test(label)) return "translocator";
  if (RING.test(label)) return "ring";
  if (SPIRE.test(label)) return "spire";
  if (BOAT.test(label)) return "boat";
  if (PORTAL.test(label)) return "portal";
  return undefined;
}

/**
 * The kinds a conveyance vocabulary is allowed to overrule.
 *
 * `poiKind` files "Druid Rings" under **names & places**, because its transport vocabulary spells the
 * ring singular (`\bdruid ring\b` can't reach the plural) — so a graph that only trusted its verdict
 * would miss the druid network on every pack that writes it that way. Rather than widening the shared
 * classifier from here (it's a pinned black box, and its own filter has an opinion about where those
 * labels belong), a label it left in one of its two **fallback** kinds is re-read with the vocabulary
 * this module cares about.
 *
 * Only the fallbacks, which is what keeps it safe: `a dock worker` is a `mob` and `Dock Merchant` is
 * a `merchant`, so neither is offered here, and neither becomes a boat.
 */
const RECLASSIFIABLE = new Set(["transport", "named", "note"]);

/**
 * The travel point a label describes, or `undefined` when it describes none.
 *
 * A zone line that names no destination (a bare `Zone Line`) is dropped: it says a border is here,
 * which a graph can't use without knowing the other side, and inventing one would be a guess. The
 * caller counts what it dropped so a build can report it rather than quietly covering less ground than
 * it claims.
 *
 * A **`Succor`** marker is the exception among those, and the reason is that it isn't a border at all:
 * it names no destination because it *has* none, being the spot inside this zone an evacuation drops
 * you at. That's a place, and a complete fact on its own.
 *
 * A conveyance the label calls **dead** is no travel point either — see `DEAD`.
 */
export function travelPoint(poi: MapPoi): TravelPoint | undefined {
  const label = poi.label.trim();
  // **A ring the map calls abandoned is not a way anywhere**, and reading it as one is worse than not
  // reading it at all: a hub makes every ring a destination from every zone, so a single dead marker
  // offers the whole world a free ride to a circle of stones that doesn't work. Checked before
  // anything else, so it holds for a border that names a dead crossing as much as for a place.
  if (deadConveyance(label)) return undefined;
  const at: TravelAt = { y: poi.y, x: poi.x, z: poi.z };
  const kind = poiKind(label);

  if (kind === "zoneline") {
    // The arrival form first: `zoneLinkName` only reads `to X`, so `from X` is handed to it as one
    // rather than repeating its noise-stripping and its refusal of `A & B` labels here.
    const inbound = ARRIVAL.exec(label)?.[1];
    const to = zoneLinkName(inbound ? `to ${inbound}` : label);
    // `poiKind` files a succor marker under zone lines, which is right for the map's own filter — it's
    // drawn where the exits are and a person looking for one looks there. Here it's read only once
    // nothing has named a destination, so `to North Karana (Succor)` stays the border it says it is.
    if (!to) return SUCCOR.test(label) ? { label, at, kind: "place", crossing: "succor" } : undefined;

    // **`to Timorous Deep (Boat)` is a border like any other.** A boat costs no walking and asks
    // nothing of you but turning up at the dock, so a labelled ferry destination is the same fact as a
    // labelled zone line — and where a pack labels both ends this way, the two pair into one boundary
    // with no hand-authored entry needed at all.
    return { label, at, kind: "border", to };
  }

  if (!RECLASSIFIABLE.has(kind)) return undefined;
  const crossing = transportCrossing(label);
  // A conveyance the shared classifier recognised, or one only this vocabulary names.
  if (kind !== "transport" && !crossing) return undefined;

  // Where it goes, if it says. Handed to `zoneLinkName` as a `to X` label so its rules apply here too.
  const named = CONVEYANCE_TO.exec(label)?.[1];
  const to = named ? zoneLinkName(`to ${named}`) : null;
  return { label, at, kind: "place", ...(crossing ? { crossing } : {}), ...(to ? { to } : {}) };
}

/** What a zone's labels yielded, and what they didn't. */
export interface ZoneHarvest {
  /** The map file (zone short name). */
  zone: string;
  points: TravelPoint[];
  /** Labels that read as travel but named nowhere — a bare `Zone Line`, `Zone Out`. */
  dropped: string[];
  /** Labels refused as a conveyance's **destination board** rather than zone lines — see `boards`. */
  board: string[];
}

/**
 * **A pile of destinations at one spot is a sign, not a set of zone lines.**
 *
 * Timorous Deep's map carries twelve `to X` labels inside a 120-unit box — Ak'Anon, Halas, Oggok,
 * Rivervale, Greater Faydark, Cabilis West — which is a translocator's board listing where it can send
 * you, drawn where the gnome stands. Read as zone lines it made Timorous Deep **adjacent to half the
 * world**, and since no far side ever labelled the way back, every one of those borders was priced by
 * `UNKNOWN_CROSSING`: a route out of Greater Faydark ran 2,000 invented units to a gnome that isn't
 * there instead of walking to Butcherblock and taking the one that is. A border is symmetric, and this
 * turned a one-way menu into a two-way road.
 *
 * **The measurement, over both packs.** A real crossing is at the edge of the map and its neighbours
 * are thousands of units away; a board is a caption block. Counting *distinct* destinations within 150
 * units — with a trailing `(1)`, `(2)` folded away, since that is which of several ways in it is and
 * not a different zone — the whole corpus has **three** places with five or more, and all three are
 * boards: Timorous Deep's twelve, and the portal lists in the Plane of Tranquility and Laurion Inn.
 * At four it starts reaching dungeon junctions (Sol A's several ways into Nagafen's Lair, beside its
 * exit to Lavastorm), which are real. So five is the floor, and it is a floor with daylight under it.
 *
 * What a board *means* is left to the hand-authored table, which is what it is for: the six verified
 * translocator gnomes are written there, and this one contradicts them — it lists Kunark and a revamped
 * Guk, so it is a map drawn for a different server. A label that can't be believed is refused, which is
 * `zoneLinkName`'s own rule for `A & B`.
 */
const BOARD_RADIUS = 150;
const BOARD_DESTINATIONS = 5;

/** `Nagafen's Lair (3)` is which way in, not a different zone. */
function boardKey(name: string): string {
  return name.replace(/\s*\(\s*\d+\s*\)\s*$/, "").trim().toLowerCase();
}

/**
 * The border points that are really one conveyance's destination board — refused wholesale. Greedy
 * over the points in file order, so the answer doesn't depend on anything but the map.
 */
export function destinationBoard(points: readonly TravelPoint[]): Set<TravelPoint> {
  const borders = points.filter((p) => p.kind === "border" && p.to);
  const refused = new Set<TravelPoint>();
  for (const point of borders) {
    if (refused.has(point)) continue;
    const near = borders.filter(
      (other) => !refused.has(other) && Math.hypot(point.at.y - other.at.y, point.at.x - other.at.x) <= BOARD_RADIUS,
    );
    if (new Set(near.map((p) => boardKey(p.to!))).size < BOARD_DESTINATIONS) continue;
    for (const p of near) refused.add(p);
  }
  return refused;
}

/**
 * Every travel point a zone's map labels. Order is the file's own, which is what makes a place's id
 * stable across rebuilds (see `build.ts`) — so this never sorts.
 */
export function harvestZone(zone: string, pois: MapPoi[]): ZoneHarvest {
  const found: TravelPoint[] = [];
  const dropped: string[] = [];
  for (const poi of pois) {
    const point = travelPoint(poi);
    if (point) found.push(point);
    else if (poiKind(poi.label) === "zoneline") dropped.push(poi.label.trim());
  }
  // Refused last, because it is a judgement about the points **together** — one label says nothing
  // about whether it is a zone line, and a dozen of them in one spot says everything.
  const board = destinationBoard(found);
  return {
    zone,
    points: found.filter((p) => !board.has(p)),
    dropped,
    board: [...board].map((p) => p.label),
  };
}
