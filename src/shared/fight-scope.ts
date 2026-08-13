/**
 * fight-scope.ts — "is this line part of a fight my side is in?", decided one event at a
 * time, as the log arrives.
 *
 * EQ logs every swing in earshot, not every swing that's yours — so a shared camp puts other
 * people's business in your log: another group's pull, a guard killing a wanderer, a passing
 * player's fight. Metered, they land in your rows as mobs you never touched and players you
 * never grouped with, and they move every number the panel shows — the session's damage, its
 * DPS, its kill count, the per-mob rates.
 *
 * The rule, in one sentence: **your side, and whatever your side is fighting.**
 *
 * - Your side is you, your pet, your group-mates and theirs (`ours`) — the caller's answer,
 *   since only it knows the character's name and the roster (see `party.ts`).
 * - Anything your side trades blows with joins the fight as an **enemy**, and from then on
 *   its lines count too, whoever they involve. That's what keeps a fight whole: a mob's
 *   damage on a group-mate we hadn't yet recognized, a passer-by who helps kill your mob,
 *   the mob's own healer — all of it is the fight you were in, and dropping it would
 *   understate what the fight cost as surely as counting strangers overstates it.
 * - Everything else is dropped, whole. A fight nobody on your side is in never starts.
 *
 * **Why not [ADR 0053](../../specs/decisions/0053-damage-is-cells-rolled-up.md)'s rule.**
 * `damage-tree.ts` settles sides too, but it does it *over a finished set of cells*, in
 * passes, and it can afford to lean ("an enemy hit it, so it's probably an ally"). This runs
 * live, once per line, with no way back: an event admitted is tallied for good. So only the
 * near-certain direction is used — an ally swung at it, therefore it's an enemy — and the
 * weak one is left out. The two are the same idea at different confidences, on purpose.
 *
 * The enemy set is per **fight**, not per session: who we were fighting last pull says
 * nothing about this one, and left to accumulate, a night's mob names would admit half the
 * zone. Names being what they are, "a coyote" inside a fight is any coyote — the same
 * conflation the meter's rows have always made ([ADR 0027](../../specs/decisions/0027-only-your-kills-count.md)'s
 * registry), and the reason someone else killing *your* mob's twin mid-fight still counts.
 *
 * Pure and stateless apart from that set — a black box the tracker asks and resets.
 */
import { mobKey } from "./mob-stats";
import type { CombatEvent } from "./types";

export interface FightScope {
  /**
   * Does this event belong to a fight your side is in? Folds it in as it answers: a swing
   * that involves your side names an enemy, which is what admits the rest of that fight.
   */
  admits(event: CombatEvent): boolean;
  /** Has your side traded blows with this creature in the fight so far? Any spelling. */
  fought(name: string): boolean;
  /** A new fight — forget who the last one was against. */
  reset(): void;
}

export interface FightScopeOptions {
  /** You, your pet, your group-mates and theirs. Asked live, since the roster grows. */
  ours: (name: string) => boolean;
  /**
   * Can sides be told apart at all? False while the player's own name is unknown, and then
   * **everything is admitted**: with no idea who you are, "not yours" is a claim we can't
   * make, and filtering on it would empty the meter rather than clean it. Same call
   * `damage-tree.ts` makes when no ally appears in the cells. Defaults to true.
   */
  sidesKnown?: () => boolean;
}

export function createFightScope({ ours, sidesKnown = () => true }: FightScopeOptions): FightScope {
  /**
   * What your side is fighting, keyed the way the rest of the app keys a creature (`mobKey`):
   * case- and article-folded, because the log writes "A coyote" at the start of a sentence,
   * "a coyote" mid-line, and the kill line strips the article outright.
   */
  const enemies = new Set<string>();

  /** True if either side of an exchange is ours; marks the other as an enemy when so. */
  const engage = (attacker: string, target: string): boolean => {
    const oursAttacking = ours(attacker);
    const oursDefending = ours(target);
    if (!oursAttacking && !oursDefending) return false;
    if (!oursAttacking) enemies.add(mobKey(attacker));
    if (!oursDefending) enemies.add(mobKey(target));
    return true;
  };

  /** In the fight already: on your side, or something your side is fighting. */
  const inFight = (...names: string[]): boolean =>
    names.some((name) => ours(name) || enemies.has(mobKey(name)));

  return {
    admits(event) {
      switch (event.kind) {
        case "damage":
        case "miss": {
          const engaged = engage(event.attacker, event.target);
          return !sidesKnown() || engaged || inFight(event.attacker, event.target);
        }
        case "heal":
          // A heal is not a statement of opposition, so it never engages anyone — it only
          // rides along with a fight already recognized (yours, or one an enemy is in).
          return !sidesKnown() || inFight(event.healer, event.target);
        case "cast":
        case "spell-outcome":
          return !sidesKnown() || inFight(event.caster);
        case "pet-engage":
          // Addressed to you by your own pet, so it's yours by construction — and it names
          // what the pet was sent at, which is an enemy on the same "our side swung at it"
          // grounds a swing would be. Engaging here is what lets the pet's *first* hit land
          // inside the fight rather than having to open one on its own.
          enemies.add(mobKey(event.target));
          return true;
        case "death":
        case "stance":
        case "invocation":
        case "buff-faded":
          // The log only ever writes these about you, so there's nobody else they could belong to.
          return true;
      }
    },
    fought: (name) => enemies.has(mobKey(name)),
    reset: () => enemies.clear(),
  };
}
