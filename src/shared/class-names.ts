/**
 * class-names.ts — the sixteen playable classes: the one full spelling the app shows, and the
 * three-letter code the wiki's item cards write instead (`Class: WAR CLR PAL`).
 *
 * A card's `Class:` line is the one place in the catalogue that's abbreviated by design — it's
 * dense because eleven thousand cards repeat it — but a filter dropdown built straight from it
 * shows "BST" instead of "Beastlord", which nobody types looking for a class. This is the one
 * place that translates between the two, so the abbreviation only ever surfaces as a search
 * shortcut, never as the thing displayed.
 */

/** Full class names, in the game's own order — what a class filter or column shows. */
export const CLASS_NAMES = [
  "Warrior",
  "Cleric",
  "Paladin",
  "Ranger",
  "Shadow Knight",
  "Druid",
  "Monk",
  "Bard",
  "Rogue",
  "Shaman",
  "Necromancer",
  "Wizard",
  "Magician",
  "Enchanter",
  "Beastlord",
  "Berserker",
] as const;

export type ClassName = (typeof CLASS_NAMES)[number];

/** The wiki's own three-letter code for each class, same order as `CLASS_NAMES` — what a card's
 *  own `Class:` line is written in (`item-stats.ts`'s `EQ_CLASSES`, which reuses this). */
export const CLASS_ABBREVIATIONS: readonly string[] = [
  "WAR", "CLR", "PAL", "RNG", "SHD", "DRU", "MNK", "BRD", "ROG", "SHM", "NEC", "WIZ", "MAG", "ENC", "BST", "BER",
];

const ABBR_TO_NAME = new Map<string, ClassName>(CLASS_ABBREVIATIONS.map((abbr, i) => [abbr, CLASS_NAMES[i]]));

/**
 * An abbreviation off a `Class:` line → the full name the app shows. Anything not one of the
 * sixteen known codes (a class the wiki already spelled out, a typo) is kept exactly as given —
 * the same "fold what's known, leave the rest" rule `SLOT_TYPOS` follows in `item-stats.ts`.
 */
export function classFullName(code: string): string {
  return ABBR_TO_NAME.get(code.toUpperCase()) ?? code;
}

/**
 * The full name → its abbreviation, for a search box rather than a label: typing "bst" should
 * still find "Beastlord" now that the dropdown no longer shows the code at all.
 */
export const CLASS_SEARCH_ALIASES: ReadonlyMap<string, string> = new Map(
  CLASS_NAMES.map((name, i) => [name, CLASS_ABBREVIATIONS[i]]),
);
