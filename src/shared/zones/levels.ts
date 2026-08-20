/**
 * What level a zone is — the wiki's answer, looked up by whatever name a caller has in hand.
 *
 * The hunt list says where to go; this says whether you can survive there, which is the very next
 * question and the one the list couldn't answer. It comes off the same eqlwiki zone infobox the
 * adjacency table is read from ([ADR 0117](../../../specs/decisions/0117-the-wiki-says-which-zones-touch.md))
 * — one more row, one more shipped table, no new source and no runtime fetch.
 *
 * **Verbatim, never resolved into a span** ([ADR 0122](../../../specs/decisions/0122-a-zone-wears-its-levels.md)).
 * A zone's page writes `1-20, 35` or `29-34 Droga Main, 33-38 Inner Sanctum`, and the min-and-max
 * those would collapse to is a claim the wiki declined to make. Same instinct as a mob's level
 * ([`levels.ts`](../levels.ts)), which widens rather than narrows for the same reason: the honest
 * shape of "what level is this" is a spread, and squeezing it loses the part that matters.
 *
 * Pure and dependency-free apart from the shared zone resolver → a tested black box.
 */

import { createZoneResolver } from "./resolve";
import { ZONE_LEVELS } from "./levels.generated";

export { ZONE_LEVELS };

/** A wiki page title without its trailing `(...)` disambiguator. */
const unqualified = (title: string): string => title.replace(/\s*\([^()]*\)\s*$/, "").trim() || title;

/**
 * The table, asked as loosely as a *warning* may safely be asked.
 *
 * `typo` and `narrower` are in; `fuzzy` is not, and that is the whole judgement here. This answer
 * reads as "this is what you're walking into", so the cost of matching the wrong zone is a person
 * taking a level-8 character somewhere the wiki said 45 — unlike the expansion badge next door, where
 * every tier is allowed because a wrong answer is only a mislabel
 * ([ADR 0068](../../../specs/decisions/0068-a-zone-name-resolves-against-what-we-know.md)). `typo`
 * cannot name a different zone at all, and `narrower` only ever climbs to the zone that contains the
 * one asked for, which is the same danger by definition.
 */
const resolver = createZoneResolver(
  // Matched on the zone's name with the page-title qualifier off — `Cazic Thule (Zone)` is a
  // disambiguator the wiki needs because a god shares the name, and `(Pre-Revamp)`/`(Post-Revamp)`
  // are two versions of one Chardok. None of them is part of what a drop source calls the place, and
  // the resolver's tiers can't drop a word the query never had. The wiki's own title is kept on the
  // result, so the explanation can still say where the figure came from.
  Object.entries(ZONE_LEVELS).map(([zone, levels]) => ({ zone, levels, name: unqualified(zone) })),
  (z) => z.name,
  { typo: true, narrow: true },
);

/** What the wiki says about a zone, when it says anything. */
export interface ZoneLevels {
  /** The zone as the wiki names it — not necessarily the name that was asked for. */
  zone: string;
  /** Its levels, in the wiki's own wording (`"1-12"`, `"1-20, 35"`). */
  levels: string;
}

/** The levels stated for a zone, or `undefined` when the wiki's zone pages don't say. */
export function zoneLevels(zone: string): ZoneLevels | undefined {
  return zone.trim() ? resolver.resolve(zone)?.item : undefined;
}

/**
 * The same thing, ready to show: the wiki's wording with its hyphens set as en dashes, so a range
 * reads as one ("4–15+") rather than as a subtraction, matching `levelText` for a mob.
 *
 * Only *between digits*, because everything else on that row is prose the wiki wrote on purpose.
 * Takes what `zoneLevels` found rather than a name, so a caller that wants both the text and the
 * explanation looks the zone up once.
 */
export function zoneLevelText(found: ZoneLevels): string {
  return found.levels.replace(/(\d)\s*-\s*(\d)/g, "$1–$2");
}

/**
 * Why that range is on screen, for the reader who wants to know how much to trust it.
 *
 * Names the zone the answer actually came from, because the loose tiers mean it can differ from the
 * one asked for — a range labelled with somebody else's zone is worth spotting.
 */
export function zoneLevelWhy(found: ZoneLevels, asked: string): string {
  const from = found.zone === asked.trim() ? "" : ` (eqlwiki's "${found.zone}")`;
  return `eqlwiki says the monsters here are levels ${found.levels}${from} — the zone's own page, not our kills.`;
}
