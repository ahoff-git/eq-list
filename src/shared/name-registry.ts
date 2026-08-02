/**
 * name-registry.ts — folding the two spellings EQ gives one creature into one name.
 *
 * A name is capitalized at the start of a sentence and lowercase mid-sentence, so
 * "Obsolete model has been slain by you!" and "You have slain an obsolete model!" are the
 * same mob arriving under two names. Guessing from capitalization alone can't work — real
 * proper nouns exist ("Minotaur Lord", every player's name) — so this remembers the first
 * spelling seen for a name and reuses it thereafter.
 *
 * Case-folding needs memory, which is why it can't live in the stateless line parser. It's
 * shared because more than one tracker needs it and they must agree: the damage meter and
 * the kill log naming the same mob differently is how one mob becomes two rows.
 */

export interface NameRegistry {
  /** The canonical spelling of `name` — the first one this registry saw. */
  canon(name: string): string;
  /** Teach it a spelling without claiming one, e.g. when seeding from stored records. */
  learn(name: string): void;
  /** Forget every spelling — for a tracker whose tallies are being reset anyway. */
  clear(): void;
}

export function createNameRegistry(seed: Iterable<string> = []): NameRegistry {
  /** Lowercased name → the first spelling seen. */
  const names = new Map<string, string>();

  const learn = (name: string): void => {
    const key = name.toLowerCase();
    if (!names.has(key)) names.set(key, name);
  };

  for (const name of seed) learn(name);

  return {
    canon(name) {
      learn(name);
      return names.get(name.toLowerCase()) ?? name;
    },
    learn,
    clear: () => names.clear(),
  };
}
