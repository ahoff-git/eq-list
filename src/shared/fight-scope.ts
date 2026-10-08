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
 * live, once per line — but, since [ADR 0127](../../specs/decisions/0127-an-unknown-name-is-held-not-dropped.md)
 * and [ADR 0128](../../specs/decisions/0128-a-fight-is-re-derived-not-refused.md) gave it somewhere
 * to put a second thought, no longer with *no* way back. `admits` answers one of three ways:
 *
 * - **admit** — the near-certain direction: an ally swung at it, therefore it's an enemy; or
 *   both names are already settled (one's ours or already fought, sides aren't even known yet).
 * - **drop** — both names are already settled *the other way*: each carries an article, so the
 *   game itself says both are creatures, and a creature never turns out to be ours. Nothing could
 *   still change this answer, so there's nothing to wait for.
 * - **hold** — neither of the above: at least one name is bare (no article) and unplaced, so it
 *   could yet prove to be ours — a pet, a group-mate — or an enemy's, and admit the rest of the
 *   fight the way a proven one always has. Not a guess in either direction, just not yet an answer.
 *
 * A held event is kept, not tallied, until the log says who that name is —
 * [combat-stats.ts](../../electron/combat-stats.ts)'s `retryHeld` is what asks again, on every
 * subsequent line (and on a party change, which bypasses this module entirely), because
 * `admits`/`fought` are cheap, pure lookups and there's nothing smarter worth building for "did
 * anything change". The moment one finally admits, `replayHeld` applies it — against the
 * stance, invocation and cast-pairing state it actually had when the line was logged, not
 * whatever is current by the time it's retried, which is the correctness the whole mechanism
 * turns on ([ADR 0284](../../specs/decisions/0284-a-held-event-replays-at-its-own-moment.md)). A
 * held event still unresolved when the fight ends is simply dropped, so the floor stays exactly
 * where it was before any of this.
 *
 * The enemy set is per **fight**, not per session: who we were fighting last pull says
 * nothing about this one, and left to accumulate, a night's mob names would admit half the
 * zone. Names being what they are, "a coyote" inside a fight is any coyote — the same
 * conflation the meter's rows have always made ([ADR 0027](../../specs/decisions/0027-only-your-kills-count.md)'s
 * registry), and the reason someone else killing *your* mob's twin mid-fight still counts.
 *
 * Pure and stateless apart from that set — a black box the tracker asks and resets. The held
 * queue this now feeds is a different kind of state (the events themselves, waiting, not just
 * who they're against) and deliberately lives beside `doubted`/`held`/`heldIncoming` in
 * `combat-stats.ts` instead of here: this module only ever has to answer "in, out, or not yet"
 * for one event at a time, and what a caller does with "not yet" is its business, not this one's.
 */
import { hasArticle } from "./log-parser";
import { mobKey } from "./mob/mob-stats";
import type { CombatEvent } from "./types";

/** `admits`'s answer — see the module doc for what each one means and who acts on it. */
export type ScopeVerdict = "admit" | "hold" | "drop";

export interface FightScope {
  /**
   * Does this event belong to a fight your side is in? Folds it in as it answers: a swing
   * that involves your side names an enemy, which is what admits the rest of that fight.
   * `"hold"` means neither yet — see the module doc.
   */
  admits(event: CombatEvent): ScopeVerdict;
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
          if (!sidesKnown() || engaged || inFight(event.attacker, event.target)) return "admit";
          // Neither side is in the fight yet. An article forecloses a name for good — the game
          // never writes a player, a pet or a group-mate with one — so hold only while at least
          // one side is still a bare name that could yet prove to be ours.
          return hasArticle(event.attacker) && hasArticle(event.target) ? "drop" : "hold";
        }
        case "heal":
          // A heal is not a statement of opposition, so it never engages anyone — it only
          // rides along with a fight already recognized (yours, or one an enemy is in).
          if (!sidesKnown() || inFight(event.healer, event.target)) return "admit";
          return hasArticle(event.healer) && hasArticle(event.target) ? "drop" : "hold";
        case "cast":
        case "spell-outcome":
          if (!sidesKnown() || inFight(event.caster)) return "admit";
          return hasArticle(event.caster) ? "drop" : "hold";
        case "pet-engage":
          // Addressed to you by your own pet, so it's yours by construction — and it names
          // what the pet was sent at, which is an enemy on the same "our side swung at it"
          // grounds a swing would be. Engaging here is what lets the pet's *first* hit land
          // inside the fight rather than having to open one on its own.
          enemies.add(mobKey(event.target));
          return "admit";
        case "death":
        case "stance":
        case "invocation":
        case "buff-faded":
          // The log only ever writes these about you, so there's nobody else they could belong to.
          return "admit";
      }
    },
    fought: (name) => enemies.has(mobKey(name)),
    reset: () => enemies.clear(),
  };
}
