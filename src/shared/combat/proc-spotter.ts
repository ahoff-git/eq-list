/**
 * proc-spotter.ts — "was that spell hit a proc?", answered from what the log never wrote.
 *
 * A proc lands in EQ Legends exactly as a cast spell does, with nothing to tell them apart:
 *
 *     Astah hit Master Brewer for 48 points of magic damage by Reaving Strike.   ← a weapon proc
 *     You hit a coyote for 12 points of cold damage by Blast of Cold.             ← a cast
 *
 * The difference is the line *before*: a cast is announced ("You begin casting Blast of Cold."),
 * a proc never is. So a spell landing from somebody **never seen casting that spell** is a proc —
 * a weapon's, a buff's (a warder's "Spirit of Lightning Strike"), or a mob's own (a rat's
 * "Plague Rat Disease"). On a real 960,000-line log that rule picks out Reaving Strike, Smiting
 * Strike, Condemnation of Nife and the beastlord warder procs, and leaves every nuke alone
 * ([ADR 0339](../../specs/decisions/0339-a-spell-nobody-cast-is-a-proc.md)).
 *
 * **Its limits.** A spell its attacker *also* casts never reads as a proc — a Vampiric Embrace
 * buff procs a spell of the same name, and those landings stay with the casts; your own unpaired
 * landings of a spell you cast are the tracker's "free casts" instead. And a group-mate's nuke
 * whose cast line fell outside log range reads as a proc of theirs until their next cast is seen.
 */
import type { CombatEvent, DamageEvent } from "../types";

export interface ProcSpotter {
  /**
   * Take note of an event. Only cast lines teach it anything, but it's handed everything so the
   * caller has one call to make and no rule to remember — the same contract as `DotAttribution`.
   */
  note(event: CombatEvent): void;
  /** True for a spell's landing (not a tick, not a damage shield) its attacker was never seen casting. */
  isProc(event: CombatEvent): event is DamageEvent;
}

/** One key per (caster, spell) — joined on a character no log line can contain. */
const key = (caster: string, spell: string): string => `${caster.toLowerCase()}\u0000${spell}`;

export function createProcSpotter(): ProcSpotter {
  /** Who has been seen casting what. Knowledge, not a tally — nothing here is ever forgotten. */
  const casts = new Set<string>();

  return {
    note(event) {
      // Anyone's cast: a group-mate's nuke is theirs to cast, and must not read as their proc.
      if (event.kind === "cast") casts.add(key(event.caster, event.spell));
    },

    isProc(event): event is DamageEvent {
      if (event.kind !== "damage" || !event.spell || event.melee || event.tick || event.shield) return false;
      return !casts.has(key(event.attacker, event.spell));
    },
  };
}
