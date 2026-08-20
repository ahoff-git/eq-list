/**
 * lucy-era.ts — **deciding whether a Lucy item could exist on this server at all.**
 *
 * [Lucy](../../electron/lucy/) is Live EverQuest's item database: twenty-five years of expansions,
 * a few hundred thousand items, and **no era or expansion field anywhere on an item's page**. This
 * server runs Classic through the Planes. Offering its whole catalogue to a shopping list would fill
 * the search box with gear that cannot be obtained, which is the failure the wiki's era flags exist
 * to prevent ([ADR 0124](../../specs/decisions/0124-lucy-is-a-second-opinion.md)).
 *
 * The one era signal Lucy does give is **where it says the thing can be got** — the zones on its
 * "Drops from" and "Sold by" rows — and we already know which zones this server runs, from the
 * supplied gazetteer
 * ([ADR 0076](../../specs/decisions/0076-a-supplied-gazetteer-outranks-our-guesses.md)). So:
 *
 *   - a zone we can place    → the item is **in era** (at least one place you could go);
 *   - zones, none placeable  → **out of era** (Kael Drakkel, Shar Vahl, Stratos);
 *   - no zones at all        → **unknown**, and said so rather than guessed. Quest rewards, crafted
 *     goods and anything Lucy has no source data for land here. It is the honest answer and a common
 *     one.
 *
 * This is a *filter*, not a claim: "in era" means the zone exists here, never that this build's
 * version of that zone drops this item. Lucy is the least trusted source the app has and the wording
 * it produces (`eraWhy`) has to keep saying so.
 *
 * Pure, so the whole judgement is testable against real Lucy zone strings.
 */
import { count } from "./format";
import { zoneBaseName } from "./names";
import { isKnownPlace } from "./zones/place";
import type { LucyEra } from "./types";

/**
 * An expansion tag Lucy appends to a revamped zone: `The Overthere [RoS]`, `Crystal Caverns [ToV]`.
 * It says *which version* of the zone, which is a fact about the copy rather than the place — the
 * same shape of decoration as our own difficulty and ruleset tags
 * ([ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md)), so it folds away the same.
 */
const EXPANSION_TAG_RE = /\s*\[[^\]]*\]\s*$/;

/**
 * Lucy's revamp version, written as a decimal: `West Freeport 2.0`, `Lavastorm Mountains 3.0`.
 *
 * `zoneBaseName` deliberately won't strip this — its own rule wants a bare integer, so that a zone
 * whose name merely *ends* in a digit keeps it. A dotted version is unambiguous enough to fold here.
 */
const REVAMP_VERSION_RE = /\s+\d+\.\d+\s*$/;

/**
 * A parenthesised second name: `Ruins of Old Paineel 2.0 (The Hole)`. Lucy uses it to gloss a
 * renamed zone with the name players know, which is very often **the only placeable half** — so both
 * halves are tried, not just the one outside the brackets.
 */
const PARENTHETICAL_RE = /\(([^()]+)\)/;

/**
 * Every way one of Lucy's zone strings might be read, most literal first.
 *
 * Order is for legibility only — a reading is a candidate, and any one placing the zone is enough.
 */
export function zoneReadings(zone: string): string[] {
  const readings: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (t && !readings.includes(t)) readings.push(t);
  };

  const raw = zone.trim();
  add(raw);

  const gloss = PARENTHETICAL_RE.exec(raw);
  if (gloss) {
    add(gloss[1]);
    add(raw.replace(PARENTHETICAL_RE, ""));
  }

  // Strip Lucy's own decorations from every reading so far, then let ours have a go at what's left.
  for (const r of [...readings]) {
    const bare = r.replace(EXPANSION_TAG_RE, "").replace(REVAMP_VERSION_RE, "");
    add(bare);
    add(zoneBaseName(bare));
  }
  return readings;
}

/**
 * The reading of one of Lucy's zone strings that names a zone we know, or `undefined` when none does.
 *
 * Both the era test and the map link want this: era only cares *whether* there is one, but a link has
 * to know *which*, because the map is keyed on our own name — `Ruins of Old Paineel 2.0 (The Hole)`
 * has no map and `The Hole` has one, and only this can tell you that.
 */
export function placeableReading(zone: string): string | undefined {
  return zoneReadings(zone).find(isKnownPlace);
}

/** Can we place this Lucy zone string at all — under any reading of it? */
export function placeableZone(zone: string): boolean {
  return placeableReading(zone) !== undefined;
}

export interface EraVerdict {
  era: LucyEra;
  /** One sentence naming the evidence. A derived verdict must be able to show its working. */
  why: string;
}

/**
 * The era verdict for an item, from the zones Lucy says it can be got in.
 *
 * `why` names the actual zone that decided it, because that is the sentence a player can check: "it
 * comes from The Hole, which this server runs" is arguable, and "out of era" on its own is not.
 */
export function eraFromSourceZones(zones: readonly string[]): EraVerdict {
  const seen: string[] = [];
  for (const z of zones) {
    const t = z.trim();
    if (t && !seen.includes(t)) seen.push(t);
  }
  if (!seen.length) {
    return {
      era: "unknown",
      why: "Lucy names no mob or merchant for it, so there are no zones to judge the era by — it may be quest or crafted, or Lucy may simply not know.",
    };
  }

  const placeable = seen.filter(placeableZone);
  if (placeable.length) {
    const first = placeable[0];
    const rest = placeable.length > 1 ? ` (and ${count(placeable.length - 1, "other")})` : "";
    return {
      era: "in-era",
      why: `Lucy places it in ${first}${rest}, which this server runs — so the zone exists here, though whether this build's version of it holds the item is another matter.`,
    };
  }
  return {
    era: "out-of-era",
    why: `Every zone Lucy places it in — ${seen.slice(0, 3).join(", ")}${seen.length > 3 ? ", …" : ""} — is one this server doesn't run.`,
  };
}
