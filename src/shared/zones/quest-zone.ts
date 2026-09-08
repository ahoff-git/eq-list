/**
 * quest-zone.ts — a "Tests" quest's zone, read off its own title.
 *
 * An item's `Related_quests` list names the quest and nothing else (`parseLinkList` reads a bare
 * `<ul>` of links), so the zone an item's quest happens in has to come from the *quest's own* page —
 * its `questTopTable`'s "Start zone" row (`electron/wiki/index.ts`'s `questZones`, built the same way
 * `questLevels` is).
 *
 * eqlwiki's per-class armour "Tests" quests have no such page to read at all: "Wizard Plane of Sky
 * Tests", "Cleric Plane of Sky Tests" and the rest of the set parse as empty pages — no
 * `questTopTable`, no card, no sources, nothing but a title. That title is the only fact left, and it
 * already names the place: strip the trailing "Tests" and what remains is a zone the shared resolver
 * (`./levels`, `narrow` tier) can place — "Wizard Plane of Sky" reads as "Plane of Sky" with one extra
 * word on it, the same way "North Qeynos" reads as "Qeynos".
 *
 * Gated on the "Tests" suffix rather than run over every quest title: most quest names mention a zone
 * only in passing, and reattributing all of them to whatever zone their title is loosest to would
 * mislabel far more items than it fixes. This is the one shape of quest with no other source of a
 * zone at all.
 */
import { zoneLevels } from "./levels";

const TESTS_SUFFIX = /\bTests$/i;

/**
 * The zone named by a "Tests" quest's own title — `undefined` for any other title, or for one that
 * ends in "Tests" but doesn't resolve to a real zone (e.g. "Crusader's Tests").
 */
export function zoneFromTestsQuestTitle(title: string): string | undefined {
  const trimmed = title.trim();
  if (!TESTS_SUFFIX.test(trimmed)) return undefined;
  return zoneLevels(trimmed)?.zone;
}
