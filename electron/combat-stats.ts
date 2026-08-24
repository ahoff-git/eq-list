/**
 * combat-stats.ts — the damage meter's state, fed by parsed combat events.
 *
 * Two windows are tracked at once, because both questions matter mid-play: "how did
 * *that* fight go" (`fight`) and "how has the whole session gone" (`session`). A fight
 * is a burst of combat: the first damage event starts one. Ending it is deliberately
 * reluctant — in this game a mob chases until it (or you) dies, so a lull in the log is
 * usually lag or repositioning, not the end. Only once something has **died** (a kill, or
 * your own death) does a short quiet (`SETTLED_END_MS`) close the fight so the next pull is
 * its own; while the enemy is presumably still up, it takes a long silence (`ENGAGED_END_MS`).
 * The active-time DPS divides by is separate: any gap over `ACTIVE_GAP_MS` is downtime either
 * way, so tolerating a lull never deflates the rate.
 *
 * All timing comes from the log's own timestamps, never wall clock — so a replayed
 * or backfilled log produces exactly the same DPS as it did live, and the tests are
 * deterministic. EQ logs to the second, so DPS over very short fights is coarse;
 * `activeSec` has a 1s floor to keep a single big hit from reading as infinite DPS.
 *
 * Emits `change` with a fresh snapshot so main can broadcast it to every window.
 */
import { EventEmitter } from "node:events";
import { isYours, SELF } from "../src/shared/combat-parser";
import { createDamageCells, rollUpDamage } from "../src/shared/damage-tree";
import { createDotAttribution } from "../src/shared/dot-attribution";
import { createFightScope } from "../src/shared/fight-scope";
import { hasArticle } from "../src/shared/log-parser";
import { createNameRegistry } from "../src/shared/name-registry";
import { ratio, round } from "../src/shared/numbers";
import { createParty } from "../src/shared/party";
import { createPetRegistry } from "../src/shared/pet-registry";
import type {
  CoinEvent,
  CombatEvent,
  DamageCell,
  DamageKind,
  LootEvent,
  PartyEvent,
  XpEvent,
  CombatStats,
  CombatantStat,
  DeathRecap,
  FightEndReason,
  FightStats,
  MobKillStat,
  SpellStat,
} from "../src/shared/types";

/**
 * A gap longer than this between combat events is downtime, not fought time — it's excluded from
 * the active seconds DPS divides by, so a lull can't deflate your rate. (This is *not* what ends a
 * fight — see below; a fight tolerates far longer silences.)
 */
const ACTIVE_GAP_MS = 10_000;

/**
 * Once something has died — the mob you were on, or you — the fight is resolved, and this much
 * quiet then ends it, so the next pull is its own fight.
 */
const SETTLED_END_MS = 10_000;

/**
 * While an engagement is unresolved (nothing dead yet), a lull is lag or repositioning, not the
 * end — the mob is still chasing. Only this much *total* silence ends the fight. Generous on
 * purpose: a kite with long pauses, or a stretch where the log lagged, stays one fight.
 */
const ENGAGED_END_MS = 60_000;

/**
 * A cast that takes longer than this to land isn't the cast we're timing — the log
 * dropped the pairing (interrupted off-screen, or the effect never fired), so the
 * measurement is discarded rather than recorded as a 30-second cast.
 */
const CAST_PAIR_MS = 20_000;

/** How long after a kill an experience gain is still credited to it (as the Session tab). */
const XP_ATTRIBUTION_MS = 15_000;

/**
 * How long after a kill coin off a corpse is still credited to it. Longer than the experience
 * window: experience lands the same second as the kill, whereas looting is something the player
 * gets round to — often after the next pull has already started.
 */
const COIN_ATTRIBUTION_MS = 120_000;

/** How much of the run-up to a death the recap covers, and how many deaths to keep. */
const DEATH_WINDOW_MS = 15_000;
const MAX_DEATHS = 5;

/**
 * How soon after your own spell lands an unattributed self-heal is taken to be the
 * invocation's doing. The log puts them back to back, so this is deliberately tight — a
 * wider window would start swallowing other people's unattributed heals.
 */
const INVOCATION_HEAL_MS = 3000;

/** Used until the log has told us which stance/invocation is active. */
const UNKNOWN_MODE = "unknown";

/** Cap the per-second sparkline so one endless fight can't grow without bound. */
const MAX_BUCKETS = 900;

export interface CombatTracker {
  record(event: CombatEvent): void;
  /**
   * The logging character's name, so the meter can flag your own row and your pet's
   * ("Kainos`s warder"). Pass "" when unknown — only the highlight depends on it.
   */
  setPlayer(name: string): void;
  /**
   * Your group changing. The roster decides who counts as your side, which is what keeps
   * another group's pull out of your meter (see `src/shared/fight-scope.ts`).
   */
  recordParty(event: PartyEvent): void;
  /** Who the tracker currently believes is grouped with you — for tests and diagnostics. */
  party(): string[];
  /**
   * You, or anything of yours — your pet included, named ones as well
   * ([ADR 0077](../specs/decisions/0077-a-pet-is-proven-not-guessed.md)).
   *
   * Exposed because the **scoreboard** has to ask it of every hit that lands, and a second answer to
   * "is `Garn` mine" would need its own copy of the pet registry and would eventually disagree with
   * this one. Read-only: it reports what the tracker already knows and decides nothing.
   */
  mine(name: string): boolean;
  /**
   * Would this death count as a kill of yours — the gate `recordKill` applies (not your pet, and
   * something your side actually fought).
   *
   * Exposed for the scoreboard's **kill streak**, which has to count exactly the kills the meter
   * counts. Asking rather than re-deriving is the point: the answer needs the party roster, the pet
   * registry and the fight scope, and a streak built on a looser rule would tick up for every death
   * in earshot at a busy camp.
   */
  countsKill(mob: string): boolean;
  snapshot(): CombatStats;
  reset(): void;
  /**
   * Fires (synchronously) when something changed. It carries no data — call `snapshot()`
   * when you're ready to read, so a consumer that throttles doesn't pay to summarize both
   * windows on every one of a log flood's thousands of events.
   */
  onChange(cb: () => void): void;
  /**
   * Called with each fight as it ends (when the next one starts, or on reset/quit) so
   * it can be filed into history. The tracker itself keeps no past fights.
   */
  onFightEnd(cb: (fight: FightStats) => void): void;
  /**
   * Nothing has been logged for a while — the caller saying what time it is, so a fight that ended
   * in quiet can be filed at the moment it ended rather than when the next one starts.
   *
   * The tracker decides *whether* it's over (the same rule `record` applies); this only supplies a
   * clock, because a log that has gone quiet produces no events to carry one. Cheap and idempotent:
   * call it as often as you like. `nowMs` is the **log's** clock, not the wall clock — see
   * `src/shared/log-clock.ts`, which is what a caller should be reading it from.
   */
  settle(nowMs: number): void;
  /** Close out the fight in progress — for app quit, so the last pull isn't lost. */
  flush(): void;
  /**
   * A mob died. Feeds time-to-kill and experience attribution. Only mobs **your side
   * fought** count — the log reports every death in earshot, and a stranger's kill is
   * neither your kill rate nor your camp's (the kill *log* keeps it regardless: where a mob
   * died is worth knowing whoever killed it — [ADR 0027](../specs/decisions/0027-only-your-kills-count.md)).
   */
  recordKill(mob: string, at: string): void;
  /**
   * An experience gain: counted, credited to the most recent kill, and split solo/party.
   * Takes the parsed event so the tracker isn't handed loose numbers to re-interpret.
   */
  recordXp(event: XpEvent): void;
  /**
   * Coin off a corpse — the mob's money. Credited to the most recent kill, the same
   * attribution the log forces on experience (it names no mob either).
   */
  recordCoin(event: CoinEvent): void;
  /**
   * A looted item, for the money it fetched. Only an auto-sell states a price, so only
   * those count — and they're kept apart from corpse coin, because "what the mob paid" and
   * "what its drops vendor for" are two different answers to "is this camp worth it"
   * (ADR 0047).
   */
  recordSale(event: LootEvent): void;
  /** The zone the player is in, stamped onto fights as they're filed. */
  setZone(zone: string | null): void;
  zone(): string | null;
}

/** Mutable per-combatant tallies (shaped into `CombatantStat` on snapshot). */
interface Tally {
  dealt: number;
  taken: number;
  healed: number;
  hits: number;
  misses: number;
  crits: number;
  maxHit: number;
  /** Log times (ms) of this combatant's first and last *damage dealt*. */
  firstAt: number;
  lastAt: number;
  /** Time actually spent fighting (gaps longer than the idle window don't count). */
  activeMs: number;
  /** Your melee under each stance — empty for combatants whose stance we can't know. */
  byStance: Map<string, ModeTally>;
  /**
   * Hits carrying a qualifier ("Critical", "Riposte", …), keyed by it — whatever the log wrote.
   * Kept here rather than in the damage cells because a qualifier *overlaps* the split by
   * source (a critical slash is in both), and a cell that overlapped its siblings would
   * break the one guarantee the cells make.
   */
  bySpecial: Map<string, { hits: number; damage: number }>;
}

/** Parse a naive-local (or ISO) timestamp to ms; NaN-safe. */
function ms(at: string): number {
  const t = Date.parse(at);
  return Number.isNaN(t) ? 0 : t;
}

function emptyTally(): Tally {
  return {
    dealt: 0, taken: 0, healed: 0, hits: 0, misses: 0, crits: 0, maxHit: 0,
    firstAt: 0, lastAt: 0, activeMs: 0,
    byStance: new Map(), bySpecial: new Map(),
  };
}

/**
 * Mutable per-spell tallies (shaped into `SpellStat` on snapshot). Only **your** casts
 * are tracked: this table exists to answer "which of my spells earn their cast time",
 * and other people's spell damage already shows in their combatant row.
 */
/** A spell's numbers under one invocation (or melee's under one stance). */
interface ModeTally {
  casts: number;
  lands: number;
  damage: number;
  healed: number;
  castMs: number;
  timed: number;
  hits: number;
  misses: number;
  maxHit: number;
  /** Healing the invocation granted off this spell's damage. */
  invocationHealed: number;
  /** Landings with no cast in flight — presumed free casts. */
  procs: number;
  procDamage: number;
}

function emptyMode(): ModeTally {
  return {
    casts: 0, lands: 0, damage: 0, healed: 0, castMs: 0, timed: 0, hits: 0, misses: 0,
    maxHit: 0, invocationHealed: 0, procs: 0, procDamage: 0,
  };
}

/** Per-invocation totals that aren't about one spell (see `InvocationSummary`). */
interface InvocationTally {
  swings: number;
  procs: number;
  procDamage: number;
  healed: number;
}

function emptyInvocation(): InvocationTally {
  return { swings: 0, procs: 0, procDamage: 0, healed: 0 };
}

/** Fetch-or-create a per-mode tally inside a map keyed by mode name. */
function modeTally(modes: Map<string, ModeTally>, mode: string): ModeTally {
  let t = modes.get(mode);
  if (!t) modes.set(mode, (t = emptyMode()));
  return t;
}

interface SpellTally {
  rank?: string;
  casts: number;
  lands: number;
  ticks: number;
  /** Of `damage`, the part the ticks did — kept apart so the split is readable, not inferred. */
  tickDamage: number;
  /** The biggest single tick. Separate from `maxHit`, which stays "biggest *landing*". */
  maxTick: number;
  fizzles: number;
  interrupts: number;
  resists: number;
  blocked: number;
  damage: number;
  healed: number;
  maxHit: number;
  /** Sum of the cast durations we could actually measure, and how many those were. */
  castMs: number;
  timed: number;
  overhealed: number;
  /** Healing the invocation granted off this spell's damage (divine's doing). */
  invocationHealed: number;
  /** Who resisted it — resist rates vary enormously between mobs. */
  resistedBy: Map<string, number>;
  /** The same spell under each invocation — the numbers above are the blend. */
  byInvocation: Map<string, ModeTally>;
}

/** Mutable per-mob tallies: how long its kills took and what they paid. */
interface MobTally {
  kills: number;
  killMs: number;
  xpPct: number;
  /** Coin off its corpses, and what its drops auto-sold for. Separate ledgers, on purpose. */
  copper: number;
  soldCopper: number;
}

function emptyMob(): MobTally {
  return { kills: 0, killMs: 0, xpPct: 0, copper: 0, soldCopper: 0 };
}

function emptySpell(): SpellTally {
  return {
    casts: 0, lands: 0, ticks: 0, tickDamage: 0, maxTick: 0,
    fizzles: 0, interrupts: 0, resists: 0, blocked: 0,
    damage: 0, healed: 0, maxHit: 0, castMs: 0, timed: 0, overhealed: 0,
    invocationHealed: 0,
    resistedBy: new Map(),
    byInvocation: new Map(),
  };
}

/**
 * Add the time since the previous damage, unless the two are further apart than a
 * fight — that gap is downtime, not combat. Summing these is what keeps a session's
 * DPS meaningful: without it you'd divide a night's damage by a night's *calendar*
 * time and every row would read ~0.
 */
function addActive(span: { lastAt: number; activeMs: number }, at: number): void {
  const gap = at - span.lastAt;
  if (span.lastAt && gap > 0 && gap <= ACTIVE_GAP_MS) span.activeMs += gap;
}

/**
 * One accumulating window (a fight, or the session). `canon` is the tracker's name registry —
 * the damage cells need it so their attacker/target names are the same ones the rows use.
 */
function createWindow(canon: (name: string) => string) {
  const tallies = new Map<string, Tally>();
  /** Every hit as a (victim, attacker, kind, source) cell — see `damage-tree.ts`. */
  const damage = createDamageCells(canon);
  const spells = new Map<string, SpellTally>();
  const mobs = new Map<string, MobTally>();
  const invocations = new Map<string, InvocationTally>();
  const span = { firstAt: 0, lastAt: 0, activeMs: 0 };
  /**
   * Names this window tallied that nothing had yet placed — not you, not yours, not a group-mate,
   * and not something with an article or that your side had traded blows with. Held **apart from the
   * tallies** rather than mixed into them ([ADR 0130](../specs/decisions/0130-data-in-doubt-says-so.md)):
   * the figures are real and belong where they are, and what is uncertain is only *whose* they are.
   *
   * Re-checked on read, so a name proven between the tally and the summary simply isn't in the answer.
   */
  const doubted = new Set<string>();
  /** Your damage per second of the window, indexed from its first damage. */
  const buckets: number[] = [];
  const deaths: DeathRecap[] = [];
  const totals = { kills: 0, xpPct: 0, xpGains: 0, soloXp: 0, partyXp: 0, copper: 0, soldCopper: 0 };
  /** The span of log lines this window was built from (see `FightStats.logIds`). */
  const lines = { from: 0, to: 0 };

  const tally = (name: string): Tally => {
    let t = tallies.get(name);
    if (!t) tallies.set(name, (t = emptyTally()));
    return t;
  };

  const spell = (name: string): SpellTally => {
    let t = spells.get(name);
    if (!t) spells.set(name, (t = emptySpell()));
    return t;
  };

  const mob = (name: string): MobTally => {
    let t = mobs.get(name);
    if (!t) mobs.set(name, (t = emptyMob()));
    return t;
  };

  const invocationTally = (name: string): InvocationTally => {
    let t = invocations.get(name);
    if (!t) invocations.set(name, (t = emptyInvocation()));
    return t;
  };

  return {
    span,
    totals,
    buckets,
    deaths,
    lines,
    damage,
    doubted,
    /** Widen the window's line range — cheap, and it's the way back to the source. */
    note(logId: number) {
      if (!logId) return;
      if (!lines.from) lines.from = logId;
      lines.to = logId;
    },
    /** Add your damage into the second-bucket it landed in (for the sparkline). */
    bucket(at: number, amount: number) {
      if (!span.firstAt) return;
      const i = Math.floor((at - span.firstAt) / 1000);
      if (i < 0 || i >= MAX_BUCKETS) return;
      while (buckets.length <= i) buckets.push(0);
      buckets[i] += amount;
    },
    /** Extend the window — only damage defines when a fight runs. */
    mark(at: number) {
      if (!span.firstAt) span.firstAt = at;
      addActive(span, at);
      span.lastAt = at;
    },
    tally,
    tallies,
    spell,
    spells,
    mob,
    mobs,
    invocationTally,
    invocations,
  };
}

type Window = ReturnType<typeof createWindow>;

/**
 * What one cast costs, if we can find out. Injected rather than imported so the tracker stays
 * free of I/O and a test can answer for a spell without a game install — the same reason `nowIso`
 * is a parameter. Returning `undefined` (no spell file, unknown spell) is normal and every mana
 * figure simply goes absent.
 */
export type ManaLookup = (spell: string, rank?: string) => number | undefined;

export function createCombatStats(
  nowIso: () => string = () => new Date().toISOString(),
  manaFor: ManaLookup = () => undefined,
): CombatTracker {
  const bus = new EventEmitter();
  /**
   * One spelling per creature, so a sentence-initial capital doesn't split a row in two.
   * Declared first because the windows are built around it.
   */
  const names = createNameRegistry();
  const canon = names.canon;
  /**
   * Who's grouped with you. Kept here rather than in the caller because it's exactly as
   * long-lived as the tracker and nothing else needs it — and because "whose damage is this"
   * is one question, answered in one place.
   */
  const party = createParty();
  let fight = createWindow(canon);
  /**
   * Whether the fight in progress has already been handed to history. The window outlives its
   * filing on purpose — the panel goes on showing the last pull until the next one starts, which
   * is what a damage meter is for — so "over" and "gone" are two different facts and this is the
   * first of them (see `endFight`).
   */
  let fightFiled = false;
  let session = createWindow(canon);
  let startedAt = nowIso();
  let player = "";
  /** Log time of the last swing (hit or miss), for idle detection. */
  let lastCombatAt = 0;
  /** The cast in flight, waiting for its effect to land so it can be timed. */
  let pending: { caster: string; spell: string; at: number } | null = null;
  /** The last mob to die, for experience attribution, and when the last kill landed. */
  let lastKill: { mob: string; at: number } | null = null;
  let lastKillAt = 0;
  /** Log time of your last death — like a kill, it resolves the fight (combat's over, you're down). */
  let lastDeathAt = 0;
  /** Rolling tail of damage taken by you, for the death recap. */
  const incoming: { at: number; source: string; amount: number }[] = [];
  /**
   * The stance and invocation currently in force. They change damage multipliers and cast
   * times, so every tally is filed under whichever was active — a blended average across
   * a stance change describes a character who never existed.
   */
  let stance = UNKNOWN_MODE;
  let invocation = UNKNOWN_MODE;
  /**
   * Your last spell landing. An unattributed self-heal right after one is the invocation
   * healing you off the damage (divine's doing) — the log gives no other clue: every heal we
   * *can* attribute names its spell, so the absence is the signal.
   */
  let lastLanding: { spell: string; at: number } | null = null;
  /** Set when a landing arrived with no cast in flight — the free-cast signature. */
  let unpairedLanding = false;
  /**
   * Spells you have actually been seen casting. A free cast is a spell **you can cast**
   * arriving without one — so this is what separates it from the things that never have a
   * cast at all: damage shields ("flames") and buff procs ("Spirit of Lightning Strike")
   * are castless by nature and would otherwise every single one read as a free cast.
   */
  const castRepertoire = new Set<string>();
  /**
   * Who cast the DoT that's ticking. Like the repertoire above, this is knowledge about who
   * casts what rather than a tally, so `reset()` keeps it — and a DoT mid-flight when the meter
   * is cleared goes on being attributed instead of dropping into a phantom row.
   */
  const dots = createDotAttribution();
  let currentZone: string | null = null;

  /**
   * Pets the game has confirmed are yours, by having one tell *you* it was attacking. It's the
   * only way a pet with its own name can be known — the possessive form `isYours` reads never
   * appears for one. See `pet-registry.ts`.
   */
  const pets = createPetRegistry();

  /** You or anything of yours, against the current `player` — see `isYours` and `pets`. */
  const isMine = (name: string): boolean => isYours(name, player) || pets.has(name);
  /** Your side: you and your pet, plus whoever is grouped with you and theirs. */
  const isOurs = (name: string): boolean => isMine(name) || party.has(name);
  /**
   * The gate every combat event passes through: other people's fights are not this meter's
   * business (see `fight-scope.ts`). It's applied *once*, here, so the fight window and the
   * session window can never disagree about what happened.
   */
  const scope = createFightScope({ ours: isOurs, sidesKnown: () => !!player });

  /**
   * Has the log said what this name *is* — you, yours, a group-mate, or a creature?
   *
   * An article says creature, because that is how the game writes one ("a coyote"); a name your side
   * has traded blows with is a creature too, whatever it is called, which is what covers a named. What
   * is left is a **bare name nobody has placed**: it could be your pet, a group-mate, or a stranger,
   * and [ADR 0077](../specs/decisions/0077-a-pet-is-proven-not-guessed.md) is right that guessing
   * between them from the shape of the name is not on. So it is recorded as doubtful and *said*
   * (ADR 0130) rather than quietly counted as one thing or the other.
   */
  const placed = (name: string): boolean =>
    name === SELF || isOurs(name) || hasArticle(name) || scope.fought(name);

  /**
   * Note a name a window has just tallied, if nothing has placed it. Called with the **canonical**
   * name, like everything else inside a window, so the doubt and the row it is about agree.
   */
  const doubt = (w: Window, name: string): void => {
    if (!name || placed(name)) return;
    w.doubted.add(name);
  };

  /**
   * Is this death a kill of **yours**? Two things it isn't, and both used to be inline in
   * `recordKill` — named here because the scoreboard's kill streak has to ask the identical
   * question, and a second copy of the rule would let the meter's kill count and the streak
   * disagree about the same corpse.
   *
   * "Kainos`s warder has been slain by a skeleton!" reads as a kill to the log parser, but a pet
   * dying is not something you killed — and crediting experience to it would put your own pet at the
   * top of the "what's worth killing" table. Nor is a death across the camp yours: every metric on
   * the panel is your side's, and a kill nobody on your side was fighting moves the count, the
   * time-to-kill and the per-mob rates alike (ADR 0067). Time-to-kill is measured from the fight, so
   * a mob we never fought has no fight to measure it against in the first place. Until the player's
   * own name is known, sides can't be told apart at all and every kill counts — the same call the
   * scope makes about damage.
   *
   * Takes a **canonical** name, like everything inside this module.
   */
  const countsKill = (mob: string): boolean => !isMine(mob) && (!player || scope.fought(mob));

  /**
   * One meter row. The by-skill and by-spell splits are **derived** from this combatant's
   * damage cells rather than tallied a second time, so the row and the drill-down under it
   * can't disagree (ADR 0053). Only sources that landed something appear — a skill that
   * produced nothing but misses is a hit-rate fact, and the drill-down is where it shows.
   */
  const row = (name: string, t: Tally, cells: DamageCell[]): CombatantStat => {
    const activeSec = Math.max(1, Math.round(t.activeMs / 1000));
    const landedBySource = (kinds: DamageKind[]) =>
      rollUpDamage(cells.filter((c) => kinds.includes(c.kind)), ["source"]).filter((n) => n.hits > 0);
    return {
      name,
      dealt: t.dealt,
      taken: t.taken,
      healed: t.healed,
      hits: t.hits,
      misses: t.misses,
      crits: t.crits,
      maxHit: t.maxHit,
      activeSec,
      dps: ratio(t.dealt, activeSec, 1),
      mine: isMine(name),
      byStance: [...t.byStance.entries()]
        .map(([stanceName, m]) => ({
          stance: stanceName,
          damage: m.damage,
          hits: m.hits,
          misses: m.misses,
          maxHit: m.maxHit,
        }))
        .sort((a, b) => b.damage - a.damage),
      byType: landedBySource(["Melee"]).map((n) => ({
        type: n.label,
        hits: n.hits,
        damage: n.damage,
        maxHit: n.maxHit,
      })),
      bySpell: landedBySource(["Spell", "Other"]).map((n) => ({
        spell: n.label,
        hits: n.hits,
        damage: n.damage,
        maxHit: n.maxHit,
      })),
      specials: [...t.bySpecial.entries()]
        .map(([kind, s]) => ({ kind, hits: s.hits, damage: s.damage }))
        .sort((a, b) => b.hits - a.hits || b.damage - a.damage),
    };
  };

  const spellRow = (spell: string, t: SpellTally): SpellStat => {
    const avgCastSec = ratio(t.castMs / 1000, t.timed, 2);
    const completed = t.lands + t.resists + t.blocked;
    // Priced at the rank actually cast, so a rank VI nuke quotes its own cost. Undefined stays
    // undefined all the way down: an unknown cost must never become a zero, or a spell we can't
    // price and a spell that's free end up on the same row.
    const manaCost = manaFor(spell, t.rank);
    const manaSpent = manaCost === undefined ? undefined : manaCost * t.casts;
    // Efficiency needs mana actually spent. A free spell has no efficiency — it has a different
    // shape entirely — so it gets absence rather than a division by zero dressed up as a number.
    const perMana = (amount: number) =>
      manaSpent ? ratio(amount, manaSpent, 2) : undefined;
    return {
      spell,
      rank: t.rank,
      manaCost,
      manaSpent,
      // The invocation's healing was bought by the same mana, so it counts toward what the
      // spell returned — the definition the Spells table has always shown.
      damagePerMana: perMana(t.damage + t.invocationHealed),
      healPerMana: perMana(t.healed),
      casts: t.casts,
      lands: t.lands,
      ticks: t.ticks,
      tickDamage: t.tickDamage,
      maxTick: t.maxTick,
      fizzles: t.fizzles,
      interrupts: t.interrupts,
      resists: t.resists,
      blocked: t.blocked,
      damage: t.damage,
      healed: t.healed,
      maxHit: t.maxHit,
      avgCastSec,
      // Damage per second spent casting: *average damage per landing* over the *average*
      // cast time. Dividing total damage by only the measured casts' seconds would
      // inflate a spell whose casts were mostly untimed (all the damage, a fraction of
      // the time). For a DoT, `damage` includes its ticks — which is right: the whole
      // point is what one cast eventually earns.
      dpc: ratio(t.damage, t.lands * avgCastSec, 1),
      resistRate: ratio(t.resists, completed, 2),
      overhealed: t.overhealed,
      invocationHealed: t.invocationHealed,
      resistedBy: [...t.resistedBy.entries()]
        .map(([target, count]) => ({ target, count }))
        .sort((a, b) => b.count - a.count || a.target.localeCompare(b.target)),
      byInvocation: [...t.byInvocation.entries()]
        .map(([mode, m]) => {
          const modeCastSec = ratio(m.castMs / 1000, m.timed, 2);
          return {
            mode,
            casts: m.casts,
            lands: m.lands,
            damage: m.damage,
            healed: m.healed,
            avgCastSec: modeCastSec,
            dpc: ratio(m.damage, m.lands * modeCastSec, 1),
            invocationHealed: m.invocationHealed,
            procs: m.procs,
            procDamage: m.procDamage,
          };
        })
        .sort((a, b) => b.damage - a.damage || b.casts - a.casts),
    };
  };

  /** Per-mob rows: fastest experience first, which is the point of the table. */
  const mobRow = (mob: string, t: MobTally): MobKillStat => {
    const killSec = t.killMs / 1000;
    const coin = t.copper + t.soldCopper;
    return {
      mob,
      kills: t.kills,
      avgKillSec: ratio(killSec, t.kills, 1),
      xpPct: round(t.xpPct, 3),
      xpPerMin: ratio(t.xpPct, killSec / 60, 2),
      copper: t.copper,
      soldCopper: t.soldCopper,
      // Both ledgers together, because "what is this mob worth per minute" is the one
      // question where the distinction stops mattering — it's all money off the same corpse.
      copperPerMin: ratio(coin, killSec / 60, 1),
    };
  };

  /**
   * The window's mana bill, and how much of the window it actually covers. Reported together
   * because a total assembled from *some* of the casts is misleading on its own — a UI that shows
   * "1,240 mana" without "over 38 of 41 casts" is quietly presenting a partial figure as a whole.
   * Absent entirely when nothing could be priced, so no spell file means no mana row rather than
   * a confident zero.
   */
  function manaTotals(spells: SpellStat[]): Pick<FightStats, "manaSpent" | "manaKnownCasts"> {
    let manaSpent = 0;
    let known = 0;
    let total = 0;
    for (const s of spells) {
      total += s.casts;
      if (s.manaSpent === undefined) continue;
      manaSpent += s.manaSpent;
      known += s.casts;
    }
    return known ? { manaSpent, manaKnownCasts: { known, total } } : {};
  }

  const summarize = (w: Window): FightStats => {
    const cells = w.damage.cells();
    // Each row only needs its own hits, so index the cells by attacker once rather than
    // re-scanning them per row.
    const byAttacker = new Map<string, DamageCell[]>();
    for (const c of cells) {
      const theirs = byAttacker.get(c.attacker);
      if (theirs) theirs.push(c);
      else byAttacker.set(c.attacker, [c]);
    }
    const byCombatant = [...w.tallies.entries()]
      .map(([name, t]) => row(name, t, byAttacker.get(name) ?? []))
      .sort((a, b) => b.dealt - a.dealt || b.taken - a.taken || a.name.localeCompare(b.name));
    const spells = [...w.spells.entries()]
      .map(([name, t]) => spellRow(name, t))
      .sort((a, b) => b.damage - a.damage || b.healed - a.healed || a.spell.localeCompare(b.spell));
    // Asked now, not when the damage landed: a pet proven since, or a group-mate who has spoken, is
    // placed — so the doubt disappears on its own the moment the log settles it (ADR 0130).
    const unsettled = [...w.doubted].filter((name) => !placed(name)).sort();
    return {
      startedAt: w.span.firstAt ? new Date(w.span.firstAt).toISOString() : "",
      endedAt: w.span.lastAt ? new Date(w.span.lastAt).toISOString() : "",
      unsettled: unsettled.length ? unsettled : undefined,
      durationSec: w.span.firstAt ? Math.max(1, Math.round(w.span.activeMs / 1000)) : 0,
      totalDealt: byCombatant.reduce((n, c) => n + c.dealt, 0),
      yourDealt: byCombatant.filter((c) => c.mine).reduce((n, c) => n + c.dealt, 0),
      yourTaken: byCombatant.filter((c) => c.mine).reduce((n, c) => n + c.taken, 0),
      byCombatant,
      damageCells: cells,
      spanSec: w.span.firstAt ? Math.max(1, Math.round((w.span.lastAt - w.span.firstAt) / 1000)) : 0,
      spells,
      ...manaTotals(spells),
      byMob: [...w.mobs.entries()]
        .map(([name, t]) => mobRow(name, t))
        .sort((a, b) => b.xpPerMin - a.xpPerMin || b.kills - a.kills || a.mob.localeCompare(b.mob)),
      kills: w.totals.kills,
      xpPct: round(w.totals.xpPct, 3),
      xpGains: w.totals.xpGains,
      soloXp: w.totals.soloXp,
      partyXp: w.totals.partyXp,
      copper: w.totals.copper,
      soldCopper: w.totals.soldCopper,
      yourPerSec: [...w.buckets],
      deaths: [...w.deaths],
      logIds: w.lines.from ? { ...w.lines } : undefined,
      invocations: [...w.invocations.entries()]
        .map(([mode, t]) => ({
          mode,
          swings: t.swings,
          procs: t.procs,
          procDamage: t.procDamage,
          procRate: ratio(t.procs, t.swings, 3),
          healed: t.healed,
        }))
        .sort((a, b) => b.procs - a.procs || b.swings - a.swings),
    };
  };

  const snapshot = (): CombatStats => ({
    startedAt,
    fight: summarize(fight),
    session: summarize(session),
  });

  // Signal-only: `snapshot()` is computed by whoever's listening, when they're ready — not
  // eagerly here on every event (see the `onChange` contract).
  const emit = () => bus.emit("change");

  /**
   * Apply one event to a window. `castMs` is the measured duration of the cast this
   * event completes, when the tracker could pair the two (see `record`).
   */
  function apply(w: Window, event: CombatEvent, at: number, castMs = 0): void {
    switch (event.kind) {
      case "damage": {
        const a = w.tally(canon(event.attacker));
        a.dealt += event.amount;
        a.hits += 1;
        if (event.qualifier === "Critical") a.crits += 1;
        // Who hit whom, how, and with what — one cell, from which every drill-down and the
        // row's own by-skill/by-spell split are rolled up (ADR 0053).
        w.damage.record(event);
        // Any tag the hit carried — Critical, Riposte, Flurry, … Kept for every combatant, so
        // "what's critting me" reads as easily as "what am I hitting with". This one *overlaps*
        // the split by source, which is why it isn't a cell.
        if (event.qualifier) {
          const s = a.bySpecial.get(event.qualifier) ?? { hits: 0, damage: 0 };
          s.hits += 1;
          s.damage += event.amount;
          a.bySpecial.set(event.qualifier, s);
        }
        a.maxHit = Math.max(a.maxHit, event.amount);
        if (!a.firstAt) a.firstAt = at;
        addActive(a, at);
        a.lastAt = at;
        w.tally(canon(event.target)).taken += event.amount;
        // Both ends of the exchange, because either can be the unplaceable one: a bare-named pet
        // hitting a mob, or a mob hitting a group-mate we haven't been told about yet.
        doubt(w, canon(event.attacker));
        doubt(w, canon(event.target));
        w.mark(at); // only damage defines when a fight ran
        if (isMine(event.attacker)) w.bucket(at, event.amount);
        if (event.spell && isMine(canon(event.attacker))) {
          const sp = w.spell(event.spell);
          const mode = modeTally(sp.byInvocation, invocation);
          sp.damage += event.amount;
          mode.damage += event.amount;
          if (event.tick) {
            sp.ticks += 1;
            sp.tickDamage += event.amount;
            sp.maxTick = Math.max(sp.maxTick, event.amount);
          } else {
            sp.lands += 1;
            mode.lands += 1;
            sp.maxHit = Math.max(sp.maxHit, event.amount);
            mode.maxHit = Math.max(mode.maxHit, event.amount);
          }
          if (castMs) {
            sp.castMs += castMs;
            sp.timed += 1;
            mode.castMs += castMs;
            mode.timed += 1;
          }
          // A landing with nothing in flight, from a spell you *do* cast, had no cast of
          // its own — the signature of a free cast (Spell Blade grants them silently).
          // Ticks are excluded upstream; castless sources are excluded by the repertoire.
          if (unpairedLanding && !event.tick && castRepertoire.has(event.spell)) {
            mode.procs += 1;
            mode.procDamage += event.amount;
            const inv = w.invocationTally(invocation);
            inv.procs += 1;
            inv.procDamage += event.amount;
          }
        } else if (event.melee && isMine(canon(event.attacker))) {
          // Melee is the stance's business — the multipliers live there.
          const m = modeTally(a.byStance, stance);
          m.damage += event.amount;
          m.hits += 1;
          m.maxHit = Math.max(m.maxHit, event.amount);
          // Free casts trigger off attacks, so swings are the denominator for their rate.
          w.invocationTally(invocation).swings += 1;
        }
        break;
      }
      case "miss": {
        const attacker = canon(event.attacker);
        const t = w.tally(attacker);
        t.misses += 1;
        w.damage.record(event); // a miss is a hit-rate fact about a skill against a target

        if (isMine(attacker)) {
          modeTally(t.byStance, stance).misses += 1;
          w.invocationTally(invocation).swings += 1; // a swing either way
        }
        break;
      }
      case "heal": {
        w.tally(canon(event.healer)).healed += event.amount;
        if (event.spell && isMine(event.healer)) {
          const sp = w.spell(event.spell);
          const mode = modeTally(sp.byInvocation, invocation);
          sp.healed += event.amount;
          mode.healed += event.amount;
          sp.lands += 1;
          mode.lands += 1;
          if (castMs) {
            mode.castMs += castMs;
            mode.timed += 1;
          }
          if (event.attempted) sp.overhealed += Math.max(0, event.attempted - event.amount);
          if (castMs) {
            sp.castMs += castMs;
            sp.timed += 1;
          }
        } else if (!event.spell && isMine(event.healer) && isMine(event.target) && lastLanding) {
          // No spell named, healing yourself, moments after your own spell landed: the
          // invocation converting damage into health. Credited to the spell that triggered
          // it and to the invocation, so the mana's *whole* return is visible.
          if (at - lastLanding.at <= INVOCATION_HEAL_MS) {
            const sp = w.spell(lastLanding.spell);
            sp.invocationHealed += event.amount;
            modeTally(sp.byInvocation, invocation).invocationHealed += event.amount;
            w.invocationTally(invocation).healed += event.amount;
          }
        }
        break;
      }
      case "cast": {
        if (!isMine(event.caster)) break;
        castRepertoire.add(event.spell);
        const sp = w.spell(event.spell);
        sp.casts += 1;
        modeTally(sp.byInvocation, invocation).casts += 1;
        if (event.rank) sp.rank = event.rank;
        break;
      }
      case "spell-outcome": {
        if (!isMine(event.caster)) break;
        const sp = w.spell(event.spell);
        if (event.outcome === "fizzle") sp.fizzles += 1;
        else if (event.outcome === "interrupted") sp.interrupts += 1;
        else if (event.outcome === "resisted") {
          sp.resists += 1;
          if (event.target) {
            const target = canon(event.target);
            sp.resistedBy.set(target, (sp.resistedBy.get(target) ?? 0) + 1);
          }
        } else sp.blocked += 1;
        break;
      }
      case "death":
      case "stance":
      case "invocation":
        // Deaths go through `recordDeath` (they need the rolling incoming-damage buffer,
        // which lives outside any one window); mode changes are tracked on the tracker
        // itself, not inside a window, since they persist across fights.
        break;
    }
  }

  /**
   * Is the fight in progress over as of `at`, and if so what ended it?
   *
   * A lull is not the end of a fight. Only end it promptly once the engagement has been
   * *resolved* — the last thing to happen was a death (a kill, or yours), so this quiet is the
   * pause before the next pull. While it's unresolved (the enemy's still up and, in this game,
   * still chasing), tolerate a much longer silence before splitting into a new fight.
   *
   * Asked from two places and so it lives in one: the next event arriving (`record`) and the
   * clock simply passing (`settle`). Two copies of this rule would let a fight be filed under one
   * reason and split under another.
   */
  function quietBy(at: number): { stale: boolean; endReason: FightEndReason } {
    const killResolved = lastKillAt >= lastCombatAt;
    const deathResolved = lastDeathAt >= lastCombatAt;
    const resolved = killResolved || deathResolved;
    const endGap = resolved ? SETTLED_END_MS : ENGAGED_END_MS;
    return {
      stale: !!lastCombatAt && at - lastCombatAt > endGap,
      // The same branch, named — see `FightEndReason`. When both resolved it, the later one
      // is what actually finished the fight (you killed it, then died to its friend).
      endReason: !resolved
        ? "timeout"
        : killResolved && (!deathResolved || lastKillAt >= lastDeathAt)
          ? "kill"
          : "death",
    };
  }

  /**
   * Hand the finished fight to whoever files history, if it had any damage in it, stamped with
   * why it ended. `cut` is the caller saying "the log didn't end this, I did" — a reset or a
   * flush — which is a different fact from a fight the log itself closed.
   *
   * **At most once per fight.** A fight is filed the moment the log's own rule says it is over
   * ([ADR 0126](../specs/decisions/0126-a-fight-is-filed-when-it-ends.md)), which is usually
   * `settle` rather than the next pull — so by the time the next pull splits the window, or a quit
   * flushes it, this fight has already been filed and there is nothing left to say about it.
   */
  function endFight(reason: FightEndReason): void {
    if (fightFiled || !fight.span.firstAt) return;
    fightFiled = true;
    bus.emit("fightEnd", { ...summarize(fight), endReason: reason });
  }

  /** Start the next fight's row set. The flag rides with the window — see `endFight`. */
  function newFight(): void {
    fight = createWindow(canon);
    fightFiled = false;
  }

  /**
   * The windows a tally that arrives **out of band** still belongs to — a kill, experience, coin, a
   * sale, a death recap. None of those comes through `record`, so none of them is subject to its
   * staleness check, and each has its own reason to arrive late: coin is credited to a corpse for
   * two minutes, experience for fifteen seconds, and looting is something the player gets round to.
   *
   * The session, always. The fight **only while it is still open**: once it has been filed, the
   * snapshot history holds is the fight, and a figure added to the window afterwards would show on
   * the panel while never reaching the record it claims to describe. Better to say plainly that a
   * filed fight is finished — which, in log terms, it is: the camp went quiet long enough for the
   * log's own rule to close it.
   */
  const openWindows = (): Window[] => (fightFiled ? [session] : [fight, session]);

  /**
   * Snapshot what was hitting you in the run-up to a death. The log doesn't say what
   * killed you beyond a name, so the useful answer is the incoming damage right before
   * it — which needs a rolling buffer, kept trimmed to the recap window.
   */
  function recordDeath(at: number, killer?: string): DeathRecap {
    const since = at - DEATH_WINDOW_MS;
    const bySource = new Map<string, number>();
    let totalTaken = 0;
    for (const hit of incoming) {
      if (hit.at < since) continue;
      bySource.set(hit.source, (bySource.get(hit.source) ?? 0) + hit.amount);
      totalTaken += hit.amount;
    }
    return {
      at: new Date(at).toISOString(),
      killer,
      incoming: [...bySource.entries()]
        .map(([source, amount]) => ({ source, amount }))
        .sort((a, b) => b.amount - a.amount),
      totalTaken,
      windowSec: DEATH_WINDOW_MS / 1000,
    };
  }

  /**
   * Measure the cast this event completes. EQ never states a cast time, but it does log
   * the start ("You begin casting X") — so the gap to the effect landing *is* the cast
   * time. One cast at a time per caster, so a single slot tracks it.
   */
  function pairCast(event: CombatEvent, at: number): number {
    if (!pending) return 0;
    const spell = event.kind === "damage" || event.kind === "heal" ? event.spell : undefined;
    if (!spell || spell !== pending.spell) return 0;
    const actor = event.kind === "damage" ? event.attacker : event.kind === "heal" ? event.healer : "";
    if (actor !== pending.caster) return 0;
    const took = at - pending.at;
    pending = null;
    // A DoT's later ticks arrive long after the cast; only the first landing is timed.
    return took >= 0 && took <= CAST_PAIR_MS ? took : 0;
  }

  return {
    record(raw) {
      // A DoT tick names no caster in this log's short form, so the caster is put back from the
      // cast line first — before the scope, the rows, the cells or the spell table read the
      // attacker, all of which would otherwise file your own DoT under the spell's name
      // (ADR 0071). Noting comes first so a cast and its own first tick in the same second work.
      dots.note(raw);
      const event = dots.resolve(raw);
      const at = ms(event.at);
      // An unparseable timestamp would read as 1970 and wreck every span it touched, so
      // the event is dropped instead. (Nothing in a real log does this — but the whole
      // module is built on the assumption that `at` is meaningful, so it's checked once,
      // here, rather than defended against everywhere downstream.)
      if (!at) return;
      const { stale, endReason } = quietBy(at);

      // A new pull is a new engagement, so the enemy set goes first — *before* this event is
      // judged. It's what makes the first swing of a fight have to stand on its own: without
      // it, a stranger fighting the twin of last pull's mob would open a fight of ours.
      const swing = event.kind === "damage" || event.kind === "miss";
      if (stale && swing) scope.reset();
      // Somebody else's fight is somebody else's business (ADR 0067).
      if (!scope.admits(event)) return;

      if (event.kind === "pet-engage") {
        // Learned before anything else reads an attacker, so the pet's very first swing —
        // which can share this second — already counts as yours.
        pets.note(event.pet);
        return;
      }

      if (event.kind === "stance") {
        stance = event.stance;
        return void emit();
      }
      if (event.kind === "invocation") {
        invocation = event.invocation;
        return void emit();
      }

      if (event.kind === "cast") {
        pending = isMine(event.caster) ? { caster: event.caster, spell: event.spell, at } : pending;
      } else if (event.kind === "spell-outcome" && pending?.spell === event.spell) {
        pending = null; // fizzled / interrupted / resisted — nothing will land
      }
      // A tick is not a fresh cast landing, so it must not consume the pending cast.
      const hadPending = !!pending;
      const castMs = event.kind === "damage" && event.tick ? 0 : pairCast(event, at);
      // An area spell lands on each target separately, and only the first of those landings
      // finds the cast still in flight — so without this the rest read as free casts. Two
      // landings of one spell in the same log second are one cast hitting two things: EQ
      // stamps to the second and a real recast takes seconds. (A free cast of the very spell
      // you just landed, inside the same second, would be missed — far rarer than the area
      // spells this otherwise miscounts, which were 61 of 65 "free casts" in a real log.)
      const sameCast =
        event.kind === "damage" &&
        !!event.spell &&
        lastLanding?.spell === event.spell &&
        lastLanding.at === at;
      // Nothing was in flight, so this landing had no cast of its own. Distinct from "the
      // cast was too old to pair", which `pairCast` also reports as 0.
      unpairedLanding = !hadPending && !sameCast;

      if (event.kind === "damage" && !event.tick && event.spell && isMine(canon(event.attacker))) {
        lastLanding = { spell: event.spell, at };
      }

      if (event.kind === "damage" && isMine(canon(event.target))) {
        incoming.push({ at, source: canon(event.attacker), amount: event.amount });
        // Keep the buffer to the recap window (plus slack) — it's a tail, not a log.
        const cutoff = at - DEATH_WINDOW_MS * 2;
        while (incoming.length && incoming[0].at < cutoff) incoming.shift();
      }

      if (event.kind === "death") {
        lastDeathAt = at; // resolves the fight: a short quiet now ends it (you're down, combat's over)
        const recap = recordDeath(at, event.killer);
        for (const w of openWindows()) {
          w.deaths.unshift(recap);
          if (w.deaths.length > MAX_DEATHS) w.deaths.pop();
        }
        emit();
        return;
      }

      // Swings (hit or miss) are what delimit a fight; the first one after a lull
      // starts a fresh row set. Heals and casts ride along — they belong to a fight only
      // while one is running, so downtime healing/buffing doesn't invent a "fight".
      if (swing) {
        if (stale) {
          endFight(endReason);
          newFight();
        }
        lastCombatAt = at;
        apply(fight, event, at, castMs);
        fight.note(event.logId);
      } else if (lastCombatAt && !stale) {
        apply(fight, event, at, castMs);
        // Noted only when the fight actually **took** the event. Noting unconditionally ran a
        // fight's line range on to whatever last happened before the next pull — a night's buffing
        // and chat, a median 122 lines against a 25-second fight — and `logIds` exists so those
        // lines can be found again and re-read (ADR 0021), which a range full of somebody else's
        // downtime can't do.
        fight.note(event.logId);
      }
      apply(session, event, at, castMs);
      session.note(event.logId);
      emit();
    },
    setPlayer(name) {
      const next = name.trim();
      if (next === player) return;
      player = next;
      // A different character is a different group; the old one's would silently widen this
      // one's meter. The same goes for pets: the last character's are not this one's, and a
      // stale name here would credit a stranger's damage to you.
      party.clear();
      pets.clear();
      emit(); // `mine` flags change, so the windows need a fresh snapshot
    },

    recordParty(event) {
      party.note(event);
      // Nothing already tallied changes — the roster only decides what's admitted from here
      // on — so there's nothing to re-summarize and no `emit()`.
    },
    party: () => party.members(),
    mine: (name) => isMine(name),
    countsKill: (mob) => countsKill(canon(mob)),

    /**
     * A kill. Time-to-kill is the gap since the fight started or the previous kill in it,
     * which is as close as a log with no health bars can get.
     */
    recordKill(rawMob, atIso) {
      const mob = canon(rawMob);
      if (!countsKill(mob)) return;
      const at = ms(atIso);
      const from = Math.max(fight.span.firstAt || at, lastKillAt || 0) || at;
      const took = Math.max(0, at - from);
      for (const w of openWindows()) {
        const m = w.mob(mob);
        m.kills += 1;
        m.killMs += took;
        w.totals.kills += 1;
      }
      lastKill = { mob, at };
      lastKillAt = at;
      emit();
    },

    /**
     * Experience. Counted, split solo/party, and credited to the mob that died in the
     * attribution window — EQ never says which mob paid, and the "slain" line lands
     * immediately before the gain, so the most recent kill is the best available answer.
     */
    recordXp(event) {
      const at = ms(event.at);
      const pct = event.pct ?? 0;
      for (const w of openWindows()) {
        w.totals.xpGains += 1;
        if (event.party) w.totals.partyXp += 1;
        else w.totals.soloXp += 1;
        w.totals.xpPct += pct;
      }
      if (pct && lastKill && at - lastKill.at >= -2000 && at - lastKill.at < XP_ATTRIBUTION_MS) {
        for (const w of openWindows()) w.mob(lastKill.mob).xpPct += pct;
      }
      emit();
    },

    /**
     * Coin off a corpse. Only `from: "corpse"` counts: an auto-sell logs its coins twice —
     * once on the loot line and once as a bare "from that item" — and taking both would
     * double every sale (ADR 0047). The sale itself arrives through `recordSale`.
     *
     * The session total is unconditional; the per-mob credit needs a recent kill, because the
     * line names no mob. Coin with no kill behind it (looting a corpse from an earlier camp)
     * still counts towards the evening's money — it just can't say which mob paid.
     */
    recordCoin(event) {
      if (event.from !== "corpse" || event.copper <= 0) return;
      const at = ms(event.at);
      for (const w of openWindows()) w.totals.copper += event.copper;
      if (lastKill && at - lastKill.at >= -2000 && at - lastKill.at < COIN_ATTRIBUTION_MS) {
        for (const w of openWindows()) w.mob(lastKill.mob).copper += event.copper;
      }
      emit();
    },

    /**
     * What an auto-sold drop fetched. `source` names the corpse, so unlike coin this needs no
     * timing guess — the item says which mob it came off.
     */
    recordSale(event) {
      if (!event.soldFor) return;
      for (const w of openWindows()) {
        w.totals.soldCopper += event.soldFor;
        if (event.source) w.mob(canon(event.source)).soldCopper += event.soldFor;
      }
      emit();
    },

    setZone(next) {
      currentZone = next;
    },
    zone: () => currentZone,
    snapshot,
    settle(nowMs) {
      if (!nowMs || fightFiled || !fight.span.firstAt) return;
      const { stale, endReason } = quietBy(nowMs);
      if (!stale) return;
      // Filed, but *not* replaced: the window stays as the panel's "this fight" until the next
      // pull splits it, and `endFight`'s guard is what keeps that from filing it twice.
      endFight(endReason);
    },
    // A flush is the app's doing, not the log's — the tracker closing, or a character switch.
    flush: () => endFight("cut"),
    reset() {
      endFight("cut"); // don't lose the fight in progress just because the meter was cleared
      newFight();
      session = createWindow(canon);
      startedAt = nowIso();
      lastCombatAt = 0;
      pending = null;
      lastKill = null;
      lastKillAt = 0;
      lastDeathAt = 0;
      lastLanding = null;
      incoming.length = 0;
      names.clear();
      scope.reset();
      // The repertoire is knowledge about the character, not a tally, so a reset keeps it.
      // Nor is the party roster: clearing the meter doesn't disband your group, and re-learning
      // it would take until the next person joined, left or spoke. Pets are the same kind of
      // thing and kept for the same reason, with a sharper edge: a pet only announces itself
      // when you *order* it onto something, so a forgotten one would go uncounted until the
      // next pull — a reset mid-fight would silently drop the rest of that fight's pet damage.
      // The stance and invocation aren't session state — they're what the character is
      // doing right now, and a reset doesn't change that.
      emit();
    },
    onChange: (cb) => void bus.on("change", cb),
    onFightEnd: (cb) => void bus.on("fightEnd", cb),
  };
}
