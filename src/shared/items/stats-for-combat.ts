/**
 * stats-for-combat.ts — what a stats read answers on the Deaths page.
 *
 * The page asks the player to *tell it* two figures: their maximum hit points (so a hit can be "30% of your
 * health") and their in-combat HP regen per tick (so a long fight isn't credited with more than it took). Both
 * are on the stats page — a pool's max, and the "HP Regen" row — so a read answers them, and the player is
 * not asked. Only what the read was sure of: a figure it guessed at is shown, never filed as the player's own.
 *
 * Pure → a tested black box.
 */
import { confidentValues, type StatsRead } from "./stats-page";

export interface CombatFigures {
  /** Maximum hit points, as the game's own window shows them. */
  maxHp?: number;
  /** HP regen per tick, in combat. */
  hpRegen?: number;
}

/** The figures the Deaths page takes from this read — none for a read that wasn't sure of them. */
export function combatFigures(read: StatsRead): CombatFigures {
  const sure = confidentValues(read);
  return {
    ...(sure.hp !== undefined && sure.hp > 0 && { maxHp: sure.hp }),
    // A read zero is a figure for most stats, but "no regen" the page would call 0 and the estimate would take as
    // "none to discount" — which is what 0 already means there, so it is passed on as it stands.
    ...(sure.hpRegen !== undefined && { hpRegen: sure.hpRegen }),
  };
}
