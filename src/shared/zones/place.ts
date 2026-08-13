/**
 * place.ts — **which place a recorded zone name means.** The read-time half of zone naming.
 *
 * The rule this module exists to enforce: **data is stored with the in-game zone name, exactly as the
 * log wrote it, and every "these are the same camp" judgement happens when the data is read**
 * ([ADR 0083](../../../specs/decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)). A
 * kill record, a stored fight and a retired observation all keep `The Steamfont Mountains 2
 * (Adaptive)`; this is what turns that into "Steamfont Mountains" for a tally, a heatmap or a camp
 * report — and, crucially, what makes fixing a mapping table fix every figure derived from it, retroactively.
 *
 * **A key comes from a table; only a filter may be fuzzy.** `placeName` resolves against the
 * gazetteer's own list of this server's zones ([ADR 0076](../../../specs/decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)),
 * so a group's identity is always a name someone stated. It deliberately does *not* cluster by
 * similarity: clustering depends on what else is in the batch, which would make the same records
 * aggregate differently on different days — the opposite of repeatable. `samePlace` may be looser,
 * because a filter that answers "yes" too often shows extra rows, where a bad *key* invents a camp.
 *
 * A zone no table knows — a Kunark zone, a pack's own map, a Legends custom — keeps its own name,
 * folded only by rule (`zoneBaseName`). That's the no-assumption answer: it groups its own
 * difficulty variants and nothing else.
 *
 * One resolver, built once at module load over ~80 names, because it memoises and the alternative is
 * rebuilding it per aggregation pass.
 *
 * Measured against a real store (2947 records, one peer's 455 observations): the pooled view groups 13
 * of the peer's wordings onto camps we name — `The City of Guk`, `Temple of Cazic-Thule`,
 * `Nagafen's Lair - Solo`, `The Castle of Mistmoore` — and 101 mobs end up with a sample bigger than
 * either of us had alone.
 */

import { zoneBaseName, zoneKey } from "../names";
import { CURATED_ZONES } from "./gazetteer";
import { createZoneResolver } from "./resolve";
import { sameZoneOrMisspelling } from "./spelling";

/**
 * The zones we can name, as the vocabulary a recorded name is matched against.
 *
 * Only this server's zones, from the gazetteer — deliberately not the 350-zone fandom table, since a
 * loose match against a zone the server doesn't run would file real kills under a place you can't go.
 * `typo` is on, so a pack's `Toxulia Forest` finds the log's `Toxxulia Forest`
 * ([ADR 0075](../../../specs/decisions/0075-a-zone-s-misspelling-is-the-same-zone.md)); `narrow` and
 * `fuzzy` are not, because a sub-zone is a different camp and a guess is what this module refuses.
 */
const places = createZoneResolver(CURATED_ZONES, (z) => z.name, { typo: true });

/**
 * The place a recorded zone name means, named the way we name it — the label an aggregate should
 * carry, and the thing to derive a grouping key from.
 *
 * Falls back to the name as recorded (minus difficulty and ruleset, which are facts about a copy of
 * the zone rather than the zone — [ADR 0057](../../../specs/decisions/0057-a-grade-is-not-an-identity.md)).
 */
export function placeName(zone: string): string {
  const base = zoneBaseName(zone);
  return places.resolve(zone)?.name ?? base;
}

/**
 * The key to group by: one string per place. Two records answer to the same key exactly when they
 * belong in the same tally, so nothing else needs to know how a name becomes a place.
 */
export function placeKey(zone: string): string {
  return zoneKey(placeName(zone));
}

/**
 * Are these two names the same place? The table first, then the one-edit rule for a pair the table
 * can't reach at all — a filter is allowed that second chance, because being too generous here shows
 * a row that doesn't belong, while a key that's too generous would merge two camps' samples.
 */
export function samePlace(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return placeKey(a) === placeKey(b) || sameZoneOrMisspelling(a, b);
}
