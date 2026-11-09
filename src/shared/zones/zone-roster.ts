/**
 * zone-roster.ts — what a zone page's NPC roster may hold, and what it must not.
 *
 * A zone page's roster is every mob in the zone with its level — the cheap way to learn an item's level
 * ([ADR 0163](../../../specs/decisions/0163-an-item-wears-the-level-of-what-drops-it.md)) and what the zone page
 * lists as its spawns. Kael's page, though, came back with **168 item cards among its 508 "NPCs"**
 * (`A Giant's BroomA Giant's Broom LORE ITEM NO DROP Slot: PRIMARY Skill: 2H Blunt Atk Delay: 40 …`): the loot the page
 * lists beside its mobs, read as more rows of the same table. Cached under three names, so 504 bogus entries; each is
 * a "mob" on the zone page, a name the map's named-spawn pins consider, and a level the walk tries to read.
 *
 * Which rows are cards is told by what an item card says and a mob row never does, so this holds whatever the page's
 * markup does next. Pure and tiny on purpose: it is applied where a page is parsed, where a stored one is read back
 * (so a page already cached is clean without being fetched again) and where a peer's is received.
 */

/** The flags only an item card prints, matched as written: a mob called "Magic Item Merchant" is a mob. */
const CARD_FLAGS = /\b(?:LORE ITEM|MAGIC ITEM|NO DROP|NO TRADE)\b/;
/** The numeric lines of a card, matched on their shape, which no NPC name or level has. */
const CARD_LINES = /\bWT: ?\d|\bSize: ?(?:TINY|SMALL|MEDIUM|LARGE|GIANT)\b|\bAtk Delay: ?\d/i;

const looksLikeCard = (text: string): boolean => CARD_FLAGS.test(text) || CARD_LINES.test(text);

/** Does this row read as an NPC — not an item card that wandered into the roster? */
export function isRosterNpc(row: { name: string; level: string }): boolean {
  return !looksLikeCard(row.name) && !looksLikeCard(row.level);
}

/** A roster with the item cards taken out, otherwise untouched and in order. */
export function cleanRoster<T extends { name: string; level: string }>(rows: readonly T[]): T[] {
  return rows.filter(isRosterNpc);
}
