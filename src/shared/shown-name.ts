/**
 * shown-name.ts — a name ready to be shown and linked, with its level decided (ADR 0312, ADR 0316).
 *
 * `ItemLink` shows a name's card at the level the name states, so every name it is given has to have
 * had its level settled *somewhere*: built at its level, or known to need none. `ShownName` makes that
 * a type, not a habit — `ItemLink`'s `title` accepts nothing else, so a view that hands it a bare or
 * stripped string doesn't compile. A name becomes a `ShownName` only by one of these:
 *
 * - `gradedTitle` (`items/item-upgrade.ts`) / `rankedSpellTitle` (`combat/combat-parser.ts`) — the
 *   writers: a held item at its grade, a spell at the rank you cast;
 * - `heldAsNamed` — a name passed through **exactly as the game wrote it** (a loot line, a dump row, a
 *   combine, a list entry, a price row), so any `+N` it had reaches the card intact;
 * - `wikiName` — a wiki or catalogue title: the page itself, which is the `+0` thing;
 * - `dropTableName` — a mob's drop table, folded by grade on purpose (a `+2` copy is the same drop,
 *   ADR 0057);
 * - `notAnItem` — a mob, zone, NPC, faction, quest or guide page, which has no level at all.
 *
 * Each marker is the identity at runtime; what it carries is the decision, checked by the compiler at
 * every call site and by `level-paths.test.ts` for what each marker promises.
 */
declare const SHOWN: unique symbol;

/** A name whose level has been decided — the only thing `ItemLink` will link. */
export type ShownName = string & { readonly [SHOWN]: true };

const shown = (name: string): ShownName => name as ShownName;

/** A held thing's name as the game wrote it — any grade or rank in it is kept. */
export const heldAsNamed = shown;
/** A wiki or catalogue title — the `+0` page itself. */
export const wikiName = shown;
/** A name from a mob's drop table, folded by grade on purpose (ADR 0057). */
export const dropTableName = shown;
/** Not an item or a spell — a mob, zone, NPC, faction, quest or guide page. */
export const notAnItem = shown;
