/**
 * pet-registry.ts — the pets you own, learned from the game telling you so.
 *
 * The rest of the parser reads ownership off the log's possessive form — `Kainos`s warder`,
 * with a backtick — and `isTheirs` in `combat-parser.ts` is built on it. That works for as
 * long as a pet's name *contains its owner's*, and for a pet with **its own name** it doesn't:
 *
 *     Garn hits a coyote for 12 points of damage.
 *
 * is written exactly like a player hitting a coyote. Nothing in that line says whose Garn is,
 * or that Garn is a pet at all. The consequence in this app was worse than a miscredit: with
 * neither side of the exchange recognised as ours, `fight-scope.ts` reads the whole thing as
 * somebody else's business and **drops it**, so a named pet's damage went missing rather than
 * landing on the wrong row.
 *
 * That drop is what [ADR 0127](../../specs/decisions/0127-an-unknown-name-is-held-not-dropped.md)
 * has since decided against — not by guessing sooner, but by **holding** an unplaceable name's data
 * until something in the log decides and then processing it as whatever it turned out to be. Its gate
 * is open: a pet proven three minutes late is proven after the fight it fought in was filed (measured:
 * all 26 such fights), and a stored fight can now be re-derived
 * ([ADR 0128](../../specs/decisions/0128-a-fight-is-re-derived-not-refused.md)) — so re-reading the log
 * already recovers what a settled identity is worth. What is left is the live path: see
 * [todo.md](../../specs/todo.md).
 *
 * **The tell is proof, not a heuristic.** When a pet confirms an attack order —
 *
 *     Garn told you, 'Attacking a coyote Master.'
 *
 * — the game addresses that line to the pet's owner and to nobody else. You cannot see another
 * player's pet confirm orders, so a line reaching *your* log is the game stating that this pet
 * is yours. That's why this registry only ever learns from the tell, and never from the shape
 * of a name: a single-token name is *also* what a group-mate looks like ("Galactic hits a
 * coyote"), so guessing would quietly convert party members into pets and inflate your damage
 * with theirs. A neighbour hit exactly that and left a comment about it (see
 * [neighbours.md](../../specs/neighbours.md) → eql-meter).
 *
 * Deliberately not modelled: whose pet it is. The tell only arrives for **yours**, so an entry
 * here means "mine" and there is no owner field to get wrong. A group-mate's named pet stays
 * invisible, which is the honest answer — the log never told us about it.
 *
 * Stateful, because this is memory; pure otherwise (no I/O, no clock), so it's a black box the
 * tracker feeds and reads — the same shape as `party.ts` next door.
 */

export interface PetRegistry {
  /** Fold in a confirmed pet name. Idempotent, and keeps the first spelling seen. */
  note(pet: string): void;
  /** Is this name a pet the game has told us is ours? */
  has(name: string): boolean;
  /** The pets learned so far, in the order they first spoke. */
  names(): string[];
  clear(): void;
}

export function createPetRegistry(): PetRegistry {
  /**
   * Lowercased name → the spelling the log used. First spelling wins, as everywhere else a
   * name is remembered (`name-registry.ts`, `party.ts`): the log capitalises a name to start a
   * sentence, and the same pet shouldn't come back as a second one.
   */
  const pets = new Map<string, string>();

  return {
    note(pet) {
      const name = pet.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!pets.has(key)) pets.set(key, name);
    },
    has: (name) => !!name && pets.has(name.trim().toLowerCase()),
    names: () => [...pets.values()],
    clear: () => pets.clear(),
  };
}
