/**
 * Which factions a race unlock needs, and how to raise them — from Alanna's Race Unlock Guide
 * ([ADR 0222](../../specs/decisions/0222-a-race-unlock-guide-is-generated-static-data.md)).
 *
 * A thin, hand-written lookup over the generated table, the same split `zones/expansions.ts` makes
 * over `expansions.generated.ts`: the data is regenerated wholesale from the wiki, the lookups over it
 * are not.
 */
import { RACE_UNLOCKS, RACE_UNLOCK_SOURCE, type RaceUnlockRequirement } from "./race-unlocks.generated";

export type { RaceUnlockFactionHit, RaceUnlockHitGroup, RaceUnlockMethod, RaceUnlockRequirement } from "./race-unlocks.generated";
export { RACE_UNLOCKS, RACE_UNLOCK_SOURCE };

/**
 * A community-compiled condensed summary of the same guide, cited by name so the app credits it
 * rather than silently duplicating it — used to verify the scraper's own reading of the wiki page,
 * not itself scraped or re-fetched (it's a forum post, not a source this app can crawl). Fixed and
 * singular on purpose: `electron/ipc.ts`'s handler opens exactly this URL, nothing user-supplied.
 */
export const RACE_UNLOCK_CHEAT_SHEET_URL =
  "https://www.necrotalk.com/forum/everquest-legends/systems-mechanics/279737-race-unlock-cheat-sheet-all-races-factions-methods-2026";

/** The factions a race's unlock achievement needs maxed, or `[]` for a race unlocked some other way
 *  (a prerequisite race, a task) — see `RaceUnlockRequirement.kind`. */
export function factionsForRace(race: string): readonly string[] {
  const r = RACE_UNLOCKS.find((u) => u.race === race);
  return r?.kind === "factions" ? r.factions : [];
}

/** Every race whose unlock needs the given faction maxed. */
export function racesRequiringFaction(faction: string): readonly string[] {
  return RACE_UNLOCKS.filter((u): u is RaceUnlockRequirement & { kind: "factions" } => u.kind === "factions" && u.factions.includes(faction)).map(
    (u) => u.race,
  );
}

/** A run of plain text, or one `[[Title]]`/`[[Title|Display]]` link, in the order they appear. */
export type WikiTextSegment = { text: string; link?: undefined } | { text?: undefined; link: { title: string; display: string } };

/**
 * A guide step's raw wikitext, split into plain-text runs and links — so a step like "Hail any class
 * GM in [[Kerra Isle]] to be assigned this task" renders as running prose with exactly one clickable
 * word in it, rather than a plain-text sentence plus a disconnected list of every link it happened to
 * mention (see `race-unlocks.generated.ts`'s header for why steps are kept raw).
 */
export function wikiLinksIn(raw: string): WikiTextSegment[] {
  const segments: WikiTextSegment[] = [];
  const re = /\[\[([^\]|]+)\|?([^\]]*)\]\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m.index > last) segments.push({ text: raw.slice(last, m.index) });
    segments.push({ link: { title: m[1].trim(), display: (m[2] || m[1]).trim() } });
    last = re.lastIndex;
  }
  if (last < raw.length) segments.push({ text: raw.slice(last) });
  return segments;
}
