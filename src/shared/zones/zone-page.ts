/**
 * zone-page.ts — which wiki page a zone name opens.
 *
 * A zone reaches a view however its source spelled it: the log's `Nagafen's Lair - Group`, a
 * gazetteer's `Castle Mistmoore`, a difficulty copy's `Blackburrow 3`. The wiki titles the page
 * `Nagafen's Lair`, `Mistmoore Castle`, `Blackburrow`, so linking the name as written would open a
 * page that isn't there. The zone-levels table is keyed by the wiki's own titles and already has a
 * resolver tuned for these spellings (`typo` + `narrow`, never `fuzzy`), so it answers this too,
 * rather than a third resolver being grown for it.
 *
 * Pure → a tested black box.
 */
import { zoneLevels } from "./levels";
import { placeName } from "./place";

/** The wiki page title a zone name opens: the wiki's own title when we know it, else the place as we name it. */
export function zonePageTitle(zone: string): string {
  return zoneLevels(zone)?.zone ?? placeName(zone);
}

/**
 * Which of these zone names open the same page as `zone` — the Items tab's Zone values that mean this
 * zone, however each source spelled it ("The Feerrott" and "Feerrott", "Castle Mistmoore").
 */
export function spellingsOfZone(zone: string, names: readonly string[]): string[] {
  const page = zonePageTitle(zone);
  return names.filter((name) => zonePageTitle(name) === page);
}
