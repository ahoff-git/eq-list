/**
 * own-landings.ts — "your debuff took hold on X", read off the spell's own landing sentence.
 *
 * A damaging spell lands in the log's own grammar ("You hit a coyote for 30 points of cold damage by
 * Blast of Cold."), and a resist is a fixed sentence too — but a slow, a tash or a snare landing is
 * written as the spell's flavour text with the target's name in front: "Lord Nagafen glances nervously
 * about." Only the game's string file says which spell that is (`spell-strings.ts`'s
 * `landedOnOther`), so this lives beside the parser rather than in it, fed the lexicon's lookup.
 *
 * **Paired with your cast in flight, or nothing.** The sentence is zone-visible and names no caster,
 * so the busy camp's other Tashani reads exactly like yours. It's yours when one of the spells that
 * writes it is the spell you're casting, and only for the first landing (or the same second's —
 * an area debuff writes one sentence per target). This is the same gate `buff-tracker.ts` applies to
 * a landing on somebody else, for the same reason.
 *
 * **Detrimental spells only.** A buff on a group-mate writes the same kind of sentence, and filed as
 * a cell it would read as you going after them ([ADR 0345](../../specs/decisions/0345-a-debuff-lands-by-its-own-sentence.md)).
 *
 * Pure apart from the one slot of state it keeps: no I/O, and the lexicon is injected, so a replay of
 * an old log and the live watcher make the same events.
 */
import { SELF, spellName } from "./combat-parser";
import type { OtherLanding } from "../spells/spell-strings";
import type { CombatEvent, LogLine, SpellLandedEvent } from "../types";

/** `BuffLexicon.landedOnOther` — what a line says landed, on whom. */
export type LandingLookup = (message: string) => OtherLanding | null;

/**
 * How long after a cast begins its landing can still be its own. Generous: it has to cover the
 * longest cast time a debuff has, and a later cast replaces the slot long before this matters.
 */
const LANDING_WINDOW_MS = 15_000;

export interface OwnLandings {
  /** Note a parsed combat event — your casts, and the outcomes that mean a cast will never land. */
  note(event: CombatEvent): void;
  /** Read a raw line: your detrimental spell taking hold on somebody, or null. */
  line(line: LogLine): SpellLandedEvent | null;
}

export function createOwnLandings(lookup: LandingLookup): OwnLandings {
  /** Your cast in flight, and when it first landed (an area spell lands on several in one second). */
  let cast: { spell: string; at: number; landedAt?: number } | null = null;

  return {
    note(event) {
      if (event.kind === "cast" && event.caster === SELF) {
        cast = { spell: event.spell, at: Date.parse(event.at) };
      } else if (event.kind === "spell-outcome" && event.caster === SELF && event.spell === cast?.spell) {
        cast = null; // fizzled, interrupted or resisted: nothing will land
      }
    },

    line(line) {
      if (!cast) return null;
      const landing = lookup(line.message);
      if (!landing || landing.target === SELF) return null;
      const at = Date.parse(line.at);
      if (!(at >= cast.at && at - cast.at <= LANDING_WINDOW_MS)) return null;
      if (cast.landedAt !== undefined && cast.landedAt !== at) return null;
      const wanted = cast.spell.toLowerCase();
      const ours = landing.spells.find((s) => spellName(s.name).toLowerCase() === wanted);
      if (!ours || ours.beneficial) return null;
      cast.landedAt = at;
      return {
        kind: "spell-landed",
        caster: SELF,
        spell: cast.spell,
        target: landing.target,
        at: line.at,
        logId: line.logId,
        raw: line.raw,
      };
    },
  };
}
