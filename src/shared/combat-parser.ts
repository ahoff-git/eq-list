/**
 * combat-parser.ts — pure functions that turn an EverQuest Legends *combat* log
 * line into a structured event (damage / miss / heal). Same contract as
 * log-parser.ts: no I/O, no state, no Node — a black box the watcher feeds and the
 * damage meter consumes.
 *
 * Every pattern here was read off a real EQL log (6k lines, mixed solo/group/pet
 * play), not invented — the shapes that actually appear are:
 *
 *   melee   A coyote bites Kainos`s warder for 16 points of damage.
 *           You pierce a large plague rat for 6 points of damage.
 *           A coyote bashes Kainos`s warder for 1 point of damage.   ← singular
 *           You kick a kobold scout for 6 points of damage. (Critical)
 *   spell   You hit a coyote for 12 points of cold damage by Blast of Cold.
 *   shield  A female rat is burned by Kainos`s warder's flames for 2 points of
 *           non-melee damage.
 *   miss    Kainos`s warder tries to bite a coyote, but misses!
 *           You try to pierce a large plague rat, but miss!
 *           A kobold scout tries to hit YOU, but misses! (Riposte)
 *   dot     Kainos`s warder has taken 1 damage by Plague Rat Disease.
 *           You have taken 1 damage from Plague Rat Disease by a large plague rat.
 *   heal    You healed Kainos`s warder for 8 hit points.
 *           You healed Kainos`s warder for 1 (20) hit points by Inner Fire.
 *           Hullshamancer healed himself for 10 hit points by Lifespike.
 *   cast    You begin casting Blast of Cold.
 *           Hullshamancer begins casting Lifespike.
 *   outcome Your Blast of Cold spell fizzles!
 *           Your Levitate spell is interrupted.
 *           A coyote resisted your Blast of Cold!
 *           You resist a female rat's Plague Rat Disease!
 *           Your Inner Fire spell did not take hold on Jarn. (Blocked by Courage.)
 *
 * Note EQ writes the player as "You" when acting and "YOU" when acted upon, and
 * pets as "<Owner>`s warder" (a backtick, not an apostrophe). Swings can carry a
 * trailing qualifier — "(Critical)", "(Riposte)" — *after* the full stop, and heals
 * report "effective (attempted)" when they overheal; both were found by running this
 * parser over a whole log and looking at what it failed to match.
 */

import type {
  CastEvent,
  CombatEvent,
  DamageEvent,
  DeathEvent,
  HealEvent,
  MissEvent,
  SpellOutcome,
  SpellOutcomeEvent,
} from "./types";
import { splitTimestamp } from "./log-parser";

/** Canonical name for the logging player, whichever case the log used. */
export const SELF = "You";

/**
 * Melee attack verbs, third-person *and* first-person ("A coyote bites" / "You
 * bite"). The list has to be enumerated rather than matched as `\w+`: the attacker
 * pattern is lazy, so a generic verb would split "A skeleton punches YOU" into
 * attacker "A" + verb "skeleton". Longest-first so "bites" never matches as "bite".
 */
const MELEE_VERBS = [
  "backstabs", "backstab",
  "bashes", "bash",
  "bites", "bite",
  "claws", "claw",
  "cleaves", "cleave",
  "crushes", "crush",
  "gores", "gore",
  "hits", "hit",
  "kicks", "kick",
  "mauls", "maul",
  "pierces", "pierce",
  "punches", "punch",
  "rends", "rend",
  "shoots", "shoot",
  "slams", "slam",
  "slashes", "slash",
  "slices", "slice",
  "smashes", "smash",
  "stings", "sting",
  "strikes", "strike",
] as const;

const VERBS = MELEE_VERBS.join("|");

/**
 * Optional trailing qualifier, e.g. `. (Critical)` / `! (Riposte)`. It sits *outside*
 * the sentence, so every swing pattern has to allow it — anchoring on `\.$` silently
 * dropped every critical hit and riposte.
 */
const QUALIFIER = String.raw`(?: \((?<qualifier>[^)]+)\))?$`;

// `point` is singular for 1 damage, so `points?` throughout.
const MELEE_RE = new RegExp(
  `^(?<attacker>.+?) (?<verb>${VERBS}) (?<target>.+?) for (?<amount>\\d+) points? of damage\\.${QUALIFIER}`,
);

// Spell/proc damage carries a damage type and the spell name; checked before the
// melee pattern so "points of cold damage by X" never reads as a plain swing.
const SPELL_RE = new RegExp(
  `^(?<attacker>.+?) (?:${VERBS}) (?<target>.+?) for (?<amount>\\d+) points? of (?<type>\\w+) damage by (?<spell>.+?)\\.${QUALIFIER}`,
);

/** Damage shields: the *wearer* is the attacker, the one who ran into it is the target. */
const SHIELD_RE = /^(?<target>.+?) is (?<verb>\w+) by (?<attacker>.+?)'s (?<source>\w+) for (?<amount>\d+) points? of (?<type>non-melee) damage\.$/;

const MISS_RE = new RegExp(
  `^(?<attacker>.+?) (?:tries|try) to (?<verb>\\w+) (?<target>.+?), but miss(?:es)?!${QUALIFIER}`,
);

// Damage-over-time ticks. The "from <dot> by <source>" form names who applied it;
// the shorter "by <dot>" form doesn't, so the DoT itself becomes the attacker.
const DOT_FROM_RE = /^(?<target>.+?) (?:has|have) taken (?<amount>\d+) damage from (?<spell>.+?) by (?<attacker>.+?)\.$/;
const DOT_BY_RE = /^(?<target>.+?) (?:has|have) taken (?<amount>\d+) damage by (?<spell>.+?)\.$/;

// "for 8 hit points" or, when it overheals, "for 1 (20) hit points" — the first
// number is what actually landed, which is the one worth metering.
const HEAL_RE = /^(?<healer>.+?) healed (?<target>.+?) for (?<amount>\d+)(?: \((?<attempted>\d+)\))? hit points(?: by (?<spell>.+?))?\.$/;

// ── Casting lifecycle ───────────────────────────────────────────────────────
// A cast's *start* is what makes cast time measurable: pair it with the damage or
// heal that follows (or the outcome that ends it) and the log tells you how long each
// spell actually took. "You begin to change your invocation." is memorization, not a
// cast, and doesn't match ("begin to change" ≠ "begin casting").
const CAST_RE = /^(?<caster>.+?) begins? casting (?<spell>.+?)\.$/;

/**
 * Your own death. `parseKillLine` deliberately ignores these (they're not kills you
 * made), but the damage meter wants them: what killed you, and what was landing in the
 * seconds before. "You died." carries no killer.
 */
const DEATH_RES = [/^You have been slain by (?<killer>.+?)!$/, /^You died\.$/];

/** How a cast ended other than landing. Each resolves the cast in flight. */
const OUTCOME_RES: [outcome: SpellOutcome, re: RegExp][] = [
  ["fizzle", /^Your (?<spell>.+?) spell fizzles!$/],
  ["interrupted", /^Your (?<spell>.+?) spell is interrupted\.$/],
  // Someone shrugged off *our* spell…
  ["resisted", /^(?<target>.+?) resisted your (?<spell>.+?)!$/],
  // …and we shrugged off theirs (their cast, so it's their resist rate, not ours).
  ["resisted", /^You resist (?<caster>.+?)'s (?<spell>.+?)!$/],
  ["blocked", /^Your (?<spell>.+?) spell did not take hold on (?<target>.+?)\.(?: \(.+\))?$/],
];

/**
 * Canonical spell name. EQL writes the **rank** in the cast message ("You begin casting
 * Shock of Lightning VI") but the base name everywhere the spell actually does something
 * ("...by Shock of Lightning"), so keying on the log's wording would file one spell as
 * two — a cast row with no damage and a damage row with no cast time. Stripping a
 * trailing roman numeral makes both sides agree; the untouched line is still in `raw`.
 */
export function spellName(name: string): string {
  return name.trim().replace(/ [IVXL]+$/, "");
}

/** Reflexive heal/damage targets ("healed himself") resolve to the actor. */
const REFLEXIVE = new Set(["himself", "herself", "itself", "themselves", "yourself", "myself"]);

/**
 * Canonical combatant name: the player is always `SELF` ("You"/"YOU"/"your"), and
 * everything else keeps the log's own wording (mob articles included, so "a coyote"
 * and "A coyote" don't become two rows).
 */
export function combatant(name: string): string {
  const trimmed = name.trim();
  if (/^(?:you|your)$/i.test(trimmed)) return SELF;
  // Mobs appear sentence-capitalized at the start of a line and lowercase mid-line.
  return trimmed.replace(/^(An?|The) /, (m) => m.toLowerCase());
}

/**
 * Parse one combat line. Returns null for the ~90% of log lines that aren't combat,
 * so callers can chain this with the other parsers cheaply.
 */
export function parseCombatLine(line: string): CombatEvent | null {
  const raw = line.trim();
  if (!raw) return null;
  const split = splitTimestamp(raw);
  if (!split) return null; // combat lines always carry a timestamp
  const { message, at } = split;

  const spell = message.match(SPELL_RE);
  if (spell?.groups) return damage(spell.groups, at, raw, false);

  const melee = message.match(MELEE_RE);
  if (melee?.groups) return damage(melee.groups, at, raw, true);

  const shield = message.match(SHIELD_RE);
  if (shield?.groups) return damage(shield.groups, at, raw, false);

  const dot = message.match(DOT_FROM_RE) ?? message.match(DOT_BY_RE);
  if (dot?.groups) {
    const { target, amount, spell: dotName, attacker } = dot.groups;
    return {
      kind: "damage",
      attacker: combatant(attacker ?? dotName),
      target: combatant(target),
      amount: Number(amount),
      spell: spellName(dotName),
      melee: false,
      // Flagged so per-spell stats can tell one cast landing from its later ticks.
      tick: true,
      at,
      raw,
    } satisfies DamageEvent;
  }

  const miss = message.match(MISS_RE);
  if (miss?.groups) {
    return {
      kind: "miss",
      attacker: combatant(miss.groups.attacker),
      target: combatant(miss.groups.target),
      verb: miss.groups.verb,
      qualifier: miss.groups.qualifier,
      at,
      raw,
    } satisfies MissEvent;
  }

  const heal = message.match(HEAL_RE);
  if (heal?.groups) {
    const healer = combatant(heal.groups.healer);
    const target = REFLEXIVE.has(heal.groups.target.toLowerCase()) ? healer : combatant(heal.groups.target);
    return {
      kind: "heal",
      healer,
      target,
      amount: Number(heal.groups.amount),
      attempted: heal.groups.attempted ? Number(heal.groups.attempted) : undefined,
      spell: heal.groups.spell ? spellName(heal.groups.spell) : undefined,
      at,
      raw,
    } satisfies HealEvent;
  }

  for (const re of DEATH_RES) {
    const m = message.match(re);
    if (!m) continue;
    return {
      kind: "death",
      victim: SELF,
      killer: m.groups?.killer ? combatant(m.groups.killer) : undefined,
      at,
      raw,
    } satisfies DeathEvent;
  }

  const cast = message.match(CAST_RE);
  if (cast?.groups) {
    return {
      kind: "cast",
      caster: combatant(cast.groups.caster),
      spell: spellName(cast.groups.spell),
      at,
      raw,
    } satisfies CastEvent;
  }

  for (const [outcome, re] of OUTCOME_RES) {
    const m = message.match(re);
    if (!m?.groups) continue;
    // Only the "You resist <their>'s <spell>" form names another caster; in every other
    // form the spell is ours.
    return {
      kind: "spell-outcome",
      caster: m.groups.caster ? combatant(m.groups.caster) : SELF,
      spell: spellName(m.groups.spell),
      outcome,
      target: m.groups.target ? combatant(m.groups.target) : undefined,
      at,
      raw,
    } satisfies SpellOutcomeEvent;
  }

  return null;
}

/** Shared shape for the melee/spell/shield damage branches. */
function damage(g: Record<string, string | undefined>, at: string, raw: string, melee: boolean): DamageEvent {
  return {
    kind: "damage",
    attacker: combatant(g.attacker ?? ""),
    target: combatant(g.target ?? ""),
    amount: Number(g.amount),
    verb: g.verb,
    // A damage shield names no spell, so its source word ("flames") stands in.
    spell: g.spell ? spellName(g.spell) : g.source,
    damageType: g.type,
    qualifier: g.qualifier,
    melee,
    at,
    raw,
  };
}
