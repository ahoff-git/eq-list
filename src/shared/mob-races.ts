/**
 * mob-races.ts — does the mob a kill line named belong to a given race?
 *
 * The table (`mob-races.generated.ts`) is keyed by the wiki's own mob titles, raw; this folds a kill
 * line's name (`KillEvent.target`, already article-and-case as the log wrote it) to match it, the
 * same "raw stored, folded on read" split ADR 0083 already uses for a zone name. A race match is
 * generous on purpose — `race("Iksar")` also finds `"Iksar Citizen"` and `"Spectral Iksar"` — the
 * same rule `goalWantsMob` already applies to a farming goal's mob target, and for the same reason:
 * a player typing (or an achievement author picking) "Iksar" means the family, not one exact page
 * title.
 *
 * A name the table has never heard of (a mob added since the wiki cache was last refreshed, or one
 * this server invented) answers `undefined` rather than a guess — see `raceOf`.
 */
import { MOB_RACES } from "./mob-races.generated";

const byName = new Map<string, string>();
for (const [name, race] of Object.entries(MOB_RACES)) {
  const key = name.trim().toLowerCase();
  if (!byName.has(key)) byName.set(key, race);
}

/** The race the wiki states for this mob's name, or `undefined` if the table has no page for it. */
export function raceOf(name: string): string | undefined {
  return byName.get(name.trim().toLowerCase());
}

/** Does this mob's name belong to `race` — generously, so a family name matches every variant? */
export function isRace(name: string, race: string): boolean {
  const found = raceOf(name);
  return !!found && found.toLowerCase().includes(race.trim().toLowerCase());
}
