/**
 * upgrade-view.ts — a page's stat card at an upgrade level, for anything that shows one.
 *
 * Items go `+0`…`+10` (`items/item-upgrade.ts`), spells and songs level 0…X (`spells/spell-upgrade.ts`);
 * the name you hold says where yours is (`Dragoon Dirk +2`, `Shock of Lightning VI`) and the wiki page
 * only ever prints level 0. This is the one place that joins the three: which ladder a page is on, the
 * level a name states, and the card at that level — so the page view's slider and a hover card can't
 * come to disagree about what a +4 looks like.
 *
 * Pure: a page and a number in, a card out.
 */

import { spellName, spellRank } from "./combat/combat-parser";
import { gradedCardLines, gradedTitle, MAX_GRADE } from "./items/item-upgrade";
import { itemGrade } from "./names";
import {
  MAX_SPELL_LEVEL,
  levelledSpellLines,
  rankLevel,
  spellLevelRule,
  type SpellLevelRule,
} from "./spells/spell-upgrade";
import type { ItemCard, WikiPage } from "./types";

type CardPage = Pick<WikiPage, "kind" | "title" | "card" | "spellCategory">;

/** How a page levels: the top of its ladder, and for a spell the rule doing it. */
export type Ladder =
  | { kind: "item"; max: number }
  | { kind: "spell"; max: number; rule: SpellLevelRule };

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/**
 * The ladder a page is on, or undefined when a level wouldn't change a thing on its card — a quest,
 * a mob, an item whose card states nothing the slider scales, a port spell no rule covers.
 */
export function ladderOf(page: CardPage | null | undefined): Ladder | undefined {
  const lines = page?.card?.lines;
  if (!page || !lines?.length) return undefined;
  if (page.kind === "spell") {
    const rule = spellLevelRule(page.spellCategory, lines);
    return rule ? { kind: "spell", max: MAX_SPELL_LEVEL, rule } : undefined;
  }
  if (page.kind !== "item") return undefined;
  const top = gradedCardLines(lines, MAX_GRADE);
  return top.some((l, i) => l !== lines[i]) || top.length !== lines.length ? { kind: "item", max: MAX_GRADE } : undefined;
}

/**
 * The level a held name states: `Dragoon Dirk +2` → 2, `Shock of Lightning VI` → 6, else 0. Only a
 * spell reads a roman numeral — on an item it is part of the name (`Cloak of Flames II`).
 */
export function levelInName(name: string, kind: WikiPage["kind"] | undefined): number {
  if (kind === "spell") return rankLevel(spellRank(name));
  return itemGrade(name) ?? 0;
}

/** The base page a ranked spell name falls back to — the wiki has `Shock of Lightning`, not `… VI`. */
export function unrankedSpellTitle(name: string): string | undefined {
  return spellRank(name) ? spellName(name) : undefined;
}

/** The title a copy at `level` goes by: `Dragoon Dirk +2`, `Shock of Lightning VI`. */
export function levelledTitle(title: string, ladder: Ladder | undefined, level: number): string {
  if (!ladder || level <= 0) return title;
  return ladder.kind === "item" ? gradedTitle(title, level) : `${title} ${ROMAN[Math.min(level, MAX_SPELL_LEVEL)]}`;
}

/** The page's card at `level` — the printed card at 0, or when the page doesn't level. */
export function cardAtLevel(page: CardPage, ladder: Ladder | undefined, level: number): ItemCard | undefined {
  const card = page.card;
  if (!card || !ladder || level <= 0) return card;
  const lines = ladder.kind === "item" ? gradedCardLines(card.lines, level) : levelledSpellLines(card.lines, ladder.rule, level);
  return { ...card, title: levelledTitle(card.title, ladder, level), lines };
}

/** One line saying what a level does, for beside the slider: `Buff · per level: cast −4%, mana −4%, duration +10%`. */
export function ladderNote(ladder: Ladder): string {
  if (ladder.kind === "item") return "10% a grade on bigger stats, +1 on small ones; weight shrinks; delay never moves";
  const { rule } = ladder;
  const pct = (name: string, rate: number | null) =>
    rate === null ? [] : [`${name} ${rate < 0 ? "−" : "+"}${Math.round(Math.abs(rate) * 100)}%`];
  const parts = [...pct("cast", rule.cast), ...pct("mana", rule.mana), ...pct("duration", rule.duration)];
  if (rule.petLevel) parts.push(`pet +${rule.petLevel} level`);
  return `${rule.label} · per level: ${parts.join(", ")}; damage and healing don't change`;
}
