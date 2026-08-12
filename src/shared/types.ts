import type { MobKnowledge, MobObservation } from "./mob-stats";
import type { EqMap } from "./map/eqmap";
import type { MapSourceReport } from "./map/map-sources";
import type { TravelAnswer, TravelEnd } from "./travel/route";
import type { TravelOptions } from "./travel/types";

/** A zone's vector map as it crosses IPC: geometry, labels, and who drew it. */
export type LoadedMap = EqMap & { credits: string[] };

export type { MapSourceReport };
/** Re-exported so a renderer can type a route without reaching into the travel module. */
export type { TravelAnswer, TravelEnd, TravelOptions };

/**
 * types.ts — the shared contract between the Electron main process and the
 * renderer. Both sides import these; nothing here may import Node or React so
 * it stays safe on both. The preload bridge (`window.eql`) is typed by `EqlApi`.
 */

// ─── Log lines and events ───────────────────────────────────────────────────

/**
 * A log line with its timestamp already split off — the shape the parsers work on.
 *
 * Splitting happens **once per line**, in `splitLine`, and every parser is handed the
 * result. Before this existed each parser re-ran the same timestamp regex on the same
 * string, so a busy line paid for that work up to seven times.
 */
export interface LogLine {
  /**
   * Monotonic id of the line within this run of the app. It's how an event points back
   * at the text it came from without anything downstream having to keep parsing strings.
   * Not a file line number — the watcher usually starts mid-file.
   */
  logId: number;
  /** ISO timestamp taken from the line's leading bracket. */
  at: string;
  /** The line with the timestamp bracket removed — what the patterns match against. */
  message: string;
  /** The original line, trimmed. Kept for debugging and log-matching, never re-parsed. */
  raw: string;
}

/** What every parsed event carries, so the fields are declared once. */
export interface LogEventBase {
  /** The line this came from (see `LogLine.logId`). */
  logId: number;
  /** The original log line, minus the timestamp bracket. */
  raw: string;
  /** ISO timestamp from the log line. */
  at: string;
}

/**
 * What became of a drop. The log distinguishes all four, and they matter differently: a
 * `sold` item is gone, a `combined` one turned into something else, and a `stored` one is
 * in a depot rather than your bags.
 */
export type LootFate = "kept" | "sold" | "stored" | "combined";

/** A parsed "you looted X from Y" line from the EQ log. */
export interface LootEvent extends LogEventBase {
  kind: "loot";
  /** What happened to it as it was looted. */
  fate: LootFate;
  /** The fate's particulars: the coins it sold for, where it was stored, what it became. */
  detail?: string;
  /**
   * What the vendor paid, in copper — set only on an auto-sell (`fate: "sold"`), where the
   * log states it. This is the *item's* money, kept apart from the coin a corpse hands over:
   * an auto-sell also logs a bare "You receive … from that item" line, and summing both
   * would count the same coins twice (see ADR 0047). For a stack, it's the whole stack's
   * price — divide by `qty` for a unit price.
   */
  soldFor?: number;
  /** Item name, exactly as it appears in the log (leading article stripped). */
  item: string;
  /** How many the line reported ("You looted 2 Spiderling Eye…"); 1 when unstated. */
  qty: number;
  /** Corpse / source name the item came from. */
  source: string;
}

/**
 * What one item vendors for, learned from your own auto-sells. Deliberately separate from a
 * mob's coin (ADR 0047): this is a property of the *item* and holds wherever it dropped, which
 * is what makes it worth remembering at all — the mob figure only describes that mob.
 */
export interface ItemPrice {
  item: string;
  /** Price for one, in copper — a stack's line price divided by the stack. */
  unitCopper: number;
  /** How many of it you've sold, and for how much in total. */
  qty: number;
  copper: number;
  /** Auto-sell lines behind the figure. One is enough for a price; more is confirmation. */
  sales: number;
  lastAt: string;
}

/** A parsed "You have entered <zone>" line — tracks the player's current zone. */
export interface ZoneEvent extends LogEventBase {
  kind: "zone";
  zone: string;
}

/** A parsed "You gain [party] experience! (N%)" line. `pct` present only when shown. */
export interface XpEvent extends LogEventBase {
  kind: "xp";
  party: boolean;
  pct?: number;
}

/** A parsed kill ("You have slain X" / "X has been slain by Y"). `target` is the mob. */
export interface KillEvent extends LogEventBase {
  kind: "kill";
  target: string;
  /**
   * Who landed the killing blow — `"You"`, your pet, another player, or a mob (the log
   * reports deaths in earshot, so plenty of these are nobody's business but their own).
   * Empty only if the line named no killer.
   */
  killer: string;
}

/** A parsed "Your Location is Y, X, Z" line (EQ reports y first). Drives the map. */
export interface LocEvent extends LogEventBase {
  kind: "loc";
  y: number;
  x: number;
  z: number;
}

/**
 * Levelling up. `level` is present only for the numbered "Welcome to level N!" line —
 * the one place the log ever states your level. Either form means the XP-into-level
 * counter starts over.
 */
export interface LevelEvent extends LogEventBase {
  kind: "level";
  level?: number;
}

/**
 * Coin changing hands. The log says how much and from what *kind* of source, never which
 * mob or which item — so `from` is the only thing separating the two money ledgers at the
 * point of parsing, and it's load-bearing (ADR 0047).
 */
export interface CoinEvent extends LogEventBase {
  kind: "coin";
  /** `corpse` — a mob's money. `item` — an auto-sold item's, already known from the loot line. */
  from: "corpse" | "item";
  /** In copper, the canonical unit (see `src/shared/money.ts`). */
  copper: number;
}

/**
 * Logging in — "Welcome to EverQuest Legends!", the first line of a sitting. It's the only
 * thing in the log that marks where one play session ends and the next begins, which is what
 * the history list groups by (ADR 0054). Carries nothing but its timestamp: that *is* the
 * information.
 */
export interface LoginEvent extends LogEventBase {
  kind: "login";
}

/**
 * Your group changing. The log never lists a group's membership, so this is the only way to
 * learn it: one line at a time, as people arrive and leave (see `parseParty`).
 *
 * `cleared` is every wording that means "the group you were in is no longer the group you're
 * in" — disbanded, removed, you left, you joined a fresh one — because they all have the same
 * consequence: what we knew about the roster is now wrong.
 */
export interface PartyEvent extends LogEventBase {
  kind: "party";
  change: "joined" | "left" | "cleared";
  /** Who — absent on `cleared`, which names nobody but you. */
  who?: string;
}

export type LogEvent =
  | LootEvent
  | ZoneEvent
  | XpEvent
  | KillEvent
  | LocEvent
  | LevelEvent
  | CoinEvent
  | LoginEvent
  | PartyEvent;

// ─── Combat events (see combat-parser.ts) ───────────────────────────────────

/**
 * Damage landing on someone — a melee swing, a spell/proc, or a DoT tick. `melee`
 * separates swings from everything else; `spell` is set for spells and DoTs (for a
 * bare DoT tick the log names no caster, so `attacker` falls back to the DoT).
 */
export interface DamageEvent extends LogEventBase {
  kind: "damage";
  attacker: string;
  target: string;
  amount: number;
  /** The attack verb for melee swings ("bites", "pierce"). */
  verb?: string;
  spell?: string;
  /** "cold", "magic", "disease", "non-melee"… when the log names one. */
  damageType?: string;
  /** The log's trailing note on the swing: "Critical", "Riposte", … */
  qualifier?: string;
  melee: boolean;
  /** True for a damage-over-time tick, as opposed to a spell first landing. */
  tick?: boolean;
  /**
   * True for a damage shield ("A female rat is burned by Kainos`s warder's flames …"): the
   * wearer dealt it by *being hit*, not by attacking. There's no spell to name, so `spell`
   * holds the log's source word ("flames") — this flag is what says it isn't a cast.
   */
  shield?: boolean;
}

/** A swing that missed — pairs with `DamageEvent` to give an accuracy figure. */
export interface MissEvent extends LogEventBase {
  kind: "miss";
  attacker: string;
  target: string;
  verb: string;
  /** "Riposte" when the miss was forced by one. */
  qualifier?: string;
  /**
   * How the defender avoided it, when the log says so ("…but YOU dodge!"). Absent for a
   * plain whiff. Either way it's a miss for the attacker; this only names the reason.
   */
  avoidance?: "dodge" | "parry" | "block" | "riposte";
}

/** A heal ("You healed X for N hit points [by <spell>]"). Reflexive → healer. */
export interface HealEvent extends LogEventBase {
  kind: "heal";
  healer: string;
  target: string;
  /** Hit points actually restored. */
  amount: number;
  /** What the heal would have restored, when the log reports an overheal. */
  attempted?: number;
  spell?: string;
}

/**
 * A cast starting ("You begin casting X"). Pairing this with the damage/heal that
 * follows is what makes cast time — and therefore damage-per-second-of-casting —
 * measurable from a log that never states either.
 */
export interface CastEvent extends LogEventBase {
  kind: "cast";
  caster: string;
  /** Canonical name, rank stripped, so the cast and its damage line agree. */
  spell: string;
  /** The rank the log stated ("VI"), kept because the wiki pages are per rank. */
  rank?: string;
}

/** How a cast ended without landing. */
export type SpellOutcome = "fizzle" | "interrupted" | "resisted" | "blocked";

export interface SpellOutcomeEvent extends LogEventBase {
  kind: "spell-outcome";
  caster: string;
  spell: string;
  outcome: SpellOutcome;
  /** Who shrugged it off, when the log names them. */
  target?: string;
}

/** Your own death. `killer` is absent for the bare "You died." line. */
export interface DeathEvent extends LogEventBase {
  kind: "death";
  victim: string;
  killer?: string;
}

/**
 * Your combat mode changed. Stances and invocations apply multipliers and alter cast
 * times, so damage and cast-time figures are only comparable *within* one of them — which
 * is why every tally is split by whichever was active (see ADR 0020).
 */
export interface StanceEvent extends LogEventBase {
  kind: "stance";
  /** "balanced", "evasive"… as the log words it. */
  stance: string;
}

export interface InvocationEvent extends LogEventBase {
  kind: "invocation";
  /** "empowering", "divine", "arcane mastery"… as the log words it. */
  invocation: string;
}

/**
 * A spell of yours expiring — on you, on your pet, or on something you cast it at. Your own
 * may have just changed your max hit points; the others can't, but a watch can still ask to be
 * told (that's the "re-root it" alert).
 */
export interface BuffFadedEvent extends LogEventBase {
  kind: "buff-faded";
  /**
   * The spell as the log named it — or, for EQ's per-spell flavour form ("Your strength
   * fades."), the words it used instead. Those lines name no spell, so a watch that wants them
   * has to match the wording.
   */
  spell: string;
  /** True for "Your pet's X spell has worn off" — irrelevant to *your* own totals. */
  pet: boolean;
  /** Who it wore off, when the log named someone else. Absent means it was on you. */
  target?: string;
}

export type CombatEvent =
  | DamageEvent
  | MissEvent
  | HealEvent
  | CastEvent
  | SpellOutcomeEvent
  | DeathEvent
  | BuffFadedEvent
  | StanceEvent
  | InvocationEvent;

// ─── Damage meter ───────────────────────────────────────────────────────────

/** One row of the damage meter. */
export interface CombatantStat {
  name: string;
  /** Damage dealt / taken by this combatant, and healing it did. */
  dealt: number;
  taken: number;
  healed: number;
  /** Landed and missed swings (melee + spells), for the accuracy figure. */
  hits: number;
  misses: number;
  /** Landed swings the log tagged "(Critical)". */
  crits: number;
  /** Biggest single hit dealt. */
  maxHit: number;
  /**
   * Seconds this combatant was actually fighting (min 1) — the sum of gaps between
   * its damage, excluding downtime. Not the wall-clock span.
   */
  activeSec: number;
  /** `dealt / activeSec`, rounded to one decimal. */
  dps: number;
  /** True for you and your pet — the rows the meter highlights. */
  mine: boolean;
  /**
   * Melee split by the **stance** that was active, for your own rows. Stances change the
   * multipliers, so a blended swing average hides more than it shows. Empty for other
   * people — the log never states their stance.
   */
  byStance: StanceSplit[];
  /**
   * Melee landed, split by the skill/weapon behind it (slash, pierce, crush, kick, backstab…) —
   * as close as the log gets to "which hand/weapon did that", since it names the skill, not the
   * slot. Most-damage first; empty for a combatant that only dealt spell damage.
   */
  byType: MeleeTypeStat[];
  /**
   * Non-melee damage split by source (spell / DoT / proc / damage shield), most-damage first.
   * With `byType` this accounts for the whole `dealt` total — the two halves of "where did my
   * damage come from". Empty for a combatant that only swung.
   */
  bySpell: SpellDamageStat[];
  /**
   * Landed hits the log tagged with a qualifier — Critical, Flurry, Crippling Blow, Riposte, …
   * Whatever the log actually wrote, not a fixed list, so a new tag surfaces on its own. Most
   * frequent first.
   */
  specials: SpecialHitStat[];
}

/** Your melee under a single stance. */
export interface StanceSplit {
  /** The stance active at the time, or "unknown" before the log has told us. */
  stance: string;
  damage: number;
  hits: number;
  misses: number;
  maxHit: number;
}

/** Melee landed with one skill/weapon (the swing verb, e.g. "Slash", "Pierce", "Backstab"). */
export interface MeleeTypeStat {
  type: string;
  hits: number;
  damage: number;
  maxHit: number;
}

/**
 * Non-melee damage this combatant dealt from one source — a spell, a DoT (its ticks folded in),
 * a proc, or a damage shield. Per combatant, so your row and your pet's each sum honestly; the
 * Spells *view* keeps the deeper per-cast stats (cast time, resist rate). "hits" counts landings.
 */
export interface SpellDamageStat {
  spell: string;
  hits: number;
  damage: number;
  maxHit: number;
}

/** Landed hits carrying one qualifier ("Critical", "Riposte", "Flurry", …). */
export interface SpecialHitStat {
  kind: string;
  hits: number;
  /** Damage across those hits (0 when the qualifier only appears on misses, e.g. a riposte whiff). */
  damage: number;
}

// ─── Damage detail (who hit whom, with what) ────────────────────────────────

/** How a hit was delivered: a swing, a named spell, or neither (a damage shield). */
export type DamageKind = "Melee" | "Spell" | "Other";

/**
 * One (victim, attacker, kind, source) bucket of damage — the leaf every damage tree is
 * rolled up from. Flat on purpose: see [ADR 0053](../../specs/decisions/0053-damage-is-cells-rolled-up.md).
 */
export interface DamageCell {
  /** Who took it, and who dealt it — canonical names, the same ones `byCombatant` uses. */
  target: string;
  attacker: string;
  kind: DamageKind;
  /** What landed it: a melee skill ("Slash"), a spell/DoT name, a shield's word ("flames"). */
  source: string;
  damage: number;
  /** Landed hits, DoT ticks included. */
  hits: number;
  /** Of those hits, DoT ticks — a source that's all ticks is a DoT. */
  ticks: number;
  /** Swings that didn't land. Melee only: the log's misses name a verb, never a spell. */
  misses: number;
  /** Landed hits the log tagged "(Critical)". */
  crits: number;
  maxHit: number;
}

/** Which axis a level of a damage tree groups by. */
export type DamageAxis = "target" | "attacker" | "kind" | "source";

/**
 * A node's damage against the denominators that don't move with the tree, 0–1 each. Every
 * combination of "whose damage" × "on what":
 *
 * |                     | the whole fight | one victim           |
 * | ------------------- | --------------- | -------------------- |
 * | **anyone's**        | `ofFight`       | `ofTarget`           |
 * | **this attacker's** | `ofAttacker`    | `ofAttackerOnTarget` |
 *
 * Each is absent when it would have no meaning rather than being guessed at:
 *
 * - the two right-hand ones need the node's hits to have landed on **one** victim (a spell's row
 *   *above* its per-target split spans several, so "of that victim" says nothing);
 * - the two bottom ones need a **single attacker** behind them;
 * - `ofFight` needs the node's hits to be part of the fight's total — see below.
 *
 * **What "the fight" counts.** Everything landed on the things your side actually fought: a
 * victim is in only if you or your pet hit it. Damage *on* you, your pet or your group is not
 * part of "how much of this fight was mine" — it's the fight happening to you — so it's left out
 * of the denominator, and a node made of it has no `ofFight` at all rather than a share of
 * something it isn't in. Players hitting each other is the exception that falls out for free: if
 * you hit them, they're a victim you fought, so a duel counts like any other fight. When nothing
 * is known to be yours (no character name yet), sides can't be told apart and every victim counts.
 */
export interface DamageShares {
  ofFight?: number;
  ofTarget?: number;
  ofAttacker?: number;
  ofAttackerOnTarget?: number;
}

/**
 * One level of a damage tree — a combatant, a kind, or a source — with its own metrics and
 * the level below it. Every node's `damage` is exactly the sum of its children's, so a share
 * always adds up.
 */
export interface DamageNode {
  /** Who or what this level is (the value of the axis it groups by). */
  label: string;
  /** Which axis produced it, so a renderer can label the level without tracking depth. */
  axis: DamageAxis;
  damage: number;
  hits: number;
  ticks: number;
  misses: number;
  crits: number;
  maxHit: number;
  /** Share of the level above (of the whole tree at the top), 0–1. */
  share: number;
  /**
   * The same damage measured against **fixed** denominators. `share` alone can't answer "how much
   * of that mob did I do" — it's relative to whichever level happens to sit above, so the same 50%
   * means something different at every depth, and comparing two nodes means multiplying shares
   * back up their branches.
   */
  of: DamageShares;
  /** The one victim every hit in this node landed on, when there is one — what `of.ofTarget` is of. */
  onTarget?: string;
  /** The one attacker behind every hit in this node, when there is one. */
  byAttacker?: string;
  /** `crits / hits`, 0 when nothing landed. */
  critRate: number;
  /**
   * Landed swings over swings taken — 0 when nothing swung. DoT ticks are excluded from
   * both sides: they aren't swings, and counting them reads as perfect accuracy.
   */
  hitRate: number;
  /** True when this level names you or something of yours. Only set on combatant levels. */
  mine?: boolean;
  children: DamageNode[];
}

/**
 * One of your spells over a window. Everything here is measured from the log — EQ
 * states neither cast times nor resist rates, so both are derived: cast time from the
 * gap between "You begin casting X" and the effect landing, resist rate from how many
 * completed casts were shrugged off.
 */
export interface SpellStat {
  spell: string;
  /** The last rank seen cast, for looking the spell up on the wiki. */
  rank?: string;
  /** Casts begun. */
  casts: number;
  /** Casts that landed damage or a heal (a DoT counts once, at first landing). */
  lands: number;
  /** Later damage-over-time ticks from those landings. */
  ticks: number;
  fizzles: number;
  interrupts: number;
  resists: number;
  blocked: number;
  /** Damage this spell did, first landing + every tick. */
  damage: number;
  healed: number;
  maxHit: number;
  /** Mean measured cast time, seconds (0 when no cast could be timed). */
  avgCastSec: number;
  /**
   * Damage per second **spent casting** — the efficiency figure: a slow nuke and a fast
   * one that hit for the same amount are not equally good. 0 when nothing was timed.
   */
  dpc: number;
  /** Share of completed casts that were resisted, 0–1. */
  resistRate: number;
  /** Hit points a heal would have restored but didn't (the overheal). */
  overhealed: number;
  /**
   * Healing the *invocation* granted off this spell's damage (the divine invocation heals
   * you for a share of what you spent). Kept apart from `healed`, which means "this is a
   * heal spell" — mixing them would make a nuke look like a cure. It's what the mana also
   * bought, so damage alone understates the spell.
   */
  invocationHealed: number;
  /** Who resisted it, most often first — resist rates vary wildly by mob. */
  resistedBy: { target: string; count: number }[];
  /**
   * The same spell under each **invocation**, because an invocation changes both damage
   * and cast time. The figures above are the blend of these; this is what makes them
   * interpretable. Biggest contributor first.
   */
  byInvocation: SpellModeStat[];
}

/** One spell's numbers under a single invocation. */
export interface SpellModeStat {
  /** The invocation active at the time, or "unknown" before the log has told us. */
  mode: string;
  casts: number;
  lands: number;
  damage: number;
  healed: number;
  /** Mean measured cast time under this invocation, seconds (0 when untimed). */
  avgCastSec: number;
  /** Damage per second spent casting, under this invocation. */
  dpc: number;
  /** Healing this invocation granted off the spell's damage (divine's doing). */
  invocationHealed: number;
  /**
   * Landings with **no cast in flight** — the signature of a free cast, which the Spell
   * Blade invocation grants at random and the log never announces.
   */
  procs: number;
  /** Damage those free casts contributed. */
  procDamage: number;
}

/**
 * What an invocation did for you overall, which is the only level at which a proc *rate*
 * makes sense: Spell Blade's free casts trigger off attacks, so the denominator is swings.
 */
export interface InvocationSummary {
  mode: string;
  /** Your melee swings (landed or missed) while this invocation was up. */
  swings: number;
  /** Spell landings with no cast in flight — presumed free casts. */
  procs: number;
  procDamage: number;
  /** `procs / swings`, 0–1. Meaningless unless the invocation grants free casts. */
  procRate: number;
  /** Healing the invocation granted off your spell damage. */
  healed: number;
}

/**
 * What killing one kind of mob costs and earns. Kill time is measured between kills
 * inside a fight, so a pull of three coyotes gives three intervals — the closest the
 * log gets to "how long does one take".
 */
export interface MobKillStat {
  mob: string;
  kills: number;
  /** Mean seconds per kill. */
  avgKillSec: number;
  /** Experience percent credited to this mob (same attribution as the Session tab). */
  xpPct: number;
  /**
   * `xpPct` per minute *spent fighting it* — downtime excluded, so it compares mobs
   * fairly but overstates what a night actually yields. Use it to rank, not to forecast.
   */
  xpPerMin: number;
  /**
   * Money, in copper, kept as the two ledgers the log distinguishes (ADR 0047):
   * `copper` is coin off its corpses, `soldCopper` what its drops auto-sold for. A mob that
   * carries nothing but drops a good vendor trash is a different animal from one that pays
   * cash, and blending them would hide that.
   */
  copper: number;
  soldCopper: number;
  /** Both together, per minute spent fighting it — the same "rank, don't forecast" caveat. */
  copperPerMin: number;
}

/** What was landing on you in the seconds before you died. */
export interface DeathRecap {
  at: string;
  killer?: string;
  /** Damage taken in the lead-up, biggest source first. */
  incoming: { source: string; amount: number }[];
  totalTaken: number;
  /** Seconds of damage the recap covers. */
  windowSec: number;
}

/** Damage totals over a window: one fight, or the whole session. */
export interface FightStats {
  /** Log timestamps of the first and last damage in the window ("" when empty). */
  startedAt: string;
  endedAt: string;
  /**
   * Seconds of *combat* in the window, downtime excluded — so a session's figure is
   * time spent fighting, not time since the app opened.
   */
  durationSec: number;
  totalDealt: number;
  /** Damage you and your pet dealt, and took, within the window. */
  yourDealt: number;
  yourTaken: number;
  /**
   * Wall-clock seconds the window spans, first damage to last — as opposed to
   * `durationSec`, which counts only time in combat. The difference is downtime.
   */
  spanSec: number;
  /** Rows, biggest dealer first. */
  byCombatant: CombatantStat[];
  /**
   * Every hit in the window as a (victim, attacker, kind, source) cell — what the meter's
   * drill-downs are rolled up from, in either direction (ADR 0053). Absent on fights stored
   * before it existed; `byCombatant`'s own splits are derived from these, so the two can't
   * disagree.
   */
  damageCells?: DamageCell[];
  /** Your spells in this window, most damaging first. */
  spells: SpellStat[];
  /** What you killed here, and what it cost/earned. Best rate first. */
  byMob: MobKillStat[];
  /** Kills and experience credited within the window. */
  kills: number;
  /** Percent of a level earned — the log's own figure, summed. */
  xpPct: number;
  /** How many experience messages arrived, and how they split. */
  xpGains: number;
  soloXp: number;
  partyXp: number;
  /**
   * Money earned in the window, in copper, as two ledgers (ADR 0047): `copper` is coin taken
   * off corpses, `soldCopper` what auto-sold drops fetched. Sum them for an evening's income;
   * keep them apart to tell "this mob carries cash" from "this mob drops good trash".
   */
  copper: number;
  soldCopper: number;
  /** Your damage per second of the window, for a sparkline (index = second). */
  yourPerSec: number[];
  /** Your deaths in the window, newest first (capped). */
  deaths: DeathRecap[];
  /** Per-invocation totals: swings, free casts and the healing each granted. */
  invocations: InvocationSummary[];
  /**
   * The span of log lines this window was built from. With `startedAt`/`endedAt` (which are
   * the log's own timestamps) it's enough to find the source lines again — so a stored
   * fight can be **re-derived** if how we compute something changes later, instead of being
   * frozen with whatever the maths said at the time. See ADR 0021.
   */
  logIds?: { from: number; to: number };
}

/**
 * The damage meter's live state: the current (or last) fight plus the session.
 * Whether the fight is still "live" is left to the reader — compare `fight.endedAt`
 * against the clock — because the log only reveals a lull when the next swing lands.
 */
export interface CombatStats {
  /** When tracking started / was last reset. */
  startedAt: string;
  fight: FightStats;
  session: FightStats;
}

// ─── Combat history (past fights and sessions) ──────────────────────────────

/**
 * A finished fight, kept so a past session can be dug into after the fact. It's the
 * same `FightStats` the live meter renders, plus enough identity to browse by.
 */
export interface StoredFight {
  id: string;
  /**
   * What makes this fight *this* fight: its log file and its own start/end timestamps
   * (ADR 0033's keying, applied to fights). It's how eating a log you already watched — or
   * eating it twice — files each fight once. Absent on fights stored before keying; those are
   * keyed from the same fields on load.
   */
  key?: string;
  /**
   * Groups fights into a play session — a **sitting**, bounded by the log's login line
   * ([ADR 0054](../../specs/decisions/0054-a-sitting-is-a-login.md)). Fights recorded before any
   * login was seen fall under a per-run id instead.
   */
  sessionId: string;
  /** The main thing you were fighting — the biggest opponent, for the fight list. */
  label: string;
  /** The zone it happened in, when the log had told us one. */
  zone?: string;
  /**
   * The log file it was read from. `logIds` is only meaningful within one run of the app,
   * so this plus the fight's timestamps is the durable way back to the source lines.
   */
  logFile?: string;
  stats: FightStats;
}

/** A zone's whole recorded history — the "which camp is actually better" answer. */
export interface ZoneReport {
  zone: string;
  fights: number;
  kills: number;
  /** Seconds in combat, and the experience earned for them. */
  combatSec: number;
  xpPct: number;
  xpPerMin: number;
  /** Money across the zone's fights, in copper, as the two ledgers (ADR 0047). */
  copper: number;
  soldCopper: number;
  /** Both together, per minute of combat in the zone. */
  copperPerMin: number;
  yourDealt: number;
  /** Your DPS across the zone's fights. */
  dps: number;
  /** When you last fought here. */
  lastAt: string;
}

/** Your best recorded fight against a given opponent. */
export interface FightBest {
  label: string;
  /** Your damage and DPS in that fight. */
  yourDealt: number;
  dps: number;
  at: string;
}

/** A play session, derived by grouping stored fights. */
export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  fights: number;
  /** Seconds of combat, and damage totals, across the session's fights. */
  combatSec: number;
  totalDealt: number;
  yourDealt: number;
  yourTaken: number;
}

// ─── Wiki data ──────────────────────────────────────────────────────────────

export type SourceKind =
  | "drop"
  | "quest"
  | "recipe"
  | "vendor"
  | "forage"
  | "ground"
  | "unknown";

/** One way an item can be obtained, scraped from its wiki page. */
export interface ItemSource {
  kind: SourceKind;
  /** Where it comes from: a mob, NPC, zone, recipe name, etc. */
  where: string;
  /** Optional extra context: zone, drop rate, cost, notes. */
  detail?: string;
}

/** A required ingredient/turn-in (recipe/quest) or a mob's loot line. */
export interface WikiComponent {
  name: string;
  qty: number;
  wikiPath?: string;
  /** Drop chance for mob loot as a percentage ("4.7%"), when the wiki gives one. */
  dropRate?: string;
}

export type WikiPageKind = "item" | "quest" | "recipe" | "mob" | "zone" | "spell" | "page";

/**
 * One reward line from a quest/recipe. `item`/`wikiPath` are set only when the whole
 * line is a single linked item (e.g. a reward weapon) — so it can be hovered/opened
 * like a list item. Faction/coin/XP lines stay as plain `text`.
 */
export interface WikiReward {
  text: string;
  item?: string;
  wikiPath?: string;
}

/**
 * The item stat card the wiki shows on hover (type, weight, class/race, effects…).
 * Present only for pages that have their own item block (items/recipes). Powers the
 * in-app hover tooltip.
 */
export interface ItemCard {
  title: string;
  /** Absolute URL of the item icon, if any. */
  icon?: string;
  /** Stat lines, top to bottom (e.g. "QUEST ITEM", "WT: 1.5 Size: SMALL", "Class: ALL"). */
  lines: string[];
}

/** Normalized result of scraping a single wiki page. */
export interface WikiPage {
  kind: WikiPageKind;
  title: string;
  wikiPath: string;
  /** For items: how to obtain it. */
  sources: ItemSource[];
  /** For quests/recipes: the items you must gather. */
  components: WikiComponent[];
  /** For quests/recipes: what you get. */
  rewards: WikiReward[];
  /** The item's own stat card (items/recipes), for the hover tooltip. */
  card?: ItemCard;
  /** True if the page is tagged with an era that isn't live yet (can't obtain). */
  outOfEra?: boolean;
  fetchedAt: string;
}

export interface SearchResult {
  title: string;
  wikiPath: string;
  snippet?: string;
  /** True if the page is tagged with an era that isn't live yet. */
  outOfEra?: boolean;
}

/** A screen-region rectangle (display-local CSS pixels) for the screengrab lookup. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A global shortcut and whether the OS accepted its registration. */
export interface HotkeyInfo {
  action: string;
  label: string;
  registered: boolean;
}

/** Diagnostic info shown in the app's Help section. */
export interface AppInfo {
  hotkeys: HotkeyInfo[];
  /** Path to the debug log file (see app.openLog). */
  logFile: string;
}

// ─── Shopping list ──────────────────────────────────────────────────────────

/** One line on the shopping list — a thing to watch for in the logs. */
export interface ShoppingListEntry {
  id: string;
  /** The name matched against loot lines. */
  name: string;
  wikiPath?: string;
  /** How many you want. */
  needed: number;
  /** How many have dropped/looted since it was added (from the log). */
  obtained: number;
  note?: string;
  /** What put this on the list (a quest/recipe), for grouping in the UI. */
  origin?: { kind: WikiPageKind; name: string };
  addedAt: string;
  /** Set when a matching loot line arrives; drives the overlay flash. */
  lastSeenAt?: string;
}

export interface ShoppingList {
  entries: ShoppingListEntry[];
  /** How many times to run each quest/recipe, keyed by origin ("kind:name"). Scales needed counts. */
  questRuns: Record<string, number>;
}

// ─── Experience progress ────────────────────────────────────────────────────

/**
 * How far into the current level you are. The log states experience only as *gains*
 * ("You gain experience! (1.025%)"), never a total — so the starting point has to come
 * from the player. Once given, the app keeps it current by adding every gain and
 * resetting on "You have gained a level!", so it's asked for at most once per level.
 */
export interface XpProgress {
  /** Percent into the current level, 0–100. */
  intoLevel: number;
  /** Level, when the log has told us ("Welcome to level N!"). */
  level?: number;
  /** When the player last stated it (or when a level-up reset it). */
  statedAt?: string;
  /** True once we have something to work from. */
  known: boolean;
}

// ─── Kill locations (for the heatmap) ───────────────────────────────────────

/**
 * Where a kill happened, and everything that went into believing it. EQ only logs a
 * position when you type `/loc`, so the location is always inferred — this keeps the
 * evidence alongside the guess so the display can decide what to trust (see
 * `electron/kill-log.ts`).
 */
export interface KillRecord {
  id: string;
  /** The log line the kill came from. */
  logId: number;
  at: string;
  mob: string;
  /**
   * Who landed the killing blow. The log reports every death in earshot, so this is often
   * someone else entirely; absent on records stored before it was captured.
   */
  killer?: string;
  /**
   * Whether the kill was yours (you or your pet). Other people's kills still say something
   * about where a mob spawns, but they are not evidence about what it drops for *you* —
   * you never looted those corpses. Absent on records stored before it was captured.
   */
  mine?: boolean;
  /**
   * The peer who shared this, when it came from someone else's client rather than your own log.
   *
   * Their kills are **data like any other** — a mob dying somewhere is evidence of where it spawns,
   * whoever watched it — so a shared kill goes in the same list, the same groups and the same filters,
   * and only says whose it was. It never counts towards *your* drop rates for the same reason a
   * bystander's kill in your own log doesn't ([ADR 0027](../../specs/decisions/0027-only-your-kills-count.md)):
   * you never had the corpse. Absent on your own records, which is what "mine" means here.
   */
  sharedBy?: string;
  zone?: string;
  /** The last known position — absent if the log had never reported one. */
  y?: number;
  x?: number;
  /** How old that fix was when the kill landed. */
  fixAgeSec?: number;
  /** The fix before it, which is what makes movement measurable. */
  prevY?: number;
  prevX?: number;
  /** Distance and time between those two fixes, and the speed they imply. */
  movedUnits?: number;
  movedSec?: number;
  speed?: number;
  /** Dead-reckoned position: the same course and speed carried on for the fix's age. */
  guessedY?: number;
  guessedX?: number;
  /** 0–1. 1 means a fresh fix from a stationary player; 0 means don't plot it as fact. */
  confidence: number;
  /**
   * What this corpse gave up. Attached as the loot lines arrive rather than joined later —
   * the log puts them right after the kill, and doing it once at ingestion is what lets the
   * map filter by drop without re-reading anything.
   */
  drops?: string[];
  /**
   * A stable identity for this kill, derived from the log line itself (`timestamp|mob|killer`)
   * rather than the random `id`. It's what makes eating a log idempotent: the same line always
   * produces the same key, so re-digesting a log — or importing one that overlaps kills already
   * recorded live — records each real kill exactly once. Absent on records stored before keying
   * (backfilled on load). See ADR 0033.
   */
  key?: string;
  /**
   * The keys of the loot lines already folded into `drops` (`lootTimestamp|item|source`), so a
   * replayed loot line is recognised and not counted twice. Parallel to `drops`; absent on
   * pre-keying records, which is why a genuinely-new drop onto such a corpse is trusted but a
   * re-import isn't (see `noteLoot`).
   */
  dropKeys?: string[];
  /**
   * Coin taken off this corpse, in copper — the mob's own money, which is a separate question
   * from what its drops vendor for (ADR 0047). Absent when the corpse paid none, or when the
   * coin line couldn't be placed on a corpse at all.
   */
  coin?: number;
  /** The keys of the coin lines already folded into `coin`, so a replay doesn't double it. */
  coinKeys?: string[];
}

/**
 * Which kills the map should pick out: one mob's, or a single kill by id. Transient — it lives
 * for as long as a cursor rests on a name, and is never stored.
 *
 * It sits in shared types rather than beside the kill list because it's asked for from two
 * windows now: the map's own ☠ list, and the main window's Hunt tab (over `map.emphasize`). Both
 * are the same question — "where did those die?" — so they send the same shape.
 */
export interface KillEmphasis {
  mob?: string;
  id?: string;
}

// ─── Health estimate ────────────────────────────────────────────────────────

/**
 * Bounds on your maximum hit points, squeezed out of the log (see `hp-estimate.ts`).
 * The log never states health, so this is inferred from what you survived and what
 * killed you — a **soft** figure that sharpens with play and is overridable.
 */
export interface HpEstimate {
  /** Damage survived in one stretch with no healing: your maximum is above this. */
  atLeast: number;
  /** Damage that killed you from known-full health: your maximum is at or below this. */
  atMost?: number;
  /** What the player said it is — believed over the inference, until they level. */
  stated?: number;
  /** The level these observations belong to; levelling discards them. */
  level?: number;
  /** How many observations have contributed (a rough confidence signal). */
  samples: number;
  /**
   * Hit points regained per tick while fighting, if the player has told us. Health ticks
   * back every ~6 seconds, so a long window lets you absorb more than your maximum —
   * without this the floor creeps upward on duration alone.
   */
  regenPerTick?: number;
  updatedAt: string;
}

// ─── Cast alerts (dispel prep) ──────────────────────────────────────────────

/**
 * A spell to watch for being cast, so the user gets a heads-up to prep a dispel/cure.
 * `spell` is matched case-insensitively as a **substring** of the cast spell's name, so
 * "Fear" catches any spell whose name contains it.
 */
export interface CastWatch {
  id: string;
  spell: string;
  enabled: boolean;
  /**
   * Also alert when this spell is cast by a *named* caster — another player, a pet, or a named
   * NPC (anyone whose log name has no "a/an/the" article), not just an ordinary mob. Off by
   * default: a groupmate casting Charm isn't a threat to prep against. See `matchCast`.
   */
  includePlayers?: boolean;
  /**
   * Alert when the spell **begins casting**. Defaults to on when unset (every watch predates
   * the choice); turn it off for a watch that only cares about the fade.
   */
  onCast?: boolean;
  /**
   * Also alert when the spell **fades** — your root wearing off a mob, your Spirit of Wolf
   * expiring. Off by default: a watch is normally a warning to interrupt something, and a fade
   * is the opposite kind of prompt (re-cast it). See `matchFade`.
   */
  onFade?: boolean;
  /**
   * Match `spell` against **whole log lines** instead of a spell name — "invites you" for a party
   * invite, "tells you" for a private message. The log says plenty the parsers don't model, and
   * this is how the player gets told about any of it without a new event kind per message.
   * Off by default; a watch that has it on normally has `onCast: false`. See `matchLine`.
   */
  onLine?: boolean;
  /**
   * This watch's own look and sound, overriding the defaults field by field. Absent means it
   * follows them — which is what every watch does until you give it one. Partial so a style
   * saved before a new field existed still picks that field up from the defaults.
   */
  style?: Partial<AlertStyle>;
}

/** A preset spot for the alert banner on the overlay. */
export type AlertPosition = "top" | "top-left" | "top-right" | "center" | "bottom-left" | "bottom-right";

/**
 * Where the alert banner sits: a preset, or `loc:<id>` referring to a **custom spot** the user
 * placed with the mouse (see `AlertLocation` / `castAlerts.locations`). One field, so a single
 * dropdown offers both and switching between them never leaves a stale second field behind.
 */
export type AlertPositionValue = AlertPosition | `loc:${string}`;

/** A user-placed alert spot, named, as a fraction of the overlay display so it survives a resize. */
export interface AlertLocation {
  id: string;
  name: string;
  /** 0..1 across the display's width. */
  fx: number;
  /** 0..1 down the display's height. */
  fy: number;
}

/** How the alert banner behaves while it's up. */
export type AlertAnimation = "pulse" | "wiggle" | "float" | "none";

/** One connected monitor, for choosing where the alert overlay appears. */
export interface DisplayInfo {
  /** Electron's display id (stable while the monitor stays connected). */
  id: number;
  /** A human label, e.g. "Monitor 1 — 2560×1440". */
  label: string;
  /** Whether this is the OS primary display. */
  primary: boolean;
}

/**
 * How an alert looks and sounds. Held apart from the rest of the settings because a **watch may
 * carry its own** — "Charm being cast" and "my root wore off" are different emergencies and
 * deserve to be told apart at a glance, without reading the banner (see `alertStyle`).
 */
export interface AlertStyle {
  /** Play a beep when an alert fires (which beep is `soundName`). */
  sound: boolean;
  /** Flash a colored border around the screen when an alert fires (which color is `color`). */
  flash: boolean;
  /** Accent color for the banner border + screen flash — any CSS color (see `ALERT_COLORS`). */
  color: string;
  /** Which synthesized beep to play (see `src/lib/alertSounds.ts`). */
  soundName: string;
  /** Where the banner appears — a preset, or `loc:<id>` for a placed custom spot. */
  position: AlertPositionValue;
  /** How long a banner stays up, in milliseconds. */
  durationMs: number;
  /** The banner's motion while it's up. */
  animation: AlertAnimation;
}

/**
 * Settings for the "a watched spell is being cast" alert. The `AlertStyle` fields it inherits are
 * the **defaults**, which any watch may override.
 */
export interface CastAlertSettings extends AlertStyle {
  /** Master on/off. */
  enabled: boolean;
  /** Also alert on YOUR own casts (off by default — you know what you're casting). */
  includeSelf: boolean;
  watches: CastWatch[];
  /**
   * Custom spots the user placed with the mouse, referenced by a `position` of `loc:<id>`. Shared
   * across the defaults and every watch, so one placement serves all. See `AlertLocation`.
   */
  locations: AlertLocation[];
  /**
   * The display the overlay covers, by Electron display id. Absent = the primary display (and the
   * fallback whenever the saved id is gone, e.g. a monitor was unplugged). See `createAlertWindow`.
   */
  displayId?: number;
}

/**
 * Fired when a watched spell begins casting or fades, or a watched **line** appeared — the
 * payload the overlay banner shows.
 */
export interface CastAlertEvent {
  /** Who's casting (a mob, a peer, or you). Empty for a fade or a line, which name no caster. */
  caster: string;
  /** The spell as the log named it (rank stripped), or the words a fade line used. */
  spell: string;
  at: string;
  /**
   * Which prompt this is. A cast says "dispel, now"; a fade says "cast it again"; a line just
   * repeats what the game said. Absent means a cast, so an alert sent by an older build still
   * reads correctly.
   */
  event?: "cast" | "fade" | "line";
  /** For a fade, who it wore off ("your pet", a mob). Absent means it was on you. */
  target?: string;
  /**
   * For a `line` alert, the log line that matched (timestamp stripped). The banner shows the
   * game's own words, because for a line watch that sentence *is* the whole message.
   */
  text?: string;
  /**
   * The look and sound this alert should use, already resolved from the defaults and the watch's
   * own overrides (`alertStyle`). Carried with the alert so the overlay renders what *this* watch
   * asked for — it can't work that out itself, and an alert already up mustn't be restyled by
   * the next one. Absent only from an older build's payload, where the defaults stand in.
   */
  style?: AlertStyle;
}

// ─── Settings ───────────────────────────────────────────────────────────────

export interface OverlaySettings {
  opacity: number; // 0.2 .. 1
  alwaysOnTop: boolean;
  fontScale: number; // 0.6 .. 1 — see UI_SCALE / ADR 0026 (kept its name to not break saved settings)
  /**
   * The **map window's** scale, kept apart from `fontScale` because the two windows want
   * different sizes: one is a column of text you shrink to reclaim desk space, the other is a
   * picture you enlarge to read. Same range, its own A−/A+ buttons in the map titlebar.
   */
  mapFontScale: number;
  showObtained: boolean; // keep completed items visible
  /** Auto-narrow the overlay to the zone you're in (from the log) as you travel. */
  followZone: boolean;
  /**
   * Show the damage meter's per-stance / per-invocation breakdown as rows rather than only
   * on hover. Off by default: a spell can have six invocations behind it, and six rows per
   * spell is unreadable at a glance (see ADR 0020).
   */
  splitByMode: boolean;
  /**
   * Show the little how-much-do-I-believe-this marker on kill positions (map and list).
   * On by default — an inferred position that looks measured is the thing to avoid — but
   * it's dismissible, including by right-clicking the marker itself.
   */
  showKillConfidence: boolean;
}

export type MatchMode = "exact" | "contains";

export interface Settings {
  /** Directory holding eqlog_*.txt files. */
  logDir: string;
  /** Specific file to watch, or "" to auto-pick the most recently written. */
  activeLogFile: string;
  matchMode: MatchMode;
  /** Hide out-of-era pages in search results. */
  hideOutOfEra: boolean;
  /** Opt-in: join the awari peer-to-peer network (see peers + send pings). Default off. */
  connectPeers: boolean;
  /** Broadcast your live location to peers (requires `connectPeers`). Default off. */
  shareLocation: boolean;
  /** Display name shown to peers; blank = derived from the log file's character name. */
  playerName: string;
  /** Override for the awari bootstrap-service URL; blank = the live default. */
  bootstrapUrl: string;
  /** Alert when a watched spell begins casting, so you can prep a dispel/cure. */
  castAlerts: CastAlertSettings;
  /** Which ways of getting about a route may assume you have. */
  travel: TravelSettings;
  overlay: OverlaySettings;
  debug: boolean;
}

/**
 * What a cross-zone route is allowed to assume about you.
 *
 * A setting rather than a per-window filter, because it's a fact about *you* — your class, or who you
 * can call on — not about what you're looking at. One answer, wherever a route is asked for.
 *
 * Druid, wizard and succor default **off**: a route that quietly assumed a port you can't get is advice
 * you can't take. Translocator gnomes default **on**, being public transport. Boats aren't here, because
 * a boat is a border like any other ([ADR 0062](../../specs/decisions/0062-a-travel-graph-of-zone-lines.md)).
 */
export interface TravelSettings {
  /** You can get a druid ring port — you're a druid, or someone will oblige. */
  druid: boolean;
  /** …and a wizard spire teleport. */
  wizard: boolean;
  /** Legends' translocator gnomes are available to you. */
  gnome: boolean;
  /**
   * You can reach a zone's succor point without walking there — an evacuation spell, or a `/pick` into
   * another instance, both of which drop you at the same spot
   * ([ADR 0069](../../specs/decisions/0069-a-succor-is-a-port-inside-one-zone.md)).
   */
  succor: boolean;
}

// ─── Watcher status ─────────────────────────────────────────────────────────

export interface WatcherStatus {
  watching: boolean;
  file?: string;
  error?: string;
}

// ─── Peer networking (awari) ────────────────────────────────────────────────

/**
 * Discriminator values for awari room payloads, in one place so a sender and the
 * receiver can't drift (a typo'd literal would silently fail to match — `kind` is a
 * plain string on the wire). Add a member here when a new feature uses the connection.
 */
export const AWARI_MSG = {
  /** A peer's live location. */
  loc: "loc",
  /** A peer's map click (a named marker for everyone viewing that zone). */
  ping: "ping",
  /** A peer's shared map pins. */
  pins: "pins",
  /** A peer's shared kill locations, for a combined heatmap. */
  kills: "kills",
  /** A peer's observations about mobs: drop counts and roam areas, pooled into rates. */
  mobs: "mobs",
  /**
   * Who a peer is (name + zone). awari's roster gives us peer *ids*; this is how a
   * connected-users list learns names. Sent on join, whenever ours changes, and
   * again whenever someone new joins (so late arrivals learn about us).
   */
  hello: "hello",
} as const;
export type AwariMsgKind = (typeof AWARI_MSG)[keyof typeof AWARI_MSG];

/**
 * An app message carried over the awari room. `kind` discriminates the shape
 * (see `AWARI_MSG`). Kept loose so it survives IPC structured-clone and isn't tied to
 * any one feature.
 */
export type AwariPayload = { kind: string; [key: string]: unknown };

/** A peer message the owner window received, relayed to every window (self excluded). */
export interface AwariInbound {
  /** The sending peer's id. */
  sender: string;
  payload: AwariPayload;
}

/** The owner window's connection status, broadcast to every window. */
export interface AwariStatus {
  connected: boolean;
  peerId: string | null;
}

/**
 * Someone else in the room, as the connected-users list sees them. Presence comes
 * from awari's roster (`onPeerJoined`/`onPeerLeft`) so a peer is listed as soon as
 * they connect; `name`/`zone` fill in when their `hello` arrives.
 */
export interface AwariPeer {
  peerId: string;
  name?: string;
  zone?: string;
}

/**
 * How much of a store a "clear" is meant to take with it.
 *
 * `records` — the rows: individual kills, the loot feed. What they *taught* — observed drop rates,
 * roam areas, vendor prices — is kept, because that's the expensive thing and it can't be
 * recovered from a log you no longer have. This is the default everywhere, deliberately.
 *
 * `everything` — the summaries too. Only ever from a second, explicit answer, because it throws
 * away months of observation ([ADR 0056](../../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md)).
 */
export type ForgetScope = "records" | "everything";

/**
 * Result of digesting ("eating") a log file into learned data — the kill log (→ mob knowledge)
 * and combat history. Every count is of things that were **new**: eating a log twice, or eating
 * one you watched live, reports zeros rather than doubling anything (ADR 0033).
 */
export interface LogImportResult {
  /** The file that was digested. */
  file: string;
  lines: number;
  /** Kill lines digested. */
  kills: number;
  /** Loot lines attributed to a corpse. */
  drops: number;
  /** Coin attributed to a corpse, in copper. */
  coin: number;
  /** Fights filed into history. */
  fights: number;
  /** Play sittings found, one per login line. */
  sessions: number;
  /** Drops added to the loot feed (and so to the prices derived from it). */
  loot: number;
}

/** What the renderer needs to show "a newer build is available" (see `electron/update-check.ts`). */
export interface UpdateNotice {
  /** The release page to open. */
  url: string;
  /** The published build's version — already established as newer than the running one. */
  version: string;
}

// ─── Preload bridge (window.eql) ────────────────────────────────────────────

/** Unsubscribe function returned by every `on*` subscription. */
export type Unsubscribe = () => void;

export interface EqlApi {
  list: {
    get(): Promise<ShoppingList>;
    /** Add a single item to watch. Returns the updated list. */
    add(input: {
      name: string;
      needed?: number;
      wikiPath?: string;
      note?: string;
      origin?: { kind: WikiPageKind; name: string };
    }): Promise<ShoppingList>;
    /** Add every component of a scraped quest/recipe at once. */
    addFromPage(page: WikiPage): Promise<ShoppingList>;
    update(id: string, patch: Partial<Pick<ShoppingListEntry, "needed" | "obtained" | "note">>): Promise<ShoppingList>;
    remove(id: string): Promise<ShoppingList>;
    clear(): Promise<ShoppingList>;
    /** Set how many times to run a quest/recipe group (by origin key); scales needs. */
    setRuns(originKey: string, runs: number): Promise<ShoppingList>;
    onChanged(cb: (list: ShoppingList) => void): Unsubscribe;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: DeepPartial<Settings>): Promise<Settings>;
    /** Open a native folder picker for the EQ log directory. */
    pickLogDir(): Promise<string | null>;
    onChanged(cb: (settings: Settings) => void): Unsubscribe;
  };
  wiki: {
    search(term: string): Promise<SearchResult[]>;
    getPage(title: string): Promise<WikiPage | null>;
    /** Fuzzy zone-name suggestions for the "quests by zone" search. */
    searchZones(term: string): Promise<SearchResult[]>;
    /** Quests located in / related to a zone. */
    questsByZone(zone: string): Promise<SearchResult[]>;
    /** Open a wiki page in the external browser (wikiPath or title). */
    openInBrowser(target: string): Promise<void>;
    /**
     * Force the search indexes to re-fetch now (they're mirrored to disk and otherwise only
     * refresh weekly), so a newly-added wiki page becomes searchable immediately.
     */
    refresh(): Promise<void>;
  };
  loot: {
    /**
     * The most recent drops (newest first), tracked in the main process so the feed is complete
     * even when the Loot tab wasn't open. Pair with `onEvent` for live appends.
     */
    recent(limit?: number): Promise<LootEvent[]>;
    /** What each item has auto-sold for, biggest earner first. */
    prices(): Promise<ItemPrice[]>;
    /** Every parsed loot line, whether or not it's on the list. */
    onEvent(cb: (event: LootEvent) => void): Unsubscribe;
    /** Loot lines that matched a shopping-list entry. */
    onMatched(cb: (payload: { event: LootEvent; entry: ShoppingListEntry }) => void): Unsubscribe;
  };
  alerts: {
    /** Fires when a watched spell begins casting (gated by Settings.castAlerts). */
    onCast(cb: (event: CastAlertEvent) => void): Unsubscribe;
    /**
     * Fire a sample cast alert (banner + beep) so the user can preview it. Naming a watch
     * previews *its* style; without one, the first usable watch stands in.
     */
    test(watchId?: string): Promise<void>;
    /**
     * Place a custom alert spot with the mouse. The overlay is made interactive on its display;
     * the user clicks where alerts should appear. Resolves with the point as fractions of that
     * display (0..1), or null if cancelled (Esc) or there's no overlay (alerts off). Main window.
     */
    placeLocation(): Promise<{ fx: number; fy: number } | null>;
    /** Overlay only: main asks it to enter placement mode. */
    onPlaceBegin(cb: () => void): Unsubscribe;
    /** Overlay only: report the placed point (or null on cancel) back to main. */
    placed(point: { fx: number; fy: number } | null): void;
  };
  log: {
    /**
     * Pick a log file and digest ("eat") it into learned data — its kills, drops and
     * positions fold into the kill log / mob knowledge, without live-watching it. Returns
     * what was digested, or null if the picker was cancelled. Live combat stats are untouched.
     */
    import(): Promise<LogImportResult | null>;
  };
  /** "A newer build is out" notification (rolling `latest` release; no auto-updater). */
  update: {
    /** The newer build found this session, or null — for a tab mounted after the check ran. */
    current(): Promise<UpdateNotice | null>;
    /** A newer build was just found (for a tab already mounted). */
    onAvailable(cb: (notice: UpdateNotice) => void): Unsubscribe;
    /** Open the release page in the browser and stop flagging this build. */
    open(): Promise<void>;
    /** Dismiss: stop flagging this build (the next newer one still notifies). */
    dismiss(): Promise<void>;
  };
  watcher: {
    status(): Promise<WatcherStatus>;
    onStatus(cb: (status: WatcherStatus) => void): Unsubscribe;
  };
  zone: {
    /** The zone the player is currently in (from the log), or null if unknown. */
    current(): Promise<string | null>;
    onChanged(cb: (zone: string | null) => void): Unsubscribe;
  };
  loc: {
    /** The player's last logged location (from `/loc`), or null if none yet. */
    current(): Promise<LocEvent | null>;
    onChanged(cb: (loc: LocEvent | null) => void): Unsubscribe;
  };
  /** The damage meter: per-combatant damage/DPS for the current fight and session. */
  combat: {
    get(): Promise<CombatStats>;
    reset(): Promise<CombatStats>;
    onChanged(cb: (stats: CombatStats) => void): Unsubscribe;
    /** Past play sessions, newest first. */
    sessions(): Promise<SessionSummary[]>;
    /** Per-zone totals across all recorded fights, best experience rate first. */
    zones(): Promise<ZoneReport[]>;
    /** Your best recorded fight per opponent. */
    bests(): Promise<FightBest[]>;
    /** The stored fights of one session, newest first. */
    fights(sessionId: string): Promise<StoredFight[]>;
    /** Forget all stored history (the live meter is untouched). */
    clearHistory(): Promise<SessionSummary[]>;
  };
  /**
   * What's been learned about mobs by killing them: observed drop rates, roam areas, and
   * whose observations went into each. Yours comes from the kill log; peers' arrives over the
   * room and is kept separately (see `electron/mob-knowledge.ts`).
   */
  mobs: {
    /** Pooled knowledge, most-killed first. */
    all(zone?: string): Promise<MobKnowledge[]>;
    /** Your own observations, in the form peers receive them. */
    mine(zone?: string): Promise<MobObservation[]>;
    /** File observations received from a peer. */
    report(by: string, observations: MobObservation[]): Promise<void>;
    /** Forget everything peers have told us (your own observations are untouched). */
    forgetPeers(): Promise<void>;
  };
  /** Recorded kill locations, for the heatmap. */
  kills: {
    /** Every kill recorded (optionally for one zone), newest first. */
    all(zone?: string): Promise<KillRecord[]>;
    /**
     * Forget the recorded kills and the loot feed. **Observations survive** — drop rates, roam
     * areas and vendor prices — unless the scope is `"everything"`, which the UI only sends after
     * asking a second time (ADR 0056).
     */
    clear(scope?: ForgetScope): Promise<void>;
    /**
     * Fires when the kill log changes in bulk — an import ("eat a log") or a clear.
     * Live kills don't push this (the panels refetch off their own refresh keys); it
     * exists so out-of-band changes land in already-open windows without a reopen.
     */
    onChanged(cb: () => void): Unsubscribe;
  };
  /** Inferred bounds on your maximum hit points, and the overrides for them. */
  hp: {
    get(): Promise<HpEstimate>;
    /** Record the player's own figure for maximum hit points. */
    set(max: number): Promise<HpEstimate>;
    /** Record in-combat regeneration per tick, so long windows can be discounted. */
    setRegen(perTick: number): Promise<HpEstimate>;
    onChanged(cb: (estimate: HpEstimate) => void): Unsubscribe;
  };
  /**
   * Experience progress — the one figure the log can't give us, so the UI asks for it
   * and this keeps it current afterwards.
   */
  xp: {
    get(): Promise<XpProgress>;
    /** Record what the player says their current XP into the level is (0–100). */
    set(intoLevel: number, level?: number): Promise<XpProgress>;
    onChanged(cb: (progress: XpProgress) => void): Unsubscribe;
  };
  lookup: {
    /** Open the region selector (same as the screengrab hotkey). */
    open(): Promise<void>;
    /**
     * OCR the selected region; the read text is routed to the Search box. `rect` is
     * in the selector window's client pixels and `view` is that window's viewport
     * size — the ratio image/view maps the selection to image pixels regardless of
     * how the OS reports the window's units.
     */
    capture(rect: Rect, view: { width: number; height: number }): Promise<string>;
    /** Close all selector windows (cancel). */
    cancel(): Promise<void>;
  };
  app: {
    /** Diagnostics for the Help section (hotkey registration, log path, …). */
    info(): Promise<AppInfo>;
    /** Open the debug log file in the OS default app. */
    openLog(): Promise<void>;
    /**
     * Stored data changed in bulk — a log was eaten, or a store was cleared. Anything that reads
     * a stored list once when it opens (the fight history, the loot feed) should refetch on this;
     * live events say nothing about a whole file changing underneath.
     */
    onDataChanged(cb: () => void): Unsubscribe;
  };
  search: {
    /** Fires when a screengrab lookup fills the Search box with OCR'd text. */
    onPrefill(cb: (text: string) => void): Unsubscribe;
    /**
     * Surface `text` in the control window's Search box, focusing that window. For
     * secondary windows (the map) that have no search of their own.
     */
    show(text: string): Promise<void>;
  };
  nav: {
    /**
     * Browser back/forward from the mouse thumb buttons or Alt+←/→, forwarded from
     * the main process (`app-command`). Drives the in-app page history — links
     * navigate within the app, never straight to the external wiki.
     */
    onCommand(cb: (dir: "back" | "forward") => void): Unsubscribe;
  };
  travel: {
    /**
     * How to get from one zone to another, over the chosen map source's graph — or the reason there
     * is no way. Zone names or map file names, either end; pass an `at` for a `/loc` you have and the
     * walk to the first border is charged for real rather than assumed free.
     *
     * The first call for a source builds its graph (~1s for a big pack) and it's kept after that.
     */
    route(
      sourceId: string,
      from: TravelEnd | string,
      to: TravelEnd | string,
      options?: TravelOptions,
    ): Promise<TravelAnswer>;
  };
  map: {
    /** Open (or focus) the sibling map window. */
    open(): Promise<void>;
    /**
     * Open the map window at a zone. With `loc` (EQ y,x — e.g. from a mob's Location
     * coordinate), drop a marker there labeled with `label`.
     */
    openAt(zone: string, loc?: { y: number; x: number }, label?: string): Promise<void>;
    /** Fires in the map window when asked to view a zone / drop a marker (`openAt`). */
    onViewZone(cb: (msg: { zone: string; loc?: { y: number; x: number }; label?: string }) => void): Unsubscribe;
    /**
     * Ask the map to pick a mob's kills out of its heatmap — what the map's own ☠ list does on
     * hover, offered to the other windows so pointing at a mob name anywhere answers "where did
     * those die?". `null` clears it.
     *
     * Deliberately **does not open the map**: this rides on a hover, and a window that appears
     * because the cursor crossed a name is a window nobody asked for. With the map closed, or
     * showing another zone, or holding no kills of that mob, it does nothing.
     */
    emphasize(emphasis: KillEmphasis | null): void;
    /** Fires in the map window when someone asks for kills to be picked out (`emphasize`). */
    onEmphasis(cb: (emphasis: KillEmphasis | null) => void): Unsubscribe;
    /** Open a zone's map page on the Project 1999 wiki (for zones with no bundled map). */
    openP99(zone: string): Promise<void>;
    /**
     * Map sets we can read: the bundled images, plus the game's `maps` folder and every
     * pack installed in a subfolder of it. Re-queried when the log directory changes, since
     * that's what tells us where the game lives.
     */
    sources(): Promise<MapSourceReport>;
    /** One zone's geometry + labelled points from a folder source (null if it has no map). */
    load(sourceId: string, zoneFile: string): Promise<LoadedMap | null>;
    /**
     * Zone short name → the long name, worked out from **this source's own** exit labels. One pack
     * is one survey and never lends another its names (ADR 0060). Read on demand: it scans every
     * map in the folder, so the picker shows file names until it lands and then relabels itself.
     */
    names(sourceId: string): Promise<Record<string, string>>;
  };
  /**
   * Peer networking (awari), brokered by the main process. The always-alive main
   * window owns the single WebRTC connection; every other window talks to peers
   * through here. See `AwariHost` (owner engine) and ADR 0012.
   */
  awari: {
    /** Publish an app payload to the room (relayed to the owner window, which holds the socket). */
    send(payload: AwariPayload): void;
    /** A peer message arrived (owner-relayed to every window; never your own). */
    onMessage(cb: (msg: AwariInbound) => void): Unsubscribe;
    /** Connection status changed (joined? + our peer id). */
    onStatus(cb: (status: AwariStatus) => void): Unsubscribe;
    /** Who else is in the room (roster + the names/zones they've announced). */
    onPeers(cb: (peers: AwariPeer[]) => void): Unsubscribe;
    /** Owner-window plumbing: the broker asks this (owner) window to publish a payload. */
    onPublish(cb: (payload: AwariPayload) => void): Unsubscribe;
    /** Owner-window plumbing: report an inbound peer message up to the broker. */
    reportMessage(msg: AwariInbound): void;
    /** Owner-window plumbing: report connection status up to the broker. */
    reportStatus(status: AwariStatus): void;
    /** Owner-window plumbing: report the room roster up to the broker. */
    reportPeers(peers: AwariPeer[]): void;
  };
  /** Connected monitors, for choosing where the alert overlay shows (Settings → cast alerts). */
  display: {
    list(): Promise<DisplayInfo[]>;
  };
  win: {
    minimize(): void;
    /** Maximize this window, or restore it if it already is. */
    toggleMaximize(): void;
    /**
     * This window maximized or restored — by our button or by anything else (a drag-region
     * double-click, Win+Up, the taskbar). Drives the titlebar button's glyph, and fires again
     * after a reload so it can't start out wrong.
     */
    onMaximizeChanged(cb: (maximized: boolean) => void): Unsubscribe;
    /** Hide the window to the tray (the app keeps running; reshow via tray/hotkey). */
    hide(): void;
    /** Set the live window opacity (0.2–1), transient — does not change the saved setting. */
    setOpacity(value: number): void;
    /** Toggle this window's always-on-top (per-window; used by the map's pin). */
    setAlwaysOnTop(enabled: boolean): void;
    close(): void;
    /** Forget saved positions and recenter windows (for "lost" windows). */
    resetPositions(): Promise<void>;
  };
}

/** Recursive Partial for settings patches. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
