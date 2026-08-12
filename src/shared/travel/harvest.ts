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
 */
export function travelPoint(poi: MapPoi): TravelPoint | undefined {
  const label = poi.label.trim();
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
}

/**
 * Every travel point a zone's map labels. Order is the file's own, which is what makes a place's id
 * stable across rebuilds (see `build.ts`) — so this never sorts.
 */
export function harvestZone(zone: string, pois: MapPoi[]): ZoneHarvest {
  const points: TravelPoint[] = [];
  const dropped: string[] = [];
  for (const poi of pois) {
    const point = travelPoint(poi);
    if (point) points.push(point);
    else if (poiKind(poi.label) === "zoneline") dropped.push(poi.label.trim());
  }
  return { zone, points, dropped };
}
