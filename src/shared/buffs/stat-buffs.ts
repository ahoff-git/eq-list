/**
 * stat-buffs.ts — which buffs and abilities move the stats a stats read measures.
 *
 * A read (`stats-page.ts`) is a snapshot with every buff you had on. When one fades or a new one lands, the
 * figures the game shows move and the snapshot is wrong ([ADR 0369](../../../specs/decisions/0369-a-stale-stats-read-says-so.md)).
 * But most buffs move nothing the planner measures — haste, a rune, a damage shield, levitate — and a reminder
 * that fires for every one is a reminder nobody reads. So this says which do.
 *
 * - **A buff** is classified by the game's own spellbook category (`spell-categories.ts`, the same headings
 *   the in-game spellbook groups by): `Statistic Buffs` (armor class, the seven attributes, resists),
 *   `HP Buffs` (Aegolism, Symbol, Shielding …), and a few like-named categories filed under Utility
 *   Beneficial and Auras. Attack, shielding, fizzle rate and the rest of `Statistic Buffs` change nothing
 *   the page reads; neither does `Regen` (Clarity is mana *regeneration*, not a bigger pool).
 * - **An ability** has no category; the wiki's description is what there is. An ability that names the
 *   stats it raises (Innate Eminence, Innate Spell Resistance, Natural Durability) moves them; one that
 *   lowers a mana cost or adds a regen tick does not. One the catalogue doesn't know is assumed to,
 *   since a wrong "yes" costs a glance and a wrong "no" leaves a stale read standing — except a toggle,
 *   which flips on and off for free all day.
 *
 * Pure → a tested black box.
 */
import { AA_LIST } from "../aa/aa-list";
import type { SpellCategory } from "../spells/spell-categories";

/** Subcategories, under the stat-moving families, that hold buffs the stats page shows. */
const STAT_SUBCATEGORIES = new Set([
  "Armor Class",
  "Strength",
  "Stamina",
  "Agility",
  "Dexterity",
  "Wisdom/Intelligence",
  "Charisma",
  "Mana",
  "Resist Buff",
  "Statistic Buffs",
  "HP Buffs", // `Auras › HP Buffs`: a group aura that raises hit points
]);

/** Families whose members move stats when they are one of `STAT_SUBCATEGORIES`. */
const SHARED_FAMILIES = new Set(["Statistic Buffs", "Utility Beneficial", "Auras"]);

/** Categories that are the whole answer on their own, with no subcategory to read. */
const STAT_CATEGORIES = new Set(["Armor Class", "Resist Buff", "Mana"]);

/**
 * Does a spell filed here change HP, mana, AC, an attribute or a resist? No category (the game file files
 * 16,000 beneficial spells nowhere) is "no": we can't tell, and guessing yes would fire for every unfiled
 * cloak and cure.
 */
export function movesStats(category: SpellCategory | undefined): boolean {
  if (!category) return false;
  if (category.category === "HP Buffs") return true;
  if (STAT_CATEGORIES.has(category.category)) return true;
  if (!SHARED_FAMILIES.has(category.category)) return false;
  // `Statistic Buffs` itself with no subcategory is the generic stat buff.
  const sub = category.subcategory ?? (category.category === "Statistic Buffs" ? "Statistic Buffs" : "");
  return STAT_SUBCATEGORIES.has(sub);
}

/** The AA's own words for what raises a stat: "increases your strength…", "improves your cold, … resistances", "maximum base health". */
const RAISES_A_STAT =
  /\b(?:increases|improves|grants)\b[^.]*\b(?:strength|stamina|agility|dexterity|wisdom|intelligence|charisma|(?:cold|disease|fire|magic|poison)\b[^.]*\bresist|maximum (?:base )?(?:health|hit points|mana|endurance)|armor class)/i;

/** `Symphonic Aura: Enabled` / `: Disabled` — a toggle the game reports as spending 0 points, over and over. */
const TOGGLE = /:\s*(?:enabled|disabled)$/i;

const BY_NAME = new Map(AA_LIST.map((aa) => [aa.name.toLowerCase(), aa]));

/** Does buying this ability (or a rank of it) change a stat the stats page shows? */
export function abilityMovesStats(name: string): boolean {
  if (TOGGLE.test(name.trim())) return false;
  const known = BY_NAME.get(name.trim().toLowerCase());
  if (!known) return true;
  return RAISES_A_STAT.test(known.description);
}
