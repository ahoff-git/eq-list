/**
 * mob-place.ts — **where a mob is, and who says so.**
 *
 * Three things in this app can put a mob somewhere, and they are not the same kind of claim:
 *
 *   - **your own kills** — a roam centre averaged from where *you* fought it. Checkable: you stood
 *     there. The smallest sample of the three and the only one you can argue with.
 *   - **peers' kills** — the same measurement made by somebody else and pooled into yours
 *     (`mergeObservations`), which is more evidence and less checkable at the same time.
 *   - **the wiki** — a mob page's stated `Location:` coordinate. Not a measurement at all: a point
 *     somebody wrote down, about an older and since heavily modified game
 *     ([ADR 0025](../../../specs/decisions/0025-observation-over-the-wiki.md)) — but the only source
 *     that can place a mob you have **never killed**, which is exactly the mob a hunt is about.
 *
 * So they are ranked rather than merged, and every answer carries **which one spoke**: observation
 * leads, and the wiki fills the silence instead of competing with it. This is the same shape
 * [drop-truth.ts](../drop-truth.ts) gives a drop *rate* — the two sources put side by side with the
 * disagreement named — applied to the other thing the wiki and your log both claim to know.
 *
 * Pure and DOM-free; tested in `electron/tests/mob-place.test.ts`.
 */
import { roamWhy, type MobArea } from "../mob-stats";
import type { ItemCard } from "../types";

/** What a mob's wiki page states about where it stands. Either half may be missing. */
export interface WikiPlace {
  /** The stated spawn zone, in the wiki's wording (`zoneMatches` is how it meets the log's). */
  zone?: string;
  /** The stated coordinate, EQ y,x. */
  loc?: { y: number; x: number };
}

/** Who placed the mob. `pooled` is the first two together — your kills and theirs, as one sample. */
export type PlaceSource = "yours" | "pooled" | "peers" | "wiki";

/** Where a mob is, as the best-placed source has it. */
export interface MobPlace {
  y: number;
  x: number;
  /**
   * How rough it is, in EQ units — the roam area's spread.
   *
   * **Absent means the position was stated rather than measured**, which is a different claim and
   * has to stay tellable from `spread: 0`: a single kill really does pin a mob to one point, and a
   * wiki coordinate with no kills behind it does not.
   */
  spread?: number;
  /** Positioned kills behind it. `0` for a stated one, which is what makes it sortable against them. */
  samples: number;
  source: PlaceSource;
  /** One sentence: what this position rests on, in the words the rest of the app uses for it. */
  why: string;
}

/** Everything that could place one mob in one zone. */
export interface PlaceEvidence {
  /** Your own kills' roam area, from `mobs.mine(zone)`. */
  mine?: MobArea;
  /** The pooled area — yours and peers' together, from `mobs.all(zone)`. */
  pooled?: MobArea;
  /** Who else is in that pool. Empty (or absent) means the pooled figure is yours alone. */
  contributors?: string[];
  /** What the mob's wiki page states. */
  wiki?: WikiPlace;
}

/** A blank the wiki writes where it has nothing — never a zone, and never a coordinate. */
const BLANK = /^(various|unknown|none|n\/a|-+)$/i;

/**
 * Does this card value say nothing? `Various`, `Unknown`, `None` — words, not places, and a link to
 * one would open the map on a zone that doesn't exist. Exported so the wiki page view and the map
 * agree about what counts as an answer.
 */
export function statesNothing(value: string): boolean {
  return BLANK.test(value.trim());
}

/** A stat-card row, as `parseMobCard` leaves it: `Label: value`. */
const cardValue = (lines: readonly string[], label: RegExp): string | undefined => {
  for (const line of lines) {
    const m = line.match(label);
    const value = m?.[1]?.trim();
    if (value && !BLANK.test(value)) return value;
  }
  return undefined;
};

/**
 * The zone a mob's stat card says it spawns in.
 *
 * Exported because two readers want exactly this: the map, to judge whether a stated coordinate is
 * about the zone on screen, and the wiki page itself, to make its `Zone:` line a link. It was
 * written out in the page view first; a second copy in the map is where the two would start
 * disagreeing about whether "Various" is a place.
 */
export function cardZone(lines: readonly string[] = []): string | undefined {
  return cardValue(lines, /^(?:Spawn )?Zone:\s*(.+)$/i);
}

/** The coordinate a mob's stat card states, EQ y,x — `Location: (1555, -2410)`. */
export function cardLoc(lines: readonly string[] = []): { y: number; x: number } | undefined {
  const stated = cardValue(lines, /^Location:\s*(.+)$/i);
  const m = stated?.match(/\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
  if (!m) return undefined;
  return { y: Number.parseFloat(m[1]), x: Number.parseFloat(m[2]) };
}

/** What a mob's wiki page states about where it is, or `undefined` when it states nothing. */
export function wikiPlace(card: ItemCard | undefined): WikiPlace | undefined {
  const zone = cardZone(card?.lines);
  const loc = cardLoc(card?.lines);
  return zone || loc ? { zone, loc } : undefined;
}

/**
 * **Where the mob is, according to the best-placed source that can say.**
 *
 * Ranked, never averaged. Averaging a measurement with a stated point would produce a coordinate
 * nobody claims and no way to tell how much of it came from where — and the ranking is the app's
 * standing one: what was observed beats what was written down, and the wiki answers only where
 * observation is silent.
 *
 * Returns `undefined` when nothing can place it. That is a real answer — a mob you have never killed
 * whose page states no coordinate is genuinely unlocated — and callers show nothing rather than a
 * mark in the middle of the map.
 */
export function mobPlace(evidence: PlaceEvidence): MobPlace | undefined {
  const { mine, pooled, contributors = [], wiki } = evidence;
  const measured = pooled ?? mine;
  if (measured) {
    // Pooled coordinates where there are any, because `mergeAreas` weights each observer by how many
    // positions they brought and widens the spread by how far their centres sit apart — a better
    // answer than either half, and one that can't quietly shrink.
    const shared = contributors.length > 0;
    const source: PlaceSource = shared ? (mine ? "pooled" : "peers") : "yours";
    return {
      y: measured.y,
      x: measured.x,
      spread: measured.spread,
      samples: measured.samples,
      source,
      why: [roamWhy(measured), whose(source, contributors)].filter(Boolean).join(" · "),
    };
  }
  if (wiki?.loc) {
    return {
      y: wiki.loc.y,
      x: wiki.loc.x,
      // No spread and no samples: nothing was measured, and saying "±0 from 0 kills" would dress a
      // claim up as the tightest measurement on the map.
      samples: 0,
      source: "wiki",
      why: `The wiki states this spot${wiki.zone ? ` in ${wiki.zone}` : ""} — where the page says it stands, not where anyone has seen it.`,
    };
  }
  return undefined;
}

/** Whose kills a measured position rests on, when that isn't simply yours. */
function whose(source: PlaceSource, contributors: string[]): string {
  const names = contributors.join(", ");
  if (source === "pooled") return `pooled with ${names}`;
  if (source === "peers") return `${names}' kills, not yours`;
  return "";
}

/** What to call each source in one or two words — the badge beside a position. */
export function placeLabel(source: PlaceSource): string {
  switch (source) {
    case "yours":
      return "your kills";
    case "pooled":
      return "pooled kills";
    case "peers":
      return "peers' kills";
    default:
      return "the wiki";
  }
}
