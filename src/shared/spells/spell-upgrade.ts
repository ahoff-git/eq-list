/**
 * spell-upgrade.ts — what a spell (or song) becomes at upgrade level N.
 *
 * EQL spells level 0–10 like items do, and the log says so on the cast line: `You begin casting
 * Shock of Lightning VI`. The game file has no row for that — the server applies the level at
 * runtime — so the only statement of what a level *does* is eqlwiki's spell-page slider
 * (`ext.spellLevelSlider`, kept verbatim at `fixtures/wiki/ext.spellLevelSlider.js`). This is its
 * arithmetic: per category, a straight percentage per level on cast time, mana and duration; +1 per
 * level on an "up to level N" cap; and a pet summoned a level higher. **Damage and heal amounts never
 * move** (ADR 0312).
 *
 * The one place we part from the wiki is *which* category a spell is. The wiki guesses from page
 * prose and gets a fair share of bard songs wrong (a resist psalm as a DoT, a damage-shield rondo as a
 * nuke); the game files every spell in its own spellbook (ADR 0306), so that wins when we have it.
 * `ruleFromCard` — the wiki's own guess, ported — is the fallback for a build with no game file.
 *
 * Pure and DOM-free.
 */

import type { SpellCategory } from "./spell-categories";
import type { SpellFacts } from "./spell-file";

/** The highest upgrade level a spell can reach. */
export const MAX_SPELL_LEVEL = 10;

/** The wiki's rule profiles, as `wgSpellLevelSliderRules` served them on 2026-10-20. */
export type SpellRuleKey = "nuke_lifetap" | "dot" | "heal" | "hot" | "debuff" | "charm_mez" | "pet" | "buff";

export interface SpellLevelRule {
  key: SpellRuleKey;
  label: string;
  /** Change per level as a fraction (−0.04 is 4% faster/cheaper); null when the profile leaves it. */
  cast: number | null;
  mana: number | null;
  duration: number | null;
  /** Pet levels gained per spell level. */
  petLevel?: number;
}

export const SPELL_LEVEL_RULES: Readonly<Record<SpellRuleKey, SpellLevelRule>> = {
  nuke_lifetap: { key: "nuke_lifetap", label: "Nuke / lifetap", cast: -0.02, mana: -0.02, duration: null },
  dot: { key: "dot", label: "DoT", cast: -0.04, mana: -0.02, duration: 0.05 },
  heal: { key: "heal", label: "Heal", cast: -0.04, mana: -0.02, duration: null },
  hot: { key: "hot", label: "HoT", cast: -0.04, mana: -0.02, duration: 0.05 },
  debuff: { key: "debuff", label: "Debuff", cast: -0.04, mana: -0.04, duration: 0.1 },
  charm_mez: { key: "charm_mez", label: "Charm / mez", cast: -0.04, mana: -0.04, duration: 0.1 },
  pet: { key: "pet", label: "Pet", cast: null, mana: null, duration: null, petLevel: 1 },
  buff: { key: "buff", label: "Buff", cast: -0.04, mana: -0.04, duration: 0.1 },
};

const ROMAN: Readonly<Record<string, number>> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };

/** The level a cast line's roman numeral states (`"VI"` → 6); 0 for none or one we can't read. */
export function rankLevel(rank: string | undefined): number {
  return (rank && ROMAN[rank.trim().toUpperCase()]) || 0;
}

/** Clamp to the ladder: whole levels 0…10. */
export function clampSpellLevel(level: number): number {
  return Math.max(0, Math.min(MAX_SPELL_LEVEL, Math.trunc(level) || 0));
}

// ---- Which rule a spell follows ----

/**
 * The rule for a spell the game has filed, or undefined when its kind doesn't level (a port, a
 * summoned item, a discipline). Mirrors the wiki's profiles onto the spellbook's own headings.
 */
export function ruleForCategory({ category, subcategory }: SpellCategory): SpellLevelRule | undefined {
  const rule = (key: SpellRuleKey) => SPELL_LEVEL_RULES[key];
  switch (category) {
    case "Direct Damage":
      return rule("nuke_lifetap");
    case "Damage Over Time":
      return rule("dot");
    case "Taps":
      return subcategory === "Duration Tap" ? rule("dot") : subcategory === "Create Item" ? undefined : rule("nuke_lifetap");
    case "Heals":
      if (subcategory === "Cure" || subcategory === "Resurrection") return undefined;
      return subcategory === "Duration Heals" ? rule("hot") : rule("heal");
    case "Utility Detrimental":
      return subcategory === "Charm" || subcategory === "Enthrall" ? rule("charm_mez") : rule("debuff");
    case "Pet":
      if (subcategory?.startsWith("Sum:")) return rule("pet");
      return subcategory === "Heals" ? rule("heal") : rule("buff");
    case "Statistic Buffs":
    case "HP Buffs":
    case "Utility Beneficial":
    case "Regen":
    case "Auras":
    case "Pet Misc Buffs":
      return rule("buff");
    default:
      // Transport, Create Item, Objects, Disciplines, Combat Abilities, Traps: the wiki leaves these
      // unscaled too (its "beneficial instant utility" refusal), so we don't invent a profile.
      return undefined;
  }
}

/** Card lines, read the way the wiki's classifier reads a spell page. */
function cardContext(lines: readonly string[]) {
  const value = (label: string) =>
    lines.find((l) => l.toLowerCase().startsWith(`${label.toLowerCase()}:`))?.slice(label.length + 1).trim() ?? "";
  const classesAt = lines.findIndex((l) => /^Classes:/i.test(l));
  const manaAt = lines.findIndex((l) => /^Mana:/i.test(l));
  const effects = lines.slice(classesAt + 1, manaAt > classesAt ? manaAt : undefined);
  return {
    spellType: value("Spell Type").toLowerCase(),
    targetType: value("Target Type").toLowerCase(),
    duration: value("Duration"),
    effects: effects.join(" ").toLowerCase(),
    description: classesAt > 0 ? lines.slice(0, classesAt).join(" ").toLowerCase() : "",
    effectCount: effects.length,
  };
}

/** Seconds in a duration's longest component (`"2 hours 24 minutes"` → 7200), for "is it short". */
function longestDurationSeconds(text: string): number {
  let longest = 0;
  for (const m of text.matchAll(DURATION_NUMBER_RE)) longest = Math.max(longest, Number(m[1]) * unitSeconds(m[3]));
  return longest;
}

/**
 * The wiki's own classifier, ported, for a spell we have no game-file category for. Precedence is
 * the wiki's: a DoT before a nuke, a HoT before a buff, a summoned pet, then charm/mez.
 */
export function ruleFromCard(lines: readonly string[] | undefined): SpellLevelRule | undefined {
  if (!lines?.length) return undefined;
  const c = cardContext(lines);
  const combined = `${c.effects} ${c.description}`;
  const instant = /^instant\b/i.test(c.duration);
  const hasDamage =
    /\bdecrease\s+(?:hitpoints?|hit\s+points?|hp)\b/.test(c.effects) ||
    /\b(?:deal|deals|dealing|cause|causes|causing|inflict|inflicts|inflicting)\b[^.]{0,80}\bdamage\b/.test(combined);
  const damagePerTick =
    /\b(?:decrease\s+(?:hitpoints?|hit\s+points?|hp)|damage)\b[^.]{0,100}\bper\s+tick\b/.test(c.effects) ||
    /\bper\s+tick\b[^.]{0,100}\b(?:decrease\s+(?:hitpoints?|hit\s+points?|hp)|damage)\b/.test(c.effects);
  const healingPerTick =
    /\bincrease\s+(?:current\s+)?(?:hitpoints?|hit\s+points?|hp)\b[^.]{0,100}\bper\s+tick\b/.test(c.effects) ||
    /\bheal(?:s|ing|ed)?\b[^.]{0,100}\bper\s+tick\b/.test(combined);
  const longest = longestDurationSeconds(c.duration);
  const rule = (key: SpellRuleKey) => SPELL_LEVEL_RULES[key];

  if (/\bdamage\s+over\s+time\b/.test(c.spellType) || damagePerTick) return rule("dot");
  if (/\bheal\s+over\s+time\b/.test(c.spellType) || (healingPerTick && c.effectCount <= 1 && longest > 0 && longest <= 60)) {
    return rule("hot");
  }
  if (SUMMONED_PET_RE.test(combined)) return rule("pet");
  if (/\bcharm(?:ed|ing)?\b/.test(combined) || /\bmesmeri[sz](?:e|ed|ing|ation)\b/.test(combined)) return rule("charm_mez");
  if (c.spellType === "heal" || (instant && /\bincrease\s+(?:current\s+)?(?:hitpoints?|hit\s+points?|hp)\b/.test(c.effects))) {
    return rule("heal");
  }
  if (/\blifetap\b/.test(c.spellType) || /\blifetap\b/.test(c.targetType) || hasDamage) return rule("nuke_lifetap");
  if (/\bdetrimental\b/.test(c.spellType)) return rule("debuff");
  // A beneficial *instant* (a port, a summon) is left alone rather than guessed to be a buff.
  if ((/\bbeneficial\b/.test(c.spellType) || /\bbuff\b/.test(c.spellType)) && (!instant || /\bbuff\b/.test(c.spellType))) {
    return rule("buff");
  }
  return undefined;
}

/** The game's filing when we have it, the wiki's guess when we don't. */
export function spellLevelRule(
  category: SpellCategory | undefined,
  lines?: readonly string[],
): SpellLevelRule | undefined {
  return category ? ruleForCategory(category) : ruleFromCard(lines);
}

// ---- The arithmetic ----

/** `1 + rate × level`, never below zero — the wiki's `getScaleFactor`. */
function factor(rate: number, level: number): number {
  return Math.max(0, 1 + rate * level);
}

/** The wiki's `roundTo`, epsilon and all, so `x.xx5` lands where its page lands. */
function roundTo(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/**
 * A spell's file facts at `level`. Mana rounds to a whole point, cast time to the hundredth of a second
 * the wiki prints, and the duration ceiling to a whole second (it drives a countdown, not a tooltip).
 * Facts the rule leaves alone come back untouched; level 0 or no rule is the input itself.
 */
export function levelledFacts(facts: SpellFacts, rule: SpellLevelRule | undefined, level: number): SpellFacts {
  const lv = clampSpellLevel(level);
  if (!rule || lv === 0) return facts;
  const out = { ...facts };
  if (rule.mana !== null) out.mana = Math.max(0, Math.round(facts.mana * factor(rule.mana, lv)));
  if (rule.cast !== null) out.castMs = Math.round(roundTo((facts.castMs / 1000) * factor(rule.cast, lv), 2) * 1000);
  if (rule.duration !== null && facts.maxDurationSeconds !== undefined) {
    out.maxDurationSeconds = Math.round(facts.maxDurationSeconds * factor(rule.duration, lv));
  }
  return out;
}

// ---- The card, rewritten ----

const DURATION_NUMBER_RE = /(\d+(?:\.\d+)?)(\s*)(ticks?|seconds?|secs?|sec|s|minutes?|mins?|min|m|hours?|hrs?|hr|h)\b/gi;
const EFFECT_CAP_RE = /(\bup\s+to\s+(?:level\s+|L\s*))(\d+)|(\b(?:Mesmerize|Frenzy Radius|Reaction Radius)\s*\(\s*\d+(?:\.\d+)?\s*\/\s*)(\d+)/gi;
const SUMMONED_PET_RE =
  /\bsummon(?:ed|ing|s)?\b[^.\n]{0,160}?\b(?:lvl|level)\s*\d+[^.\n]{0,160}?\bpet\b|\bsummon(?:ed|ing|s)?\b[^.\n]{0,160}?\bpet\b[^.\n]{0,160}?\b(?:lvl|level)\s*\d+/i;
/**
 * The level number in a summon line. The wiki runs two patterns in turn ("level N … pet", then
 * "pet … level N"), but over DOM text nodes a link has split — so on its real pages each summon's
 * level rises once (`Summon Pet: Level 16 Skeletal Pet` → 19 at III). Over our whole line both would
 * match and double it, so this is one pass: the first level after the summon, once.
 */
const PET_LEVEL_RE = /(\bsummon(?:ed|ing|s)?\b[^.\n]{0,160}?\b(?:lvl|level)\s*)(\d+)/i;

function unitSeconds(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("tick")) return 6;
  if (/^(?:s|sec|secs|second|seconds)$/.test(u)) return 1;
  if (/^(?:m|min|mins|minute|minutes)$/.test(u)) return 60;
  if (/^(?:h|hr|hrs|hour|hours)$/.test(u)) return 3600;
  return 0;
}

/** `2.50` → `"2.5"`; the wiki trims a printed duration the same way. */
function trimDecimal(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function rewriteValue(line: string, label: string, next: (rest: string) => string): string {
  return line.toLowerCase().startsWith(`${label.toLowerCase()}:`)
    ? `${line.slice(0, label.length + 1)} ${next(line.slice(label.length + 1).trim())}`
    : line;
}

/**
 * A spell card's lines at `level`, as the wiki's slider would print them: Mana, Casting Time and
 * Duration rescaled by the rule, "up to level N" caps raised by the level, a summoned pet's level
 * raised by the rule's pet rate. Every other line — the effect amounts above all — is left as printed.
 */
export function levelledSpellLines(lines: readonly string[], rule: SpellLevelRule | undefined, level: number): string[] {
  const lv = clampSpellLevel(level);
  if (!rule || lv === 0) return [...lines];
  return lines.map((line) => {
    let out = line;
    // A value the level doesn't move keeps its printed text (`0`, not `0.00`), as the wiki's does.
    if (rule.mana !== null) {
      out = rewriteValue(out, "Mana", (v) => {
        const base = Number.parseFloat(v);
        const next = Math.max(0, Math.round(base * factor(rule.mana!, lv)));
        return Number.isFinite(base) && next !== base ? String(next) : v;
      });
    }
    if (rule.cast !== null) {
      out = rewriteValue(out, "Casting Time", (v) => {
        const base = Number.parseFloat(v);
        const next = roundTo(base * factor(rule.cast!, lv), 2);
        return Number.isFinite(base) && next !== base ? next.toFixed(2) : v;
      });
    }
    if (rule.duration !== null) {
      out = rewriteValue(out, "Duration", (v) =>
        v.replace(DURATION_NUMBER_RE, (_m, n: string, gap: string, unit: string) =>
          `${trimDecimal(roundTo(Number(n) * factor(rule.duration!, lv), 2), 2)}${gap}${unit}`,
        ),
      );
    }
    out = out.replace(EFFECT_CAP_RE, (_m, p1?: string, n1?: string, p2?: string, n2?: string) =>
      `${p1 ?? p2}${Number(n1 ?? n2) + lv}`,
    );
    if (rule.petLevel && SUMMONED_PET_RE.test(out)) {
      const delta = Math.round(rule.petLevel * lv);
      out = out.replace(PET_LEVEL_RE, (_m, pre: string, n: string) => `${pre}${Number(n) + delta}`);
    }
    return out;
  });
}
