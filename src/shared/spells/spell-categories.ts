/**
 * spell-categories.ts — what kind of spell this is, in the game's own words.
 *
 * "Show me every charm" is a question the wiki's text answers only by accident: Solon's Song of the
 * Sirens says "charms", Cajoling Whispers says "control them", and a search for either word misses
 * the other. The game itself has already answered it. Every row of `spells_us.txt` is filed under a
 * spellbook **category** and **subcategory** (`IDX.category` in [spell-file.ts](./spell-file.ts)),
 * and those are ids into `dbstr_us.txt`, the client's string table, where type `5` is the list of
 * spell category names — the same headings the in-game spellbook groups by. So this is a published
 * taxonomy, not one we invented: `Direct Damage › Fire`, `Utility Detrimental › Charm`,
 * `Utility Detrimental › Enthrall` (mez).
 *
 * Pure: text in, names out. `electron/spells.ts` finds the file and joins it to a spell.
 */

/** The `dbstr_us.txt` string type that holds spell category names. */
const CATEGORY_STRING_TYPE = "5";

/** How a category and its subcategory read together: `Utility Detrimental › Charm`. */
export const CATEGORY_SEPARATOR = " › ";

/** One spell's place in the spellbook. */
export interface SpellCategory {
  /** The top heading — "Direct Damage", "Heals", "Utility Detrimental". */
  category: string;
  /** The heading under it — "Fire", "Charm". Absent when the file names none. */
  subcategory?: string;
}

/**
 * `dbstr_us.txt` → spell category names by id. Lines are `id^type^text^flag^`; only type 5 is kept.
 * Never throws — a malformed line costs that line.
 */
export function parseSpellCategoryNames(text: string): Map<number, string> {
  const names = new Map<number, string>();
  for (const line of text.split(/\r?\n/)) {
    const [id, type, name] = line.split("^");
    if (type !== CATEGORY_STRING_TYPE || !name?.trim()) continue;
    const n = Number(id);
    if (Number.isInteger(n)) names.set(n, name.trim());
  }
  return names;
}

/**
 * A spell's category, named — or undefined when the file files it nowhere, or names an id the
 * string table doesn't hold. A subcategory that only repeats its category says nothing more, so it
 * is dropped rather than shown as `Heals › Heals`.
 */
export function spellCategory(
  ids: { categoryId?: number; subcategoryId?: number },
  names: ReadonlyMap<number, string>,
): SpellCategory | undefined {
  const category = ids.categoryId !== undefined ? names.get(ids.categoryId) : undefined;
  if (!category) return undefined;
  const sub = ids.subcategoryId !== undefined ? names.get(ids.subcategoryId) : undefined;
  return sub && sub !== category ? { category, subcategory: sub } : { category };
}

/** `Utility Detrimental › Charm`, or just the category when there is no subcategory. */
export function categoryLabel(c: SpellCategory): string {
  return c.subcategory ? `${c.category}${CATEGORY_SEPARATOR}${c.subcategory}` : c.category;
}
