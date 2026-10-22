/**
 * character-base.ts — what a character starts with, before gear: its race's base attributes plus its
 * classes' modifiers, from eqlwiki's [Statistics](https://eqlwiki.com/Statistics) page (both tables
 * transcribed as printed). Together with what's worn, that's the character's attribute totals, which
 * decide which band of a conversion each point lands in (`derived-stats.ts`): an AGI point below 75 is
 * worth fifteen times one above it, and an INT point past the 200 soft cap half one below.
 *
 * **Classes add up.** "Your chosen class(es) will also add modifiers" — a trio is taken to carry all
 * three classes' modifiers. The page doesn't say so in as many words; a measured character would.
 *
 * Races are keyed by the item cards' own codes, which is what the Race picker offers, so ticking one
 * race there says who you are, the way ticking classes does.
 *
 * Pure data and lookups → a tested black box.
 */
import type { StatKey } from "./item-stats";

/** The seven attributes, in the page's column order. */
export const ATTRIBUTES = ["str", "sta", "agi", "dex", "wis", "int", "cha"] as const satisfies readonly StatKey[];
export type Attribute = (typeof ATTRIBUTES)[number];
export type Attributes = Record<Attribute, number>;

/** Every attribute's hard cap ("Max (hard-cap): 510"). Points past it do nothing. */
export const ATTRIBUTE_CAP = 510;

const row = (str: number, sta: number, agi: number, dex: number, wis: number, int: number, cha: number): Attributes => ({ str, sta, agi, dex, wis, int, cha });

/** Starting attributes by race, keyed by the cards' race codes. Kerra are the cards' VAH. */
const RACE_BASE: Record<string, Attributes> = {
  BAR: row(103, 95, 82, 70, 70, 60, 55),
  DEF: row(60, 65, 90, 75, 83, 99, 60),
  DWF: row(90, 90, 70, 90, 83, 60, 45),
  ERU: row(60, 70, 70, 70, 83, 107, 70),
  FRG: row(70, 80, 100, 100, 75, 75, 50),
  GNM: row(60, 70, 85, 85, 67, 98, 60),
  HFE: row(70, 70, 90, 85, 60, 75, 75),
  HEF: row(70, 70, 90, 85, 60, 75, 75),
  HFL: row(70, 75, 95, 90, 80, 67, 50),
  HIE: row(55, 65, 85, 70, 95, 92, 80),
  HUM: row(75, 75, 75, 75, 75, 75, 75),
  IKS: row(70, 70, 90, 85, 80, 75, 55),
  VAH: row(90, 75, 90, 70, 70, 65, 65),
  OGR: row(130, 127, 70, 70, 67, 60, 37),
  TRL: row(108, 114, 83, 75, 60, 52, 40),
  ELF: row(65, 65, 95, 80, 80, 75, 75),
};

/** What each class adds to the starting attributes. */
const CLASS_MODS: Record<string, Partial<Attributes>> = {
  Bard: { str: 5, dex: 10, cha: 15 },
  Beastlord: { sta: 10, agi: 5, wis: 10, cha: 5 },
  Berserker: { str: 15, sta: 5, dex: 10 },
  Cleric: { str: 5, sta: 10, wis: 15 },
  Druid: { sta: 15, wis: 15 },
  Enchanter: { int: 15, cha: 15 },
  Magician: { sta: 15, int: 15 },
  Monk: { str: 5, sta: 5, agi: 10, dex: 10 },
  Necromancer: { dex: 15, int: 15 },
  Paladin: { str: 10, sta: 5, wis: 5, cha: 10 },
  Ranger: { str: 5, sta: 10, agi: 10, wis: 5 },
  Rogue: { agi: 15, dex: 15 },
  "Shadow Knight": { str: 10, sta: 5, int: 10, cha: 5 },
  Shaman: { sta: 10, wis: 15, cha: 5 },
  Warrior: { str: 10, sta: 15, agi: 5 },
  Wizard: { sta: 15, int: 15 },
};

/**
 * A character's attributes before gear: its race's base plus every class's modifiers. `undefined`
 * when the race isn't one the page lists — then nothing about bands can be said, and the caller keeps
 * the mid-band rates a geared character usually sees.
 */
export function baseAttributes(race: string | undefined, classes: readonly string[]): Attributes | undefined {
  const base = race ? RACE_BASE[race] : undefined;
  if (!base) return undefined;
  const out = { ...base };
  for (const klass of classes) for (const a of ATTRIBUTES) out[a] += CLASS_MODS[klass]?.[a] ?? 0;
  return out;
}

/** Base plus gear, attribute by attribute (gear is any stat record; non-attributes are ignored). */
export function withGear(base: Attributes, gear: Partial<Record<StatKey, number>>): Attributes {
  const out = { ...base };
  for (const a of ATTRIBUTES) out[a] += gear[a] ?? 0;
  return out;
}
