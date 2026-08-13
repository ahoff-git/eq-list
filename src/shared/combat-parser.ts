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
  BuffFadedEvent,
  CastEvent,
  CombatEvent,
  DamageEvent,
  DeathEvent,
  HealEvent,
  InvocationEvent,
  MissEvent,
  PetEngageEvent,
  StanceEvent,
  SpellOutcome,
  SpellOutcomeEvent,
  LogLine,
} from "./types";

/** Canonical name for the logging player, whichever case the log used. */
export const SELF = "You";

/**
 * True if `name` is you or something of yours, given your character `player` (blank when
 * unknown). The log writes you three ways and all three are you: **"You"** when you act,
 * your **character name** when a message names you, and **"<Name>`s warder"** for a pet.
 *
 * Shared so the damage meter and the kill log can't disagree about what counts as yours —
 * two copies drifting is how the Session tab and the map end up with different kill counts.
 */
export function isYours(name: string, player: string): boolean {
  return name === SELF || isTheirs(name, player);
}

/**
 * True if `name` is `owner` or something of theirs — "<Owner>`s warder" (a backtick, not an
 * apostrophe), which is the only ownership the log ever states.
 *
 * The same question asked of somebody who isn't you: a group-mate's pet is the group-mate's,
 * and the meter has to be able to say so without pretending the pet is yours (see
 * `src/shared/party.ts`). `player` blank means nobody, not everybody.
 */
export function isTheirs(name: string, owner: string): boolean {
  if (!owner) return false;
  const lower = name.toLowerCase();
  const them = owner.toLowerCase();
  return lower === them || lower.startsWith(`${them}\``);
}

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
 * Base (first-person, singular) form of each verb, so a mob's "slashes" and your "slash"
 * tally as one skill. Built from the list above — every verb is a `plural, singular` pair —
 * so `MELEE_VERBS` stays the single source of truth for what a swing can be called.
 */
const MELEE_VERB_BASE = new Map<string, string>();
for (let i = 0; i < MELEE_VERBS.length; i += 2) {
  MELEE_VERB_BASE.set(MELEE_VERBS[i], MELEE_VERBS[i + 1]);
  MELEE_VERB_BASE.set(MELEE_VERBS[i + 1], MELEE_VERBS[i + 1]);
}

/** The skill behind a swing — its base verb, Title-cased: "slashes"/"slash" → "Slash". */
export function meleeSkill(verb: string): string {
  const base = MELEE_VERB_BASE.get(verb.toLowerCase()) ?? verb.toLowerCase();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

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

/**
 * A swing that didn't land. Two grammars, because EQ words a plain whiff and an active
 * defence differently: "…but misses!" versus "…but YOU dodge!" / "…but a wild tiger parries!".
 * Both are misses to the attacker, and dropping the second sort understates every hit rate —
 * the player's own log had 92 of them, all invisible.
 */
const AVOIDANCE = "dodge|dodges|parry|parries|block|blocks|riposte|ripostes";
const MISS_RE = new RegExp(
  `^(?<attacker>.+?) (?:tries|try) to (?<verb>\\w+) (?<target>.+?), but ` +
    `(?:miss(?:es)?|(?<defender>.+?) (?<avoided>${AVOIDANCE}))!${QUALIFIER}`,
);

/** "dodges" / "parries" → "dodge" / "parry", so the two spellings tally as one. */
function avoidanceKind(word: string): MissEvent["avoidance"] {
  const w = word.toLowerCase();
  if (w.startsWith("dodge")) return "dodge";
  if (w.startsWith("parr")) return "parry";
  if (w.startsWith("block")) return "block";
  return "riposte";
}

// Damage-over-time ticks. The "from <dot> by <source>" form names who applied it;
// the shorter "by <dot>" form doesn't, so the DoT itself becomes the attacker and the event
// says so (`casterUnknown`) — `dot-attribution.ts` is what puts the caster back, from the
// cast line the log wrote earlier.
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
 * A pet confirming an attack order to its owner: `Garn told you, 'Attacking a coyote Master.'`
 *
 * The pet's name is one token (EQ names pets without spaces), and the quote is written with
 * apostrophes in every line seen — but both are kept loose, since the cost of a stray quote
 * style is a pet whose damage silently stops counting. `tells`/`told` likewise: the tense is
 * not worth a bug report to confirm.
 *
 * Matching the trailing `Master.` is what keeps this off ordinary tells — a player saying
 * "Attacking the left one Master." to you is the only false positive available, and they'd
 * have to be named like a pet and say the word. See `PetEngageEvent`.
 */
const PET_ENGAGE_RE =
  /^(?<pet>\S+) (?:tells|told) you, ['"](?:Attacking |Attacking, )(?<target>.+?) Master\.['"]$/i;

/**
 * Your own death. `parseKillLine` deliberately ignores these (they're not kills you
 * made), but the damage meter wants them: what killed you, and what was landing in the
 * seconds before. "You died." carries no killer.
 */
const DEATH_RES = [/^You have been slain by (?<killer>.+?)!$/, /^You died\.$/];

/**
 * A spell expiring. The generic sentence covers three cases:
 *
 *     Your Spirit of Wolf spell has worn off.                    a buff on you
 *     Your pet's Burst of Strength spell has worn off.            one on your pet
 *     Your Root spell has worn off of a wild tiger.               one you cast on something else
 *
 * …except that EQL **never prints the first one**. Measured on a 15MB log: 134 "worn off of
 * <someone>", 63 "worn off." — every one of the 63 a pet's — and not a single generic line for a
 * buff on you. A buff leaving *you* is always EQ's per-spell flavour text instead, which is why a
 * fade watch appeared to fire only for other people:
 *
 *     Your strength fades. / The light breeze fades.              (145 lines)
 *     The spirit of travel leaves you. / Your strength leaves you. (94 lines)
 *     Your speed returns to normal.                                (4 lines)
 *
 * Flavour text names no spell, so `spell` holds the words the log used ("light breeze", "spirit
 * of travel"). Often that *is* the spell — a Breeze watch matches "the light breeze fades" — but
 * where it isn't ("Fleeting Fury" → "your fury fades"), the watch has to hold the words.
 *
 * Both articles appear ("Your strength fades", "The light breeze fades") and neither predicts
 * which, so both are accepted. Note `<Name> fades away.` is somebody gating out, not a spell —
 * requiring "fades." to *end* the line keeps all 50 of those out.
 */
const FADE_RES = [
  /^Your (?<pet>pet's )?(?<spell>.+?) spell has worn off(?: of (?<target>.+?))?\.$/,
  /^(?:Your|The) (?<spell>.+?) fades\.$/,
  /^(?:Your|The) (?<spell>.+?) leaves you\.$/,
  // "Your speed returns to normal." (snare/haste), "Your skin returns to normal." — plural for
  // the spells that word it about a pair of something.
  /^Your (?<spell>.+?) returns? to normal\.$/,
];

/**
 * Your combat mode. The log announces the *change* first ("You begin to change your
 * stance.") and then names the result — it's the naming line that matters, since only it
 * says which mode is now in force.
 */
const STANCE_RE = /^You assume an? (?<stance>.+?) stance\.$/;
const INVOCATION_RE = /^You begin reciting the (?<invocation>.+?) invocation\.$/;

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
  return name.trim().replace(RANK_RE, "");
}

/** The rank the cast line stated ("VI"), if any — the wiki keys its pages by it. */
export function spellRank(name: string): string | undefined {
  return name.trim().match(RANK_RE)?.[1];
}

const RANK_RE = / ([IVXL]+)$/;

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
export function parseCombat(line: LogLine): CombatEvent | null {
  const { message, at, raw, logId } = line;

  const spell = message.match(SPELL_RE);
  if (spell?.groups) return damage(spell.groups, line, false);

  const melee = message.match(MELEE_RE);
  if (melee?.groups) return damage(melee.groups, line, true);

  const shield = message.match(SHIELD_RE);
  if (shield?.groups) return damage(shield.groups, line, false);

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
      // The short form named nobody, so `attacker` above is the DoT standing in for a caster.
      casterUnknown: attacker ? undefined : true,
      logId,
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
      avoidance: miss.groups.avoided ? avoidanceKind(miss.groups.avoided) : undefined,
      logId,
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
      logId,
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
      logId,
      at,
      raw,
    } satisfies DeathEvent;
  }

  for (const re of FADE_RES) {
    const fade = message.match(re);
    if (!fade?.groups) continue;
    const named = fade.groups.target;
    // "worn off of you" (or "of yourself") is still your own buff, so a reflexive target drops
    // away — leaving "no target" to mean exactly one thing: it was on you.
    const on = named && !REFLEXIVE.has(named.toLowerCase()) ? combatant(named) : undefined;
    return {
      kind: "buff-faded",
      spell: spellName(fade.groups.spell),
      pet: !!fade.groups.pet,
      target: on === SELF ? undefined : on,
      logId,
      at,
      raw,
    } satisfies BuffFadedEvent;
  }

  const stance = message.match(STANCE_RE);
  if (stance?.groups) {
    return { kind: "stance", stance: stance.groups.stance, logId, at, raw } satisfies StanceEvent;
  }

  const invocation = message.match(INVOCATION_RE);
  if (invocation?.groups) {
    return {
      kind: "invocation",
      invocation: invocation.groups.invocation,
      logId,
      at,
      raw,
    } satisfies InvocationEvent;
  }

  const petEngage = message.match(PET_ENGAGE_RE);
  if (petEngage?.groups) {
    return {
      kind: "pet-engage",
      pet: petEngage.groups.pet,
      target: combatant(petEngage.groups.target),
      logId,
      at,
      raw,
    } satisfies PetEngageEvent;
  }

  const cast = message.match(CAST_RE);
  if (cast?.groups) {
    return {
      kind: "cast",
      caster: combatant(cast.groups.caster),
      spell: spellName(cast.groups.spell),
      rank: spellRank(cast.groups.spell),
      logId,
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
      logId,
      at,
      raw,
    } satisfies SpellOutcomeEvent;
  }

  return null;
}

/** Shared shape for the melee/spell/shield damage branches. */
function damage(
  g: Record<string, string | undefined>,
  line: LogLine,
  melee: boolean,
): DamageEvent {
  return {
    kind: "damage",
    attacker: combatant(g.attacker ?? ""),
    target: combatant(g.target ?? ""),
    amount: Number(g.amount),
    verb: g.verb,
    // A damage shield names no spell, so its source word ("flames") stands in. `source` is
    // only ever captured by the shield pattern, which is what makes it the tell.
    spell: g.spell ? spellName(g.spell) : g.source,
    shield: !!g.source,
    damageType: g.type,
    qualifier: g.qualifier,
    melee,
    logId: line.logId,
    at: line.at,
    raw: line.raw,
  };
}
