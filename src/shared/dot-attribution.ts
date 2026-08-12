/**
 * dot-attribution.ts — "whose damage-over-time is that?", answered from the cast line the
 * log wrote earlier.
 *
 * EQ Legends words a DoT's ticks two ways, and only one of them names anybody:
 *
 *     You have taken 1 damage from Plague Rat Disease by a large plague rat.  ← names the caster
 *     A coyote has taken 5 damage by Engulfing Darkness.                     ← names nobody
 *
 * The short form is the one *your own* DoTs use, and taken at face value it makes every tick
 * of every DoT you cast the work of a combatant called "Engulfing Darkness": the damage lands
 * in a phantom meter row instead of yours, and the spell's own row shows the first landing and
 * nothing after it. On a DoT that is almost all of its damage
 * ([ADR 0071](../../specs/decisions/0071-a-dot-tick-belongs-to-whoever-cast-it.md)).
 *
 * The log does say who cast it — one line earlier, as "You begin casting Engulfing Darkness."
 * Remembering that is the whole trick, and this is that memory: fed every event, asked about
 * the ticks. Pure and stateless apart from the map, so it's a black box the tracker owns.
 *
 * **Its limit.** One caster per spell *name*, last one seen. Two people DoTing with the same
 * spell at once can't be told apart — the tick lines are identical and the casts are the only
 * evidence there is — so the later caster gets the ticks. A spell nobody was seen casting is
 * left exactly as the log wrote it, phantom attacker and all: a guess would be worse than the
 * log's own limit.
 */
import type { CombatEvent, DamageEvent } from "./types";

export interface DotAttribution {
  /**
   * Take note of an event. Only cast lines teach it anything, but it's handed everything so
   * the caller has one call to make and no rule to remember.
   */
  note(event: CombatEvent): void;
  /**
   * The same event with a caster-less tick credited to whoever cast the spell — or the event
   * itself, unchanged, when there's nothing to add. Never mutates what it's given.
   */
  resolve(event: CombatEvent): CombatEvent;
}

export function createDotAttribution(): DotAttribution {
  /** Spell name → the last combatant seen starting to cast it. */
  const casters = new Map<string, string>();

  return {
    note(event) {
      // Anyone's cast, not just yours: a group-mate's DoT is their damage, and filing it under
      // the spell would put a phantom row in the meter just the same.
      if (event.kind === "cast") casters.set(event.spell, event.caster);
    },

    resolve(event) {
      if (event.kind !== "damage" || !event.casterUnknown || !event.spell) return event;
      const caster = casters.get(event.spell);
      if (!caster) return event;
      // `casterUnknown` is cleared, not just overwritten: the attacker is now stated, and a
      // downstream reader must not go on treating the name as a stand-in.
      return { ...event, attacker: caster, casterUnknown: undefined } satisfies DamageEvent;
    },
  };
}
