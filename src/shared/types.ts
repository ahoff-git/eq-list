import type { DataReportRow } from "./data-provenance";
import type { CheckResult } from "./self-check";
import type { MobKnowledge, MobObservation } from "./mob-stats";
import type { KnowledgeContributor } from "./contributors";
import type { PeerOfferNotice, ReceivedShare, ShareKind, ShareSettings } from "./peer-share";
// Re-exported because every consumer of the `peer` bridge reads it off the api surface, and
// `types.ts` is where that surface is described.
export type { PeerOfferNotice, ReceivedShare, ShareKind } from "./peer-share";
import type { SharedKill } from "./kill-filters";
import type { Floor, Respawn, RespawnLearning, Sighting, SpawnState, SpawnTimer } from "./spawn-timers";
import type { BuffInstance, BuffView, KnownBuff } from "./buff-tracking";
import type { EqMap } from "./map/eqmap";
import type { MapPin } from "./map/pins";
import type { MapSourceReport } from "./map/map-sources";
import type { TravelAnswer, TravelEnd } from "./travel/route";
import type { TravelAvoided, TravelOptions } from "./travel/types";
import type { TravelSurvey } from "./travel/survey";
import type { DragEnd } from "./window-snap";

/** A zone's vector map as it crosses IPC: geometry, labels, and who drew it. */
export type LoadedMap = EqMap & { credits: string[] };

export type { MapSourceReport };
/**
 * Re-exported so a panel can type a buff row without reaching into the tracking rules — the same
 * courtesy `SpawnView`'s neighbours get, and for the same reason: the renderer consumes these over
 * IPC and has no business knowing which module decided them.
 */
export type { BuffInstance, BuffView, KnownBuff };
/** Re-exported so a renderer can type a route without reaching into the travel module. */
export type { TravelAnswer, TravelAvoided, TravelEnd, TravelOptions, TravelSurvey };
/** Re-exported for the same reason: a titlebar ends a drag without importing the geometry. */
export type { DragEnd };

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
 * **A drop as the ledger keeps it** — the parsed line, plus where you were standing when it landed.
 *
 * The zone is not in `LootEvent` because a `LootEvent` is a *line*, and no loot line names a zone;
 * it is stamped by the recorder from the log's last zone line, exactly the way a kill record gets
 * its own ([ADR 0136](../../specs/decisions/0136-logged-data-says-where-it-happened.md)). Stored
 * **verbatim**, difficulty and ruleset included, because that is the rule for recorded data
 * ([ADR 0083](../../specs/decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)) — the
 * reader folds it (`placeName`) and reads the difficulty back off it (`zoneDifficultyLabel`).
 *
 * Optional, and it stays optional: every drop recorded before this existed has no zone, and so does
 * one looted before the log had said where you were.
 */
export interface LootRecord extends LootEvent {
  /** The zone the log had last reported when it dropped, as the log wrote it. */
  zone?: string;
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

/**
 * One item the loot ledger has ever seen, and how much of it — the vocabulary of things you have
 * actually held.
 *
 * Derived from the feed rather than stored beside it (ADR 0016), and deliberately keyed by the
 * **log's own spelling**: this is the list search falls back on when the wiki has never heard of an
 * item, so the only name it can offer is the one the game printed.
 */
export interface LootedItem {
  item: string;
  /** Loot lines that named it. */
  count: number;
  /** How many, stacks counted. */
  qty: number;
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
  /**
   * Whether the log wrote the target **without** an article — "Lord Nagafen" rather than "a gnoll
   * pup". It's the only thing a kill line says about what kind of mob died, and it has to be read
   * here because `target` above has already had the article stripped off it
   * ([ADR 0092](../../specs/decisions/0092-a-named-s-respawn-is-learned-from-your-own-kills.md)).
   */
  named: boolean;
  /**
   * The same question about the killer: did *it* lack an article (or was it you)? Together with
   * `named` this is what separates a boss dying from a person dying — both are written without an
   * article, and only the killer differs: a person kills a named, a mob kills a player or a pet.
   */
  killerNamed: boolean;
}

/**
 * You considered something, or hailed it — either way it is **in front of you and alive**.
 *
 * Not a faction reading or a greeting, as far as this app is concerned: it is a free sighting of a
 * mob, which for one being timed is the tightest evidence available and arrives from what a camper
 * does anyway ([ADR 0097](../../specs/decisions/0097-a-sighting-is-the-tightest-evidence-there-is.md)).
 */
export interface SightingEvent extends LogEventBase {
  kind: "sighting";
  /** As the log wrote it, article and all — the reader folds it (`mobKey`). */
  target: string;
  /** Which line said so. Kept because a hail is deliberate and a consider is a glance. */
  how: "consider" | "hail";
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
  | SightingEvent
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
   * True when the line stated no caster, so `attacker` is only the DoT's own name standing in
   * for one. The log gives the caster a line earlier ("You begin casting X"), which is what
   * `dot-attribution.ts` puts back — and it clears this flag when it does
   * ([ADR 0071](../../specs/decisions/0071-a-dot-tick-belongs-to-whoever-cast-it.md)).
   */
  casterUnknown?: boolean;
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

/**
 * A pet of yours confirming an attack order: `Garn told you, 'Attacking a coyote Master.'`
 *
 * The line is *addressed to you* — the game sends a pet's confirmation to its own owner and
 * nobody else — so receiving one is **proof** the pet is yours, not a guess. That matters
 * because the log gives no other way to know: a pet with its own name ("Garn hits a coyote")
 * is written exactly like a player, and the possessive form the rest of the parser leans on
 * (`<Owner>`s warder`) never appears for one. See `pet-registry.ts`.
 */
export interface PetEngageEvent extends LogEventBase {
  kind: "pet-engage";
  /** The pet's own name, as the log spells it. */
  pet: string;
  /** What it was ordered onto. Kept because it names an enemy, same as a swing would. */
  target: string;
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
  | InvocationEvent
  | PetEngageEvent;

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
  /**
   * Of `damage`, what the ticks did — so a DoT's total can be read as "the hit plus what it
   * ticked for" rather than one opaque number. Absent on fights stored before it was recorded.
   */
  tickDamage?: number;
  /** The biggest single tick, which is what a DoT's *rate* is felt as. Absent on old fights. */
  maxTick?: number;
  fizzles: number;
  interrupts: number;
  resists: number;
  blocked: number;
  /** Damage this spell did, first landing + every tick. */
  damage: number;
  healed: number;
  maxHit: number;
  /**
   * What one cast costs in mana, from the game's own `spells_us.txt` — the log never says.
   * **Absent means unknown** (no spell file, or a name it doesn't list); `0` is a real answer
   * and means the spell is free, as bard songs are. The two must not be conflated.
   *
   * Read for the **rank actually cast** where the log gave one, so a rank VI nuke quotes its own
   * cost rather than the base spell's. See `electron/spells.ts`.
   */
  manaCost?: number;
  /**
   * Mana this spell has cost over the window — `casts × manaCost`. Absent when the cost is.
   *
   * **Derived, not observed.** The log reports no mana, so this assumes every cast begun spends
   * its mana, including one that fizzled or was interrupted — which is how EQ has always behaved,
   * and is why a fizzle stings. If that's wrong for some spell, this over-counts it.
   */
  manaSpent?: number;
  /**
   * What a point of mana bought — damage, **plus** any healing the invocation granted off that
   * damage, since the mana paid for both and damage alone understates the spell.
   *
   * Absent when the cost is unknown, and **absent rather than zero for a spell that costs
   * nothing**: dividing by no mana isn't an efficiency, it's a different kind of spell.
   *
   * Divided by mana *spent*, not mana that landed — a fizzle costs you the same and should
   * hurt the figure.
   */
  damagePerMana?: number;
  /** Healing per point of mana, on the same terms — for spells whose job is healing. */
  healPerMana?: number;
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

/**
 * Why a fight stopped being the current fight.
 *
 * [ADR 0036](../../specs/decisions/0036-a-fight-ends-on-death-not-a-lull.md) already draws the
 * distinction that matters — a **resolved** fight (something died) closes after a short quiet,
 * while an unresolved one needs a much longer silence — and the tracker computes which applied.
 * Naming it is what makes an odd row explicable: a fight that ran 90 seconds and ended in a
 * `timeout` is a mob that fled, a kite that ended, a zone-out or a lagging log, and reads
 * completely differently from the same 90 seconds ending in a `kill`.
 *
 * - `kill` — the last thing to happen was something dying to you.
 * - `death` — the last thing to happen was *your* death.
 * - `timeout` — nothing resolved it; the enemy was presumably still up when the log went quiet.
 * - `cut` — the fight didn't end in the log at all. The meter was reset, or the tracker was
 *   flushed (app closing, character switching), and the fight was banked mid-flow.
 */
export type FightEndReason = "kill" | "death" | "timeout" | "cut";

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
  /**
   * Mana your spells cost in this window, summed from the ones we have a cost for. Absent when
   * no spell file is loaded; a partial figure when only some spells were found, which is why it
   * travels with `manaKnownCasts` rather than alone.
   */
  manaSpent?: number;
  /**
   * How many of the window's casts had a known cost, and how many there were. What lets a UI say
   * "1,240 mana over 38 of 41 casts" instead of quietly presenting a short total as the whole.
   */
  manaKnownCasts?: { known: number; total: number };
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
  /**
   * Combatants in this window that nothing had placed — not you, not yours, not a group-mate, and
   * neither a creature with an article nor one your side traded blows with. A bare name like that
   * could be your pet, a group-mate or a stranger, and
   * [ADR 0077](../../specs/decisions/0077-a-pet-is-proven-not-guessed.md) refuses to guess.
   *
   * Present means **this window's own figures are provisional**: whose the damage is has not been
   * settled, so `yourDealt` and everything derived from it may move once it is
   * ([ADR 0130](../../specs/decisions/0130-data-in-doubt-says-so.md)). Computed on read, so it
   * clears itself the moment the log says who somebody was — and re-derives away entirely once the
   * fight is read again ([ADR 0128](../../specs/decisions/0128-a-fight-is-re-derived-not-refused.md)).
   *
   * Absent is the ordinary case and means "nothing here was in question".
   */
  unsettled?: string[];
  /**
   * Why this fight ended — see `FightEndReason`. Only meaningful on a **finished** fight, so
   * the live window carries it once it's been banked and never before.
   *
   * Absent has exactly one meaning: the fight was stored before this was recorded ([ADR
   * 0021](../../specs/decisions/0021-stored-fights-keep-their-source.md) — old records keep the
   * shape they were written with). A fight the log didn't end says `cut` rather than nothing,
   * so "we don't know" and "nothing ended it" stay tellable apart.
   */
  endReason?: FightEndReason;
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
  /**
   * Set when its log file can no longer account for it — the file was rotated or truncated under
   * it, so a re-derivation covered a range this fight sits outside of. It is kept and says so
   * rather than being dropped ([ADR 0128](../../specs/decisions/0128-a-fight-is-re-derived-not-refused.md)):
   * the fight happened, and its figures are simply frozen at whatever the rules said when it was
   * filed. Absent means "we have no reason to think otherwise", not "checked and fine".
   */
  unsourced?: boolean;
  stats: FightStats;
}

/**
 * One fight a replay of a log derived, offered to `CombatHistory.rederive`. The replay states what
 * it read and nothing about where it should be filed — that is the history's to keep (ADR 0128).
 */
export interface DerivedFight {
  stats: FightStats;
  zone?: string | null;
  /**
   * The sitting the log's own login lines put it in, or **absent** when the replay hadn't seen a
   * login yet. Absent is a real answer: the live path was in a `run:` session it invented for
   * itself, which a replay can't reproduce and mustn't invent a rival for.
   */
  sessionId?: string;
}

/** What re-deriving one log file's fights came to. */
export interface RederiveOutcome {
  /** Stored fights whose figures were re-derived in place — the same fight, new numbers. */
  refreshed: number;
  /** Fights today's rules find that the stored history didn't hold. */
  added: number;
  /**
   * Stored fights the new pass replaced without a counterpart, because a rule change moved a
   * boundary — their damage now sits inside one of the fights it did produce.
   */
  superseded: number;
  /** Stored fights from this log that the file can no longer account for — see `StoredFight.unsourced`. */
  unsourced: number;
  /**
   * Fights the replay derived that the history's own cap dropped again as too old to keep. Counted
   * apart from `added` because they are not on record: a log holding more fights than the cap would
   * otherwise report adding hundreds every time it was read, none of which survived the sentence.
   */
  trimmed: number;
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
  /** A fight here had somebody nothing could place, so the camp's figures inherit that doubt (ADR 0130). */
  unsettled?: boolean;
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

/**
 * What a history search came back with: the matching fights, newest first and **capped** by the
 * store, plus how many matched altogether. The total is what lets the list say "the newest 100 of
 * 342" — a truncated answer that looks complete is worse than no answer.
 */
export interface FightSearch {
  fights: StoredFight[];
  total: number;
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
  /**
   * A fight in it had a combatant nothing could place, so these totals are provisional in the same
   * way that fight's are — see `FightStats.unsettled` and
   * [ADR 0130](../../specs/decisions/0130-data-in-doubt-says-so.md). A sum of a doubtful figure is a
   * doubtful figure, and a total that hid that would be the quiet kind of wrong.
   */
  unsettled?: boolean;
}

// ─── High scores (personal bests) ───────────────────────────────────────────

/**
 * A number offered to the board — one reading of one moment, before anything has decided whether
 * it's a record. Made by `src/shared/high-scores.ts` from a combat event or a finished fight.
 */
export interface ScoreCandidate {
  /** Which category it's a candidate in — see `categoryOf`, which also resolves the family ids. */
  categoryId: string;
  value: number;
  /** The log's own timestamp for the moment it happened. */
  at: string;
  /** What did it, and to whom — "Ice Comet on a froglok shaman". */
  detail?: string;
  /** Offered off a fight whose combatants weren't all placed — see `HighScore.unsettled`. */
  unsettled?: boolean;
}

/**
 * A record standing in one category: the best you have ever done, and enough about it to be worth
 * looking at a month later.
 */
export interface HighScore {
  categoryId: string;
  value: number;
  at: string;
  detail?: string;
  /** Where it happened, when the log had told us. */
  zone?: string;
  /**
   * The figure this beat. **Absent means it set the bar** — the first score in a category, which is
   * why nothing celebrates it: there was nothing to beat (see `electron/high-scores.ts`).
   */
  previous?: number;
  /** How many times this category's record has changed hands. A 1 is a bar nobody has cleared yet. */
  beaten: number;
  /**
   * Taken from a fight that had a combatant nothing could place, so the figure is **provisional** —
   * the record may be too low (a pet's damage not yet counted as yours) or too high (a stranger's
   * counted when it shouldn't be). Shown as such rather than presented as a settled personal best
   * ([ADR 0130](../../specs/decisions/0130-data-in-doubt-says-so.md)).
   */
  unsettled?: boolean;
}

/**
 * One character's scoreboard. **Per character** — the log file names them, and a level 50's biggest
 * hit is not a bar a new alt should be measured against or made to clear.
 */
export interface ScoreBoard {
  /** Whose board this is, as the log file spells it. Empty before a log has been read. */
  character: string;
  /** Every record standing, in the board's own display order (`scoreOrder`). */
  scores: HighScore[];
  /** Kills since your last death — the live figure the streak record is taken from. */
  streak: number;
  /** Whether past fights on disk have already been read into this board (see `backfill`). */
  seeded: boolean;
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

// ─── Lucy (lucy.allakhazam.com) — the supplementary item source ──────────────
// Live EverQuest's item database, used only where eqlwiki is silent. It knows far more items than
// eqlwiki does and describes a **different game**, so everything below is explicitly second-hand:
// see [ADR 0124](../../specs/decisions/0124-lucy-is-a-second-opinion.md).

/**
 * Whether this server's eras could contain a Lucy item at all.
 *
 * Lucy has no era or expansion field, so this is **derived** from the zones it says the item can be
 * got in, matched against the gazetteer of zones this server runs. `unknown` is a real answer and a
 * common one: an item Lucy lists no mob or merchant for gives nothing to judge by.
 */
export type LucyEra = "in-era" | "out-of-era" | "unknown";

/** One item as Lucy describes it. */
export interface LucyItem {
  /** Lucy's own item id — what its page URL and our cache are keyed by. */
  id: number;
  name: string;
  /** The stat card, in Lucy's words. Same shape as the wiki's so one component renders both. */
  card?: ItemCard;
  /**
   * How to get it: Lucy's "Drops from" and "Sold by" rows, both as NPC + zone. Capped — see
   * `sourceRows`. `ItemSource` so `sources.ts` groups and colours these exactly as it does the
   * wiki's, and the shopping list can tell "kill this" from "buy this" without new code.
   */
  sources: ItemSource[];
  /** How many rows Lucy listed in total — bigger than `sources.length` when the cap bit. */
  sourceRows: number;
  era: LucyEra;
  /** The one-sentence reason for `era`. A derived verdict has to be able to show its working. */
  eraWhy: string;
  fetchedAt: string;
}

/** One row of Lucy's item-name search. */
export interface LucySearchResult {
  id: number;
  name: string;
  /** Lucy's own "Type" column — "Armor", "1H Slashing", "Food". */
  type?: string;
  /**
   * The era verdict **if we already hold this item's page**, and `unknown` until then.
   *
   * Lucy's results list carries no zones, and the verdict is derived from zones — so judging twelve
   * hits would mean twelve page fetches per query, on the one query shape that is by definition a
   * miss. Opening a hit fetches and caches its page, so the answer fills in as you look at things
   * and a repeated search is already judged.
   */
  era: LucyEra;
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
  /**
   * What kind of thing this line is. **Absent means `item`**, which is every entry written before
   * mobs could be listed.
   *
   * A `mob` is a thing to go *kill*, not a thing to *obtain* — it never drops, so it is excluded
   * from loot matching, carries no obtained count, and appears on the Hunt list as a target in its
   * own right rather than as something that might drop. Adding a named used to put its whole loot
   * table on the list (a mob page keeps its drops in `components`), or — if the wiki listed no loot
   * — put the mob's own name down as an item that could never arrive.
   */
  kind?: "item" | "mob";
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
  /**
   * Raise a banner when a loot line satisfies this entry. **Per entry, and off by default** — the
   * list holds twenty Bone Chips as readily as the one robe you are camping, and a banner per chip
   * is the noise an overlay exists to spare you. Same choice a spawn timer's `notify` makes, for
   * the same reason (ADR 0105).
   */
  notify?: boolean;
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
  /**
   * Whether the log named this mob without an article, which is the only evidence a kill line
   * offers that it was a *named* rather than one of a camp's identical spawns (ADR 0092).
   *
   * **Absent means unknown, not "plain".** Every record stored before this was captured lost the
   * article to `stripArticle`, and it cannot be recovered from the name that survived — so an old
   * record starts no timer, and one more kill of the same mob settles it for good.
   */
  named?: boolean;
  /**
   * Whether the *killer* lacked an article, or was you. The other half of telling a named from a
   * person: "Lord Nagafen has been slain by Kainos!" and "Bunnyslayer has been slain by a froglok
   * shaman!" are the same shape, and only this tells them apart. Absent means unknown, and unknown
   * starts no timer — one more kill settles it, exactly as it does for `named`.
   */
  killerNamed?: boolean;
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

// ─── Spawn timers (ADR 0092) ────────────────────────────────────────────────

/** A countdown on the board: the stored timer, plus where it has got to. */
/**
 * What a row on the Timers tab is about
 * ([ADR 0136](../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)).
 *
 * A `mob` has a respawn we're estimating, so it carries evidence, can be corrected, and its clock is
 * started by a death. A `custom` one is a clock the player made — a boat, a lockout, an egg timer —
 * with nothing to be evidence *about*: it starts when they say, repeats if they ask, and none of the
 * sighting controls mean anything on it.
 */
export type SpawnKind = "mob" | "custom";

export interface RunningSpawn extends SpawnTimer {
  state: SpawnState;
  /** What this row is — a mob's respawn, or a clock the player made. See `SpawnKind`. */
  kind: SpawnKind;
  /**
   * Which of its camp's clocks this is, `1`-based. Only worth showing when the camp is running more
   * than one (a placeholder cycle), and it names nothing in the world: the clocks are interchangeable
   * (ADR 0136).
   */
  slot: number;
  /** Draw this countdown over the game for as long as it runs — see `SpawnView.running`. */
  onScreen: boolean;
  /**
   * The saved style this timer wears, if any — the **id**, resolved by whoever draws it. A banner's
   * look is fixed when it fires; a pinned countdown is a live readout, so restyling one moves it
   * while it runs.
   */
  styleId?: string;
}

/** What's known about one named, whether or not it's counting down right now. */
export interface KnownSpawn extends RespawnLearning {
  /** What this row is — a mob's camp, or a clock the player made. See `SpawnKind`. */
  kind: SpawnKind;
  /**
   * A second kill **adds** a countdown instead of restarting the last one — the placeholder answer
   * (ADR 0136). Off by default, because restarting is right for a named and only the player knows
   * whether this camp cycles.
   */
  queue: boolean;
  /**
   * When it comes due, start it again. Custom timers only: re-arming a mob's clock would be
   * inventing a death nobody saw.
   */
  repeat: boolean;
  /** The player's own figure, when they've typed one. Nothing observed overwrites it. */
  stated?: number;
  /**
   * How early to start watching, in seconds — the player's allowance for the things the log can't
   * measure (a placeholder cycle, a mob that walks, wanting to be in position). Absent means none,
   * which is every timer until someone decides this one needs it (ADR 0094).
   */
  lead?: number;
  /**
   * Whether a pop raises a banner. **Off unless asked**: every named you kill is tracked, so
   * alerting for all of them would interrupt an evening for mobs you aren't camping.
   */
  notify: boolean;
  /**
   * A **saved** style (`CastAlertSettings.styles`) for its pop; absent wears the alert defaults.
   * Never a look of its own — one style editor, in one place (ADRs 0086, 0090, 0093).
   */
  styleId?: string;
  /**
   * Keep its countdown on screen over the game. Unlike `notify`, which is about a *moment*, this is
   * a dial to glance at: "how long left" shouldn't cost a window switch away from the fight.
   */
  onScreen: boolean;
  /**
   * The figure that would actually be used and where it came from — absent until there have been
   * two comparable kills and nobody has typed one, which is a blank rather than a guess.
   */
  respawn?: Respawn;
  /**
   * What marking it up has taught — the tightest death-to-sighting gap and how many there were.
   * Shown beside the kill-gap figures so the *evidence* can be judged rather than only the answer:
   * a wonky number is fixable only if you can see which source it came from.
   */
  seen?: Sighting;
  /**
   * What saying it was **not** up yet has taught — the only lower bound here, and the one piece of
   * evidence that can prove the estimate wrong rather than merely soft.
   */
  floor?: Floor;
  /** Whether a countdown for it is currently on the board. */
  running: boolean;
  /**
   * True when the player typed this row in rather than the kill log producing it — a mob they want
   * timed before they've killed it twice, or a custom timer for something that isn't a mob at all.
   * Only such a row can be removed; one the kill log produced would simply come back.
   */
  added: boolean;
}

/**
 * Everything the Timers tab draws. `now` travels with it rather than being read in the renderer, so
 * a countdown is measured against the same clock that decided the timer was due — otherwise a row
 * can read `0:00` for a second while main still calls it waiting.
 */
export interface SpawnView {
  now: string;
  running: RunningSpawn[];
  known: KnownSpawn[];
  /**
   * Mobs the player has said aren't nameds, by display name. Listed rather than simply absent
   * because dismissing one **removes its row**, and the only control that could reverse that was
   * on the row — so without this, "not a named" is a one-way door.
   */
  dismissed: string[];
}

/**
 * Which kills the map should pick out: some mobs', or a single kill by id. Transient — it lives
 * for as long as a cursor rests on a name, and is never stored.
 *
 * It sits in shared types rather than beside the kill list because it's asked for from two
 * windows now: the map's own ☠ list, and the main window's Hunt tab (over `map.emphasize`). Both
 * are the same question — "where did those die?" — so they send the same shape.
 */
export interface KillEmphasis {
  /**
   * The mobs to ring. Usually one — a hovered row — but pointing at a *drop* asks about every mob
   * known to give it up, and "where do snake fangs come from" is one question with several answers,
   * not several questions. A list rather than a name for exactly that reason.
   */
  mobs?: string[];
  id?: string;
}

/**
 * What a window opening the map wants **brought up with it** — the evidence behind the position it
 * just asked for (ADR 0104).
 *
 * A marker says "here"; it can't say *why* here. These name the mob and the drop the coordinate was
 * derived from, so the map can open its 📖 knowledge panel narrowed to exactly that row instead of
 * leaving a star on a map with nothing to read it against.
 */
export interface MapFocus {
  /** Narrow the map's lists to this mob, and ring its kills. */
  mob?: string;
  /** Narrow them to this drop too, so the row that answers "where did it drop" is the one shown. */
  drop?: string;
}

/**
 * Somewhere to show on the map, whole — the one shape every "show me on the map" click sends.
 *
 * Four kinds of click ask for this (a zone name, a wiki `Location:` coordinate, an observed roam
 * centre, a drop row) and they differ only in how much they can say about it, which is why this is
 * one optional-tailed shape rather than four call signatures. `showOnMap` in `src/lib/showOnMap.ts`
 * is the only thing that sends it, and `MapLink` the only thing that draws a click for it.
 */
export interface MapTarget {
  zone: string;
  /** EQ y,x. With one, the map drops a marker there; without, it just views the zone. */
  loc?: { y: number; x: number };
  /** What to write on that marker. */
  label?: string;
  /** What the position *is*, so the map can bring up the evidence behind it (ADR 0104). */
  focus?: MapFocus;
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
 * Which part of what the log said a condition reads.
 *
 * `subject` is whatever the watch's own trigger matches — the spell name for a cast or a fade, the
 * whole sentence for a raw-text watch — so a condition can narrow the same thing the trigger widened
 * without having to know which kind of event it turned out to be.
 */
export type WatchField = "subject" | "caster" | "target" | "line" | "zone";

/** How a condition compares its text. `contains` is the rule every watch had before conditions. */
export type WatchOp = "contains" | "exact" | "starts" | "ends";

/**
 * One extra thing that must (or must not) be true for a watch to fire.
 *
 * Conditions are how a watch stops being one substring: "Fear, but not from a warder", "any tell,
 * but only in Lower Guk", "Mesmerize *or* Dazzle". Everything about them is case-insensitive, like
 * the trigger, and a blank `text` is ignored rather than matching everything — a half-typed
 * condition must not quietly change what a watch does.
 */
export interface WatchCondition {
  field: WatchField;
  op: WatchOp;
  text: string;
  /**
   * Invert it: the watch fires only when this *doesn't* match. An exclusion is always an extra hurdle
   * (it is `and not`, never `or not`) whatever `match` says, because "any of these, or not that" is
   * not a thing anyone means.
   */
  exclude?: boolean;
}

/**
 * A spell to watch for being cast, so the user gets a heads-up to prep a dispel/cure.
 * `spell` is matched case-insensitively as a **substring** of the cast spell's name, so
 * "Fear" catches any spell whose name contains it.
 *
 * Everything past `spell` is optional and absent means the behaviour the watch had before that field
 * existed, which is what lets a settings file written by any older build keep working untouched.
 */
export interface CastWatch {
  id: string;
  spell: string;
  enabled: boolean;
  /**
   * Extra conditions on the same match (see `WatchCondition`). Empty or absent is a watch that is
   * only its trigger, which is every watch until one asks for more.
   */
  conditions?: WatchCondition[];
  /**
   * Whether the trigger and the **included** conditions must *all* hold (default) or *any* of them.
   * `any` is how one watch covers a family the trigger can't spell as a substring — "Mesmerize" or
   * "Dazzle" — and it never loosens an exclusion, which is always `and not`.
   */
  match?: "all" | "any";
  /**
   * Also alert when this spell is cast by a *named* caster — another player, a pet, or a named
   * NPC (anyone whose log name has no "a/an/the" article), not just an ordinary mob. Off by
   * default: a groupmate casting Charm isn't a threat to prep against. See `matchCast`.
   */
  includePlayers?: boolean;
  /**
   * Whether **your own** casts fire this watch, overriding `CastAlertSettings.includeSelf` for this
   * one. Absent follows the group setting, which is what every watch did before rules existed.
   *
   * It has to be per watch as well as global, because the whole class of self-cued reminders — "you
   * cast mez, so recast it in 25 s" — is *only* about your own casts, and turning the group setting
   * on to get one of them would make every other watch fire on you too.
   */
  includeSelf?: boolean;
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
   * What the banner should say, instead of the sentence built from `spell`. The trigger and the
   * message are separate things: a watch has to match the words the *log* used ("light breeze"),
   * while the prompt you want on screen is your own ("RE-CAST BREEZE"). Empty or absent keeps the
   * built sentence, which is right whenever the spell's name is already the whole message.
   */
  message?: string;
  /**
   * Hold this watch's alert for a while instead of raising it the moment it matches, which turns a
   * warning into a **cue**: "recast the mez" 25 s after you cast it, "the placeholder's back" 8 m
   * after it died. Stored as the player typed it (`25`, `25s`, `8m` — bare is seconds, up to 30
   * minutes); absent or empty means fire now, which is every watch until one asks otherwise. Only
   * the *alert* waits — nothing else this line feeds is delayed. See `alertCue` in
   * `alert-schedule.ts`.
   */
  delay?: string;
  /**
   * Say it again this many times after the first, one `delay` apart — "recast it" every 30 s until
   * something stops it. Absent or 0 is a single alert. Worth having only alongside a way to stop it,
   * which is what `cancelWhen` and `cancelOnDeath` are for; capped, because a runaway repeat is the
   * one setting that could make the overlay unusable.
   */
  repeat?: number;
  /**
   * What a *second* match does while this watch's cue is still waiting.
   *
   * `restart` (the default) is what a recast reminder wants — mez again and the 25 s starts again.
   * `queue` is what a spawn timer wants — two placeholders died, so two cues are due. `ignore` keeps
   * the first cue's timing whatever else happens. Irrelevant to a watch with no delay: nothing to
   * collide with when the alert has already fired.
   */
  retrigger?: "restart" | "queue" | "ignore";
  /**
   * Whether your own death calls this cue off. `auto` (the default) reads it from the delay's own
   * length — under a minute is a cue about the fight you were in, and "recast it" is noise from a
   * corpse, while a spawn timer doesn't care that you died. The other two say so outright, for the
   * cue where the rule of thumb is wrong. See `alertCue`.
   */
  cancelOnDeath?: "auto" | "always" | "never";
  /**
   * Words that call this watch's waiting cue off — "the mob is dead, stop telling me to re-mez it".
   *
   * Matched against **whole log lines** as they arrive, whatever the watch itself is pointed at,
   * because by the time a cue is waiting the thing that should stop it is rarely the same shape as
   * the thing that started it. A line names no caster we can classify, so `caster` and `target`
   * conditions never hold here; `subject`, `line` and `zone` all do.
   */
  cancelWhen?: WatchCondition[];
  /**
   * A **saved style** this watch wears (`CastAlertSettings.styles`), by id. The point of a saved
   * style is that "how an emergency looks" is a decision worth making once: six watches can share
   * one red-and-loud look, and changing it — in the Saved styles list — changes all six. An id that
   * no longer resolves falls back to the defaults rather than to nothing.
   *
   * A watch wears a saved style **or** has a `style` of its own; changing a shared one from the
   * watch forks it instead of layering (`alert-styles.ts`). The two fields can still both be set on
   * a settings file written before that was settled, and `alertStyle` keeps reading them in order.
   */
  styleId?: string;
  /**
   * This watch's **own** look and sound, belonging to it alone — a style with no name, and nobody
   * else wearing it. Absent means it follows whatever is below: its saved style, or the defaults.
   * Partial, so a look saved before a field existed still picks that field up from below.
   */
  style?: Partial<AlertStyle>;
}

/**
 * A look and sound with a name, so more than one watch can wear it.
 *
 * Held in the settings rather than copied into each watch, which is the whole difference: a copy is
 * a decision frozen at the moment it was made, and this is one you can still change your mind about.
 */
export interface NamedAlertStyle {
  id: string;
  name: string;
  style: AlertStyle;
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
   * Named looks a watch can wear by id (`CastWatch.styleId`), so "the loud red one" is a decision
   * made once and shared. Absent on a settings file written before they existed.
   */
  styles?: NamedAlertStyle[];
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
 * A tracked item that just dropped, as the banner needs it.
 *
 * Raw rather than pre-worded, the way a `HighScore` is: what the overlay wants to say is "that's
 * the third of five", and the counts are the sentence. `needed` is the **effective** need — the
 * entry's own count scaled by its group's runs (`effectiveNeeded`) — because that is the figure the
 * list row shows, and a banner disagreeing with the row it came from is worse than no banner.
 */
export interface LootAlert {
  /** The item as the loot line named it. */
  item: string;
  /** The corpse it came off, for "from a froglok tad". */
  source: string;
  /** How many the line reported — a stack of 2 moves the list 2 closer to done. */
  qty: number;
  /** How many you hold now, this line included. */
  obtained: number;
  /** How many this entry wants, its group's runs applied. */
  needed: number;
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
   * repeats what the game said; a **record** says well done, a **spawn** says a named you were
   * timing is back, a **timer** is a clock the player made reaching its end — which is *not* a spawn
   * and must not claim to be one
   * ([ADR 0135](../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md))
   * — and a **loot** says something on your list has just dropped — the last three
   * being the ones that aren't warnings. Absent means a cast, so an alert sent by an older build
   * still reads correctly.
   *
   * A **buff** is a lapse of something you were keeping up. It is *not* a `fade`, though both come
   * from a buff ending: a fade is a watch the player wrote firing on a line, and says whatever that
   * watch says, while this is the buff board reporting that a thing it was tracking is now missing —
   * and it carries the buff itself, so the banner can name a target the log's own sentence didn't.
   */
  event?: "cast" | "fade" | "line" | "record" | "spawn" | "timer" | "loot" | "buff";
  /** For a fade, who it wore off ("your pet", a mob). Absent means it was on you. */
  target?: string;
  /**
   * For a `line` alert, the log line that matched (timestamp stripped). The banner shows the
   * game's own words, because for a line watch that sentence *is* the whole message.
   */
  text?: string;
  /**
   * The matching watch's own wording (`CastWatch.message`), if it gave one — shown in place of the
   * sentence the banner would otherwise build. Resolved here rather than in the overlay for the
   * same reason the style is: the overlay never sees the watch that matched.
   */
  message?: string;
  /**
   * For a `record` alert, the personal best that was just set. The banner is built from it in the
   * overlay rather than pre-worded here, because unlike a watch the *catalog* is shared code — so
   * the overlay can name and format the category itself (`src/shared/high-scores.ts`).
   */
  record?: HighScore;
  /**
   * For a `loot` alert, the drop that satisfied a list entry — carried raw for the same reason a
   * record is: the counts *are* the message, and the overlay can word them itself.
   */
  loot?: LootAlert;
  /**
   * For a `buff` alert, the buff that lapsed — carried raw for the same reason a record and a drop
   * are: the overlay can word it itself from shared code (`lapseMessage`), and the *target* is the
   * part the game's own sentence usually leaves out.
   */
  buff?: BuffInstance;
  /**
   * The look and sound this alert should use, already resolved from the defaults and the watch's
   * own overrides (`alertStyle`). Carried with the alert so the overlay renders what *this* watch
   * asked for — it can't work that out itself, and an alert already up mustn't be restyled by
   * the next one. Absent only from an older build's payload, where the defaults stand in.
   */
  style?: AlertStyle;
}

// ─── Settings ───────────────────────────────────────────────────────────────

/**
 * **How a window was left** — the per-window condition restored on the next launch, stored beside
 * that window's bounds in `window-state.json` rather than in Settings
 * ([ADR 0074](../../specs/decisions/0074-how-a-window-was-left-is-window-state.md)).
 *
 * Each of these is a fact about *one* window ("this one is pinned, this one is see-through"), not a
 * preference for the app — which is why none of them is a setting, and why the two windows can
 * disagree. What the app-wide preference *is* (how translucent, how large) stays in
 * `OverlaySettings`; these say what each window did with it.
 *
 * Every field is optional: absent means "never said", which is what lets a default change.
 */
export interface WindowToggles {
  /** Always-on-top (📌). */
  pinned?: boolean;
  /** The ◐ override: this window at full opacity rather than the saved slider. */
  opaque?: boolean;
  /** Click-through (👻) — clicks over the window's pass-through region go to the game. */
  clickThrough?: boolean;
}

export interface OverlaySettings {
  /**
   * Translucency for **every** window (0.2–1) — one look for the whole app, unlike the scale,
   * which the map holds its own copy of. Each window's titlebar ◐ can still flip *itself* to
   * fully opaque without touching this or the other windows (see `useWindowOpacity`).
   */
  opacity: number;
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
  /**
   * Ask Lucy (lucy.allakhazam.com) about names eqlwiki couldn't answer. Default **on**: it is a data
   * source like the wiki rather than an exposure like `connectPeers`, and a supplementary source
   * nobody switches on is a feature nobody has. Off makes the app talk to eqlwiki and nothing else.
   */
  askLucy: boolean;
  /** Opt-in: join the awari peer-to-peer network (see peers + send pings). Default off. */
  connectPeers: boolean;
  /** Broadcast your live location to peers (requires `connectPeers`). Default off. */
  shareLocation: boolean;
  /**
   * Which kinds of data peers may **ask** you for, by `ShareKind` (`src/shared/peer-share.ts`).
   * All off until switched on, per kind, in the Peers tab; `connectPeers` gates the lot.
   *
   * A separate field from `shareLocation` rather than a member of it, because a location is
   * published at everybody continuously while these are only ever handed over on request — the
   * thing being consented to is not the same shape (ADR 0141). Absent on a settings file written
   * before the Peers tab existed, which reads as "nothing shared", the correct default.
   */
  share?: ShareSettings;
  /** Display name shown to peers; blank = derived from the log file's character name. */
  playerName: string;
  /** Override for the awari bootstrap-service URL; blank = the live default. */
  bootstrapUrl: string;
  /** Alert when a watched spell begins casting, so you can prep a dispel/cure. */
  castAlerts: CastAlertSettings;
  /** Personal bests, and whether beating one is worth a banner. */
  highScores: HighScoreSettings;
  /** Which ways of getting about a route may assume you have. */
  travel: TravelSettings;
  overlay: OverlaySettings;
  debug: boolean;
}

/**
 * Whether a new personal best says so, and what it looks like when it does.
 *
 * It carries no look of its own, only a **pointer** to one: a `styleId` from `castAlerts.styles`, or
 * nothing for the defaults. That's deliberate — [ADR 0086](../../specs/decisions/0086-editing-a-shared-style-from-a-rule-forks-it.md)
 * settled that a look is a shared, named thing edited in one place, and a second style editor living
 * on the scoreboard would be exactly the third source of truth that ADR exists to prevent. So a
 * celebration wears a saved style, and is styled where every other alert is.
 *
 * The banner rides the cast-alert overlay, which only exists while `castAlerts.enabled` — so this
 * being on is necessary but not sufficient, and the scoreboard says so rather than going quiet.
 */
export interface HighScoreSettings {
  /** Put a banner up when a record falls. The board itself is kept either way. */
  celebrate: boolean;
  /** A saved style (`CastAlertSettings.styles`) for the celebration; absent = the alert defaults. */
  styleId?: string;
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
  /**
   * Particular places a route may not use, on top of the four toggles.
   *
   * **A port is a spell, and a spell has a level.** "I can get a druid port" is not the same claim as
   * "I can get *every* druid port", so a toggle alone can only be turned off — losing every ring to
   * dodge the one you can't cast yet. This is the finer answer: name the ring, keep the network, take
   * the next best route ([ADR 0109](../../specs/decisions/0109-a-route-can-be-denied-one-place.md)).
   *
   * A setting for the same reason the toggles are one: which ports you have is a fact about *you*. It
   * carries each place's words as well as its id, because once a place is out of every route nothing
   * else can name it — the graph never leaves the main process.
   *
   * **Node ids belong to the pack they were built from** (a border is `zoneA|zoneB` and stable; a place
   * is `<zone>#<slug of that pack's label>` and is not), so switching map source can leave an entry
   * matching nothing. It then does nothing and can be cleared — the panel lists every one of them, so
   * a stale entry is visible rather than a silent hole in your routes.
   */
  avoid: TravelAvoided[];
}

// ─── Watcher status ─────────────────────────────────────────────────────────

/**
 * A slice of the log file, as read for a rule's check (`log.recent`).
 *
 * **Text, not lines**: at the deep end of the ladder this is tens of thousands of lines, and a
 * structured-clone of that many small objects across the IPC boundary costs far more than the
 * string they came from — while parsing on the far side is work the replay was going to do anyway.
 */
export interface LogTail {
  /** Whole lines only — a slice starting mid-file has its part-line dropped. */
  text: string;
  bytes: number;
  /** The read reached the start of the file: there is no "further back" left to search. */
  whole: boolean;
}

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
  /**
   * A peer's **catalogue**: which share kinds they're offering, how many rows each holds, and a
   * revision that moves when they change (`ShareOffer`). The only kind besides `hello`, `loc` and
   * `ping` that is still broadcast to the room — everything below it is peer-routed
   * ([ADR 0141](../../specs/decisions/0141-the-room-is-a-meeting-place.md)).
   */
  offer: "offer",
  /** Direct: "send me this kind" (`ShareAsk`). Goes to one peer, over their own connection. */
  ask: "ask",
  /** Direct: the answer to an `ask` (`ShareGive`). Only ever sent for a kind whose toggle is on. */
  give: "give",
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

/**
 * Where an outbound payload is going: the room, or one peer.
 *
 * `to` is a **peer id**, not a `PeerRef` — the session id the direct route actually needs is looked
 * up in the owner window's roster on the way out (ADR 0141). Windows and the main process have no
 * business knowing about awari's routing shapes, and the roster is where a peer id becomes a peer
 * anyway; a `to` naming somebody who has since left simply doesn't send, which is the right answer.
 */
export interface AwariOutbound {
  payload: AwariPayload;
  /** Absent = the room. Present = that peer alone. */
  to?: string;
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
  /**
   * The other half of awari's `PeerRef`, needed to address this peer **directly** rather than
   * through the room (ADR 0141). Absent for a peer we've only heard *from* over a route that
   * didn't carry one; such a peer can be listed but not asked.
   *
   * Per-session and transport-only, exactly as the peer id is
   * ([ADR 0015](../../specs/decisions/0015-peer-presence-via-hello.md)) — a session id is the same
   * kind of fact and no more of an identity.
   */
  sessionId?: string;
  name?: string;
  zone?: string;
  /**
   * What they've said they're sharing (`ShareOffer` from `peer-share.ts`), from their last `offer`.
   * Absent means they haven't said — which is different from sharing nothing, and the panel words
   * it that way. Typed loosely here so `types.ts` doesn't have to depend on the share catalogue.
   */
  offer?: Record<string, { n: number; rev: number }>;
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
  /** Fights filed into history that it didn't already hold. */
  fights: number;
  /** Play sittings found, one per login line. */
  sessions: number;
  /** Drops added to the loot feed (and so to the prices derived from it). */
  loot: number;
  /**
   * Drops the ledger **already held** and can now say the zone of. Counted apart from `loot` because
   * nothing was added: the same line is merely better described than it was
   * ([ADR 0137](../../specs/decisions/0137-a-filed-drop-can-still-learn-where-it-was.md)). This is
   * what a re-read is worth to the Loot tab, and on a log whose drops were all recorded live it is
   * the only non-zero figure in this result.
   */
  placed: number;
  /**
   * Fights already on disk whose figures this reading **replaced** — the point of eating a log you
   * have eaten before (ADR 0128). Kills and drops still dedupe and are still reported as zero.
   */
  refreshed: number;
  /** Stored fights this reading replaced without a counterpart, a boundary having moved. */
  superseded: number;
  /** Stored fights from this log the file can no longer account for (rotated or truncated). */
  unsourced: number;
  /** Fights the log holds that the history's cap wouldn't keep — why a long log doesn't grow the list. */
  trimmed: number;
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
      /**
       * What the entry *is*, when it isn't an item — `wikiAddKind` answers this from the page. A mob
       * that arrives without it is filed as something to loot, which is the one thing it can't be.
       */
      kind?: ShoppingListEntry["kind"];
      needed?: number;
      wikiPath?: string;
      note?: string;
      origin?: { kind: WikiPageKind; name: string };
    }): Promise<ShoppingList>;
    /** Add every component of a scraped quest/recipe at once. */
    addFromPage(page: WikiPage): Promise<ShoppingList>;
    update(
      id: string,
      patch: Partial<Pick<ShoppingListEntry, "needed" | "obtained" | "note" | "notify">>,
    ): Promise<ShoppingList>;
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
  /**
   * Lucy — Live EverQuest's item database, the app's **third and least trusted** source. Asked only
   * where eqlwiki is silent, cached for a month, and never fetched unasked
   * ([ADR 0124](../../specs/decisions/0124-lucy-is-a-second-opinion.md)).
   *
   * Every method answers `[]` / `null` when the source is switched off (`settings.askLucy`), so a
   * caller never has to check first.
   */
  lucy: {
    /** Items whose name contains the term. Literal substring match — Lucy has no fuzzy search. */
    search(term: string): Promise<LucySearchResult[]>;
    /** One item, by Lucy's id. Costs one request unless it's cached. */
    getItem(id: number): Promise<LucyItem | null>;
    /** What the cache already holds for a name — no request, so it's safe on any render. */
    cachedByName(name: string): Promise<LucyItem | null>;
    /**
     * Open an item on Lucy in the external browser — **by id when one is known, by name otherwise.**
     *
     * The name form goes to Lucy's own search, which redirects to the item when the name matches one
     * and lists them when it matches several. That is what lets every item in the app offer the link
     * beside its eqlwiki one, whether or not we have ever fetched it: the browser does the looking up,
     * so the link costs this app nothing.
     */
    openInBrowser(target: number | string): Promise<void>;
  };
  loot: {
    /**
     * The most recent drops (newest first), tracked in the main process so the feed is complete
     * even when the Loot tab wasn't open. Pair with `onEvent` for live appends.
     */
    recent(limit?: number): Promise<LootRecord[]>;
    /** What each item has auto-sold for, biggest earner first. */
    prices(): Promise<ItemPrice[]>;
    /**
     * Every distinct item the ledger holds, most-looted first. Search reads it so a name the wiki
     * has never heard of can still be found by the player who has looted forty of them (ADR 0103).
     */
    items(): Promise<LootedItem[]>;
    /** Every parsed loot line, whether or not it's on the list — as recorded, so it names its zone. */
    onEvent(cb: (event: LootRecord) => void): Unsubscribe;
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
     * The same, wearing a look that belongs to no rule — for trying a style **while editing it**:
     * the defaults, a saved style, or a rule's own look. The shape is the ordinary cast banner,
     * since what's being judged here is how it looks rather than what it says.
     */
    preview(style: AlertStyle): Promise<void>;
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
    /**
     * The tail of the log being watched, as **text** — what the Alerts tab replays a rule against
     * (`dryRun`, after `parseLogText`). Read from the file on each call, so it covers last night as
     * well as this minute, and `bytes` says how far back to go (`TAIL_STEPS`, the "search further
     * back" ladder). Empty only when there's no log to read; `whole` means there is no further back.
     */
    recent(bytes?: number): Promise<LogTail>;
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
    /**
     * Stored fights whose mob name or zone matches `term`, across every session — newest first,
     * capped by the store, with the full match count alongside.
     */
    searchFights(term: string): Promise<FightSearch>;
    /** Forget all stored history (the live meter is untouched). */
    clearHistory(): Promise<SessionSummary[]>;
  };
  /**
   * The scoreboard: your character's personal bests, and the celebration when one falls.
   * See `electron/high-scores.ts` for what's kept and `src/shared/high-scores.ts` for the categories.
   */
  records: {
    /** The current character's board — every record standing, in display order. */
    board(): Promise<ScoreBoard>;
    /** Fires when a record falls, so an open scoreboard updates itself as you play. */
    onRecord(cb: (record: HighScore) => void): Unsubscribe;
    /**
     * Show a sample celebration on the overlay, wearing the look records are set to use — the 🔔
     * beside the toggle, so "is this loud enough" is answerable without waiting for a real one.
     */
    test(): Promise<void>;
    /** Wipe this character's board. Other characters' boards are untouched. */
    clear(): Promise<ScoreBoard>;
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
    /** Who has pooled with us, newest report first. */
    contributors(): Promise<KnowledgeContributor[]>;
    /**
     * Forget one contributor's contributions (by id), or everybody's when given nothing. Takes
     * their shared kills with it — they are one contribution in two stores. Your own observations
     * are derived from the kill log and untouched either way.
     */
    forgetPeers(id?: string): Promise<void>;
  };
  /**
   * What other players have contributed. Filed by the main process as it arrives — no window has to
   * be open for a room to teach this install anything (see `electron/ipc.ts`).
   */
  peers: {
    /** Kill positions peers have shared, optionally for one place. */
    kills(zone?: string): Promise<SharedKill[]>;
    /** Fires when a contribution is filed or a contributor is forgotten. */
    onChanged(cb: () => void): () => void;
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
  /**
   * Respawn timers for the nameds you kill, learned from the gaps between your own kills
   * ([ADR 0092](../../specs/decisions/0092-a-named-s-respawn-is-learned-from-your-own-kills.md)).
   * The learned figure is an **upper bound** and every reader has to say so.
   */
  spawns: {
    /** Running countdowns and what's known about each named. `now` comes with it — see `SpawnView`. */
    view(): Promise<SpawnView>;
    /** Your own figure for a mob's respawn, in seconds — or `null` to fall back to what was learned. */
    state(key: string, seconds: number | null): Promise<SpawnView>;
    /**
     * How early to be told, in seconds — `null` for not early at all. The knob for everything a
     * respawn is soft about, which is why it's yours to set rather than inferred: a placeholder
     * cycle, a mob that walks, or just wanting to be sitting there when it matters.
     */
    pad(key: string, seconds: number | null): Promise<SpawnView>;
    /**
     * You can see it — the mob is up now. Ends the countdown (the row reads ALIVE, a fact rather
     * than a guess) and records the gap since it died as the tightest evidence there is: unlike a
     * kill gap it excludes the time you'd spend reaching the mob and killing it.
     */
    markUp(key: string, id?: string): Promise<SpawnView>;
    /**
     * You're standing there and it is **not** up — disagreeing with a countdown that says it should
     * be. Records the only lower bound the app has: the window may not open before it, and where it
     * passes the estimate the two are reported as contradicting.
     */
    markNotUp(key: string, id?: string): Promise<SpawnView>;
    /**
     * Start the clock from this moment — "it's dead now" for a mob, "go" for a timer you made. The
     * hand-operated twin of a kill line, for when the app wasn't watching or a pull went unlogged.
     * Seeds a countdown only: one death measures no respawn, so it teaches the estimate nothing.
     * On a `queue` camp it adds a clock rather than restarting the last (ADR 0136).
     */
    markDead(key: string): Promise<SpawnView>;
    /**
     * Put a timer on the board by hand — a mob you haven't killed twice yet, or something that
     * isn't a mob at all. `zone` may be blank and `seconds` may be omitted. `kind` says which of the
     * two it is rather than leaving it to be inferred from whether a kill line ever matches: a
     * `custom` timer claims nothing about a named and wears none of a mob's controls (ADR 0136).
     */
    add(name: string, zone: string, seconds?: number | null, kind?: SpawnKind): Promise<SpawnView>;
    /** Take a hand-added row off the board, with everything set on it. */
    remove(key: string): Promise<SpawnView>;
    /** Whether this mob's pop raises a banner. Off by default. */
    notify(key: string, on: boolean): Promise<SpawnView>;
    /**
     * Which saved style its pop wears — `null` for the alert defaults. A saved style or nothing:
     * looks are made and edited in the Alerts tab, and there is exactly one place that happens.
     */
    style(key: string, styleId: string | null): Promise<SpawnView>;
    /** Keep this countdown on screen over the game while it runs. */
    showOnScreen(key: string, on: boolean): Promise<SpawnView>;
    /**
     * Correct the article test about a mob: `true` rescues a named the log wrote with an article,
     * `false` silences something that was never a named at all.
     */
    markNamed(mob: string, named: boolean): Promise<SpawnView>;
    /**
     * Throw away what was learned about one timer and learn again from now. The only way *up* from
     * a figure that observation can only ever tighten.
     */
    relearn(key: string): Promise<SpawnView>;
    /** Drop just the sightings — the narrow fix for one mis-clicked "It's up". */
    forgetSightings(key: string): Promise<SpawnView>;
    /** Drop just the "not up yet" observations. */
    forgetFloor(key: string): Promise<SpawnView>;
    /**
     * Throw out one measured gap, or put it back — the finest correction there is. Everything else
     * that camp taught survives, which is what `relearn` cannot offer.
     */
    setGapDropped(key: string, id: string, dropped: boolean): Promise<SpawnView>;
    /**
     * Take a countdown off the board without forgetting what it taught. With several running for one
     * camp, `id` says which — omitted, they all go.
     */
    stop(key: string, id?: string): Promise<SpawnView>;
    /**
     * Whether a fresh kill **adds** a countdown or restarts the running one — the placeholder camp's
     * answer (ADR 0136), and the same question `CastWatch.retrigger` asks of a cue.
     */
    queue(key: string, on: boolean): Promise<SpawnView>;
    /** Whether a custom timer starts itself again when it comes due. */
    repeat(key: string, on: boolean): Promise<SpawnView>;
    /** Fires when a timer starts, is due, or ages out, so the tab needn't poll main for the list. */
    onChanged(cb: () => void): Unsubscribe;
  };
  /**
   * Which of your buffs are up, which have lapsed, and what the player decided about each one.
   *
   * Everything returns the whole view for the same reason the spawn board does: these are all small
   * edits to one small list, and handing back the list afterwards means a panel never has to guess
   * what its own click did.
   */
  buffs: {
    view(): Promise<BuffView>;
    /**
     * Watch this spell, or stop. Unchecking is the durable "never tell me about this one" and
     * **keeps the row** — the control that reverses it has to stay somewhere you can find it.
     */
    track(key: string, on: boolean): Promise<BuffView>;
    /** Whether a lapse of this one raises a banner. */
    notify(key: string, on: boolean): Promise<BuffView>;
    /** Whether a lapse of this one stays on screen over the game until it's back up. */
    showOnScreen(key: string, on: boolean): Promise<BuffView>;
    /** Which saved style its banner wears — `null` for the buff default. One style editor, one place. */
    style(key: string, styleId: string | null): Promise<BuffView>;
    /**
     * Forget this spell entirely: the row and everything set on it. It comes back, fresh, if the
     * spell is ever cast again — which is the difference from `track(key, false)`, and why both
     * exist. To silence something for good, uncheck it.
     */
    forget(key: string): Promise<BuffView>;
    /**
     * Dismiss one standing "this is down" without recasting the spell — you know, and you are not
     * going to re-buff it right now. The spell stays tracked, so the next lapse says so again.
     */
    dismiss(key: string, target: string): Promise<BuffView>;
    /** Clear every standing lapse at once — the "I have re-buffed, be quiet" button. */
    dismissAll(): Promise<BuffView>;
    /** Fires when a buff goes up, lapses, or a choice about one changes. */
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
     * Sent by a selector window once it is mounted and listening. Nothing else may call it: it is
     * what puts that window on screen, because a selector that can't take a drag must not be shown
     * ([ADR 0102](../../specs/decisions/0102-a-lookup-never-holds-the-screen.md)).
     */
    ready(): Promise<void>;
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
     * Where every body of stored data stands against the rules that produce it today — what's current,
     * what a parser change has left behind, and what to do about each. The concerns and the staleness
     * rule are in [data-provenance.ts](./data-provenance.ts); the stamps are read by
     * `electron/data-health.ts`. Read on demand: a stamp only changes when its store is written.
     */
    dataHealth(): Promise<DataReportRow[]>;
    /**
     * Stored data changed in bulk — a log was eaten, or a store was cleared. Anything that reads
     * a stored list once when it opens (the fight history, the loot feed) should refetch on this;
     * live events say nothing about a whole file changing underneath.
     */
    onDataChanged(cb: () => void): Unsubscribe;
    /**
     * Run the setup check: every step the app needs in order to do anything, in the order they
     * depend on each other, with the first broken link named and the rest reported as not-yet-checked
     * rather than as further faults. The steps and the skip rule are in
     * [self-check.ts](./self-check.ts); the looking is `electron/self-check.ts`.
     *
     * Always on demand — it touches the disk and the network, and a cached answer is worth nothing
     * to somebody who just changed a setting and pressed the button to see whether it helped.
     */
    selfCheck(): Promise<CheckResult[]>;
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
    /**
     * What the graph knows about **one zone**: its nodes with their positions on that map, and the
     * teleport networks reachable from it — counted rather than listed, because a druid reaches
     * eighteen rings from anywhere and eighteen lines off the edge of the map say nothing.
     *
     * The map draws this while the 🧭 panel is open, and it's what an audit of a pack's labels is
     * done against. `undefined` when no map source answers to `sourceId`, or no zone to `zone`.
     */
    survey(sourceId: string, zone: string, options?: TravelOptions): Promise<TravelSurvey | undefined>;
  };
  map: {
    /** Open (or focus) the sibling map window. */
    open(): Promise<void>;
    /**
     * Open the map window at a zone. With `loc` (EQ y,x — e.g. from a mob's Location
     * coordinate), drop a marker there labeled with `label`; with `focus`, bring up the panel that
     * says what the marker is (ADR 0104).
     */
    openAt(
      zone: string,
      loc?: { y: number; x: number },
      label?: string,
      focus?: MapFocus,
    ): Promise<void>;
    /** Fires in the map window when asked to view a zone / drop a marker (`openAt`). */
    onViewZone(
      cb: (msg: { zone: string; loc?: { y: number; x: number }; label?: string; focus?: MapFocus }) => void,
    ): Unsubscribe;
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
    /** Hand pins a peer shared to the map's own set, opening the map if it's shut (ADR 0141). */
    addPins(pins: MapPin[]): void;
    /** Map window only: pins somebody asked to add to yours. */
    onPinsAdded(cb: (pins: MapPin[]) => void): Unsubscribe;
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
    /**
     * Publish an app payload (relayed to the owner window, which holds the socket).
     *
     * With no `to` it goes to the room, which after [ADR 0141](../../specs/decisions/0141-the-room-is-a-meeting-place.md)
     * is only right for the handful of things everybody wants: a location, a ping, a `hello`, an
     * `offer`. Naming a peer id sends it to that peer alone.
     */
    send(payload: AwariPayload, to?: string): void;
    /** A peer message arrived (owner-relayed to every window; never your own). */
    onMessage(cb: (msg: AwariInbound) => void): Unsubscribe;
    /** Connection status changed (joined? + our peer id). */
    onStatus(cb: (status: AwariStatus) => void): Unsubscribe;
    /** Who else is in the room (roster + the names/zones they've announced). */
    onPeers(cb: (peers: AwariPeer[]) => void): Unsubscribe;
    /** Owner-window plumbing: the broker asks this (owner) window to publish a payload, and where. */
    onPublish(cb: (out: AwariOutbound) => void): Unsubscribe;
    /** Owner-window plumbing: somebody asked for a fresh join (see `peer.rejoin`). */
    onRejoin(cb: () => void): Unsubscribe;
    /** Owner-window plumbing: report an inbound peer message up to the broker. */
    reportMessage(msg: AwariInbound): void;
    /** Owner-window plumbing: report connection status up to the broker. */
    reportStatus(status: AwariStatus): void;
    /** Owner-window plumbing: report the room roster up to the broker. */
    reportPeers(peers: AwariPeer[]): void;
  };
  /**
   * Peer sharing: the offer/ask/give hub, which lives in main
   * ([ADR 0141](../../specs/decisions/0141-the-room-is-a-meeting-place.md)) so an ask is answered
   * whether or not a window happens to be open.
   */
  peer: {
    /** Our own catalogue — what our toggles amount to, with the counts a peer would see. */
    offer(): Promise<Record<string, { n: number; rev: number }>>;
    /**
     * The room as it stands: the connection, and who is in it.
     *
     * The roster and the status are otherwise **events**, which a panel that mounts on a tab click
     * has already missed — so this is how a late reader catches up rather than sitting at zero until
     * somebody happens to join.
     */
    room(): Promise<{ status: AwariStatus; peers: AwariPeer[] }>;
    /**
     * Leave the room and join it again, now.
     *
     * For the failure the app cannot heal by itself: two clients that started together can each
     * create their own room, and the automatic retries are deliberately **bounded** — so a pair that
     * settles split stays split. This was previously only reachable by toggling `connectPeers` off
     * and on, which nobody would guess.
     */
    rejoin(): void;
    /** The rows we'd hand over for one kind, so the Peers tab can show what it is offering. */
    mine(kind: ShareKind): Promise<unknown[]>;
    /** Ask one peer for one kind. A person clicked, so this ignores the automatic cooldown. */
    ask(peerId: string, kind: ShareKind): void;
    /** What peers have given us, newest revision per peer per kind. */
    received(peerId?: string, kind?: ShareKind): Promise<ReceivedShare[]>;
    /** Throw a peer's answers away — one kind, one peer, or the lot. */
    clear(peerId?: string, kind?: ShareKind): void;
    /** Map window only: its pins, which live in its own storage and nowhere main can read. */
    setPins(pins: MapPin[]): void;
    /** The received tray moved. */
    onChanged(cb: () => void): Unsubscribe;
    /**
     * Somebody is newly offering something worth going to look at
     * ([ADR 0143](../../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)) — a kind
     * that has just appeared in their catalogue, coalesced to one per peer.
     */
    onOffered(cb: (notice: PeerOfferNotice) => void): Unsubscribe;
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
     * Drag this window by its titlebar, with Windows-style snapping — the gesture the renderer
     * watches and the main process acts on (`window-drag.ts`). Drive it with `useWindowDrag`
     * rather than by hand: the three calls are one gesture, and a `dragStart` with no `dragEnd`
     * leaves the window following the pointer.
     *
     * No coordinates cross: main reads the cursor itself, so nothing here has to reason about a
     * window's CSS zoom or a monitor's scale factor.
     */
    dragStart(): void;
    dragMove(): void;
    dragEnd(how: DragEnd): void;
    /**
     * This window maximized or restored — by our button or by anything else (a drag-region
     * double-click, Win+Up, the taskbar). Drives the titlebar button's glyph, and fires again
     * after a reload so it can't start out wrong.
     */
    onMaximizeChanged(cb: (maximized: boolean) => void): Unsubscribe;
    /** Hide the window to the tray (the app keeps running; reshow via tray/hotkey). */
    hide(): void;
    /**
     * How this window was left — what its title-bar toggles should read on load. Empty for a
     * window that keeps no state (the alert overlay, the screengrab selector) and on the web.
     */
    getState(): Promise<WindowToggles>;
    /** Remember a toggle's new value against this window, for the next launch. */
    saveState(patch: WindowToggles): void;
    /** Set the live window opacity (0.2–1), transient — does not change the saved setting. */
    setOpacity(value: number): void;
    /** Toggle this window's always-on-top (per-window; used by the map's pin). */
    setAlwaysOnTop(enabled: boolean): void;
    /**
     * Pass this window's clicks through to whatever is behind it (the game), or take them back.
     * Called as the cursor crosses between the window's pass-through region and its controls —
     * drive it with `useClickThrough` rather than by hand.
     */
    setClickThrough(enabled: boolean): void;
    close(): void;
    /** Forget saved positions and recenter windows (for "lost" windows). */
    resetPositions(): Promise<void>;
  };
}

/** Recursive Partial for settings patches. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
