/**
 * high-scores.ts — the things a personal best can be set in, and the rules for taking one.
 *
 * A damage meter answers "how is this pull going". A scoreboard answers a different question, and
 * it's the one people actually remember an evening by: **what is the best I have ever done.** The
 * meter can't hold it — `combat-stats.ts` keeps "this fight" and "this session" on purpose, and
 * `combat-history.ts` keeps the last thousand fights, which is a *list* rather than a bar to clear.
 *
 * Everything here is pure: a catalog, a reading of an event or a fight into **candidates**, and one
 * comparison. What a candidate *does* — whether it displaces the record, whether that's worth a
 * banner, and where it's written down — is `electron/high-scores.ts`, because all three need memory.
 *
 * Three rules are load-bearing and none of them is obvious:
 *
 *   1. **A floor per category, or a trivial sample owns it forever.** The first fight you ever have
 *      is your best DPS, your longest fight and your richest fight, and a 2-second swipe at a rat is
 *      a perfectly good "fastest" anything. A floor is what makes a record mean "this was good"
 *      rather than "this was first".
 *   2. **A fight is read for per-hit records too.** `fightCandidates` emits the fight-level figures
 *      *and* the biggest hits inside it, off the cells and rows the fight already carries. That's
 *      one function doing double duty on purpose: it means the board can be **seeded from fights
 *      already on disk** rather than starting empty, and it can't drift from the live path, because
 *      a coarser candidate that ties the precise one it duplicates simply doesn't beat it.
 *   3. **Some categories only a live line can state.** A stored fight keeps a *count* of criticals
 *      and DoT ticks, and a healing *total* — never the biggest one. Those categories say so
 *      (`liveOnly`), because a board that silently can't fill a row looks broken rather than honest.
 *
 * Deliberately absent: **fastest kill.** It reads like the obvious category and it is meaningless
 * across mobs — the record would be whatever the weakest thing you ever swung at was, permanently,
 * and per-mob it's `combat-history.ts`'s `bests()` question rather than this one.
 */
import { meleeSkill } from "./combat-parser";
import { opponentOf } from "./damage-tree";
import { duration, figure } from "./format";
import { formatCoins } from "./money";
import { ratio } from "./numbers";
import type { CombatEvent, FightStats, HighScore, ScoreCandidate } from "./types";

/** What a score is counted in — which is what says how to write it down. */
export type ScoreUnit = "damage" | "hp" | "sec" | "dps" | "count" | "pct" | "copper";

/** Which heading a category sits under on the board. */
export type ScoreGroup = "hits" | "survival" | "fight" | "streak";

/** One thing a personal best can be held in. */
export interface ScoreCategory {
  id: string;
  label: string;
  unit: ScoreUnit;
  group: ScoreGroup;
  /** What it's a record *of*, in a sentence — the row's tooltip, and why it's worth chasing. */
  blurb: string;
  /**
   * Below this a candidate isn't a score. See rule 1 above: without it your first-ever fight owns
   * half the board and nothing can ever be beaten honestly.
   */
  floor: number;
  /**
   * Only a live log line can state this one, so it can't be seeded from fights already on disk
   * (rule 3). Said out loud on the board rather than left as an empty row.
   */
  liveOnly?: boolean;
}

/**
 * The **groups**, in the order the board shows them. Titles here rather than in the panel so the
 * catalog is the one place a category is described.
 */
export const SCORE_GROUPS: { key: ScoreGroup; title: string; blurb: string }[] = [
  { key: "hits", title: "Hits", blurb: "The biggest single numbers the log has ever shown you." },
  { key: "survival", title: "Survival", blurb: "What you walked away from." },
  { key: "fight", title: "Fights", blurb: "A whole fight, at its best." },
  { key: "streak", title: "Streaks", blurb: "How long you kept it up." },
];

/**
 * A single second's worth of DPS is not a DPS figure. A fight has to last this long before its
 * rate counts, or the record is forever a lucky opening crit divided by one second.
 */
export const MIN_DPS_SEC = 10;

/** The fixed categories. The two **families** below add rows as your log turns them up. */
export const SCORE_CATEGORIES: ScoreCategory[] = [
  {
    id: "biggest-hit",
    label: "Biggest hit",
    unit: "damage",
    group: "hits",
    blurb: "The largest single hit you or your pet have ever landed, however it was delivered.",
    floor: 1,
  },
  {
    id: "biggest-nuke",
    label: "Biggest spell hit",
    unit: "damage",
    group: "hits",
    blurb: "The largest single spell landing — a nuke or a proc, not a damage-over-time tick.",
    floor: 1,
  },
  {
    id: "biggest-tick",
    label: "Biggest DoT tick",
    unit: "damage",
    group: "hits",
    // A tick can crit, and a critical tick is worth about double a plain one — so this category is
    // mostly a record of your best critical tick ([ADR 0095](../../specs/decisions/0095-your-own-dot-tick-is-yours.md)).
    blurb: "The hardest single tick one of your damage-over-time spells has ever done.",
    floor: 1,
  },
  {
    id: "biggest-heal",
    label: "Biggest heal",
    unit: "hp",
    group: "hits",
    blurb: "The most hit points you have ever restored with one heal.",
    floor: 1,
    liveOnly: true,
  },
  {
    id: "biggest-hit-taken",
    label: "Biggest hit taken",
    unit: "damage",
    group: "survival",
    blurb: "The hardest single hit anything has ever landed on you or your pet.",
    floor: 1,
  },
  {
    id: "taken-survived",
    label: "Most damage survived",
    unit: "damage",
    group: "survival",
    // The gate is the fight's *ending*, not your hit points: we never know those (see hp-estimate.ts).
    blurb: "The most damage taken in a single fight that you did not die in.",
    floor: 100,
  },
  {
    id: "longest-fight",
    label: "Longest fight",
    unit: "sec",
    group: "survival",
    blurb: "The longest single fight you have been in, counting time in combat rather than elapsed.",
    floor: 30,
  },
  {
    id: "fight-damage",
    label: "Most damage in a fight",
    unit: "damage",
    group: "fight",
    blurb: "Your side's damage — you and your pet — in one fight.",
    floor: 100,
  },
  {
    id: "fight-dps",
    label: "Best fight DPS",
    unit: "dps",
    group: "fight",
    blurb: `Your damage per second of combat in one fight, over fights of at least ${MIN_DPS_SEC} seconds.`,
    floor: 1,
  },
  {
    id: "fight-kills",
    label: "Most kills in a fight",
    unit: "count",
    group: "fight",
    blurb: "The biggest thing you have ever pulled and lived through — kills inside one fight.",
    floor: 2,
  },
  {
    id: "fight-xp",
    label: "Most XP from a fight",
    unit: "pct",
    group: "fight",
    blurb: "Percent of a level earned in a single fight, as the log's own experience lines totalled it.",
    floor: 0.01,
  },
  {
    id: "fight-coin",
    label: "Richest fight",
    unit: "copper",
    group: "fight",
    blurb: "Coin off the corpses plus what the drops auto-sold for, from one fight.",
    floor: 1,
  },
  {
    id: "kill-streak",
    label: "Longest kill streak",
    unit: "count",
    group: "streak",
    // Floored well above 1 so the counter doesn't announce itself climbing out of nothing on a
    // fresh board — see `noteKill` in electron/high-scores.ts for the other half of that rule.
    blurb: "Kills in a row without dying. Reset by your death, and by nothing else.",
    floor: 5,
  },
];

/**
 * The two **families**: a category per thing the log turns up, rather than a fixed list.
 *
 * A fixed row per melee skill would ship a board mostly full of blanks — no character slashes,
 * crushes, pierces, kicks, bashes *and* backstabs — and a fixed list of qualifiers would be a guess
 * at what this server tags a hit with. So the id carries the thing measured, and the board grows a
 * row the first time you land one. `Backstab` appearing on your board is itself information.
 */
const MELEE = "melee:";
const QUAL = "qual:";

/** The category id for one melee skill ("Slash" → `melee:Slash`). */
export const meleeCategory = (skill: string): string => `${MELEE}${skill}`;

/** The category id for one of the log's hit qualifiers ("Critical" → `qual:Critical`). */
export const qualCategory = (qualifier: string): string => `${QUAL}${qualifier}`;

/**
 * The category a stored id belongs to — including the family ids, which have no entry in the list
 * above and are described from the id itself.
 *
 * Never returns undefined: a record on disk for a category we no longer ship still has to be
 * *shown*, for the same reason a deleted alert style falls back to the defaults instead of dropping
 * the alert. An unknown id reads as a plain count under Hits rather than vanishing.
 */
export function categoryOf(id: string): ScoreCategory {
  const known = SCORE_CATEGORIES.find((c) => c.id === id);
  if (known) return known;
  if (id.startsWith(MELEE)) {
    const skill = id.slice(MELEE.length);
    return {
      id,
      label: `Biggest ${skill.toLowerCase()}`,
      unit: "damage",
      group: "hits",
      blurb: `The largest single ${skill.toLowerCase()} you or your pet have landed.`,
      floor: 1,
    };
  }
  if (id.startsWith(QUAL)) {
    const qualifier = id.slice(QUAL.length);
    return {
      id,
      label: `Biggest ${qualifier}`,
      unit: "damage",
      group: "hits",
      blurb: `The largest hit the log has tagged “${qualifier}” for you.`,
      floor: 1,
      // A stored fight counts its criticals and flurries; it never keeps the biggest one.
      liveOnly: true,
    };
  }
  return { id, label: id, unit: "count", group: "hits", blurb: "", floor: 1 };
}

/** Where a category sits on the board — its group's order, then the catalog's, families last. */
export function scoreOrder(id: string): number {
  const group = SCORE_GROUPS.findIndex((g) => g.key === categoryOf(id).group);
  const known = SCORE_CATEGORIES.findIndex((c) => c.id === id);
  return group * 100 + (known === -1 ? 50 : known);
}

/**
 * Does this candidate take the record?
 *
 * Its floor is checked *here* rather than where candidates are made, so a category's minimum is
 * stated once, beside the category. A tie is not a record: "equal to your best" is not news, and it
 * is what keeps a fight's coarse re-reading of its own hits (rule 2) from displacing the precise
 * live candidate that already recorded them.
 */
export function beats(candidate: ScoreCandidate, current: HighScore | undefined): boolean {
  const { floor } = categoryOf(candidate.categoryId);
  if (!(candidate.value >= floor)) return false; // also rejects NaN, which a bad timestamp can make
  return !current || candidate.value > current.value;
}

/**
 * What one combat event offers the board, the instant it's read.
 *
 * `mine` is the tracker's own "you or anything of yours" — asked rather than re-derived, because
 * knowing that `Garn` is your pet takes a whole registry of proof (`pet-registry.ts`) and two
 * answers to that question would eventually disagree.
 *
 * Damage between two of your own — a damage shield firing on your pet's attacker — is skipped by
 * both directions: it is neither a hit you landed on an enemy nor one you took from one.
 */
export function eventCandidates(event: CombatEvent, mine: (name: string) => boolean): ScoreCandidate[] {
  if (event.kind === "heal") {
    // Only a heal *you* cast; being healed by a group's cleric is their record, not yours.
    if (!mine(event.healer) || event.amount <= 0) return [];
    // The log names the target by character name even when it's you, so it's shown as written —
    // guessing "yourself" needs a player name this pure function has no business holding.
    const detail = event.spell ? `${event.spell} on ${event.target}` : `on ${event.target}`;
    return [{ categoryId: "biggest-heal", value: event.amount, at: event.at, detail }];
  }
  if (event.kind !== "damage" || event.amount <= 0) return [];

  const dealt = mine(event.attacker);
  const taken = mine(event.target);
  if (dealt === taken) return []; // ours on ours, or a fight that isn't ours at all
  const value = event.amount;

  if (taken) {
    const source = event.spell || (event.verb ? meleeSkill(event.verb) : "");
    return [
      {
        categoryId: "biggest-hit-taken",
        value,
        at: event.at,
        detail: source ? `${event.attacker}’s ${source}` : event.attacker,
      },
    ];
  }

  const out: ScoreCandidate[] = [];
  const source = event.spell || (event.verb ? meleeSkill(event.verb) : "");
  const detail = source ? `${source} on ${event.target}` : event.target;
  out.push({ categoryId: "biggest-hit", value, at: event.at, detail });
  // The log's own tag on the swing, whatever it wrote — "Critical", "Crippling Blow", "Flurry".
  if (event.qualifier) out.push({ categoryId: qualCategory(event.qualifier), value, at: event.at, detail });
  if (event.melee && event.verb) {
    out.push({ categoryId: meleeCategory(meleeSkill(event.verb)), value, at: event.at, detail });
  } else if (event.spell) {
    // A tick and a landing are different achievements: one is a spell's whole damage arriving at
    // once, the other is the best a slow burn ever managed in six seconds.
    out.push({ categoryId: event.tick ? "biggest-tick" : "biggest-nuke", value, at: event.at, detail });
  }
  return out;
}

/**
 * What a finished fight offers the board — its own figures, **and** the biggest hits inside it.
 *
 * The second half is what lets the board be seeded from fights already on disk (rule 2). It reads
 * the fight's damage cells where it has them, because a cell names who hit whom with what and a
 * combatant row only names a total; where a fight predates the cells (ADR 0053), the rows' own
 * `maxHit` splits still carry the per-skill figures.
 */
export function fightCandidates(fight: FightStats): ScoreCandidate[] {
  const at = fight.endedAt || fight.startedAt;
  if (!at) return [];
  const out: ScoreCandidate[] = [];
  const against = opponentOf(fight);
  const add = (categoryId: string, value: number, detail?: string) => {
    if (value > 0) out.push({ categoryId, value, at, detail });
  };

  add("fight-damage", fight.yourDealt, against);
  add("longest-fight", fight.durationSec, against);
  // Only over a fight long enough for a rate to mean anything — see `MIN_DPS_SEC`.
  if (fight.durationSec >= MIN_DPS_SEC) add("fight-dps", ratio(fight.yourDealt, fight.durationSec, 1), against);
  add("fight-kills", fight.kills, against);
  add("fight-xp", fight.xpPct, against);
  add("fight-coin", (fight.copper ?? 0) + (fight.soldCopper ?? 0), against);
  // "Survived" is the fight's own account of how it ended (ADR 0078). A fight that was cut short —
  // the app quit, the log went quiet — is not a claim that you lived, so it doesn't count either.
  if (fight.endReason && fight.endReason !== "death" && fight.endReason !== "cut") {
    add("taken-survived", fight.yourTaken, against);
  }

  const ours = new Set(fight.byCombatant.filter((c) => c.mine).map((c) => c.name));
  for (const cell of fight.damageCells ?? []) {
    if (cell.maxHit <= 0) continue;
    const oursDealt = ours.has(cell.attacker);
    const oursTook = ours.has(cell.target);
    if (oursDealt === oursTook) continue;
    if (oursTook) {
      add("biggest-hit-taken", cell.maxHit, `${cell.attacker}’s ${cell.source}`);
      continue;
    }
    const detail = `${cell.source} on ${cell.target}`;
    add("biggest-hit", cell.maxHit, detail);
    if (cell.kind === "Melee") add(meleeCategory(cell.source), cell.maxHit, detail);
    // A source that only ever ticked is a DoT, and then the cell's biggest hit **is** its biggest
    // tick — which is what makes this category seedable rather than live-only. Anything with a
    // landing among its hits is a spell or a proc, and its maximum could be that landing.
    else if (cell.kind === "Spell") {
      if (cell.ticks >= cell.hits) add("biggest-tick", cell.maxHit, detail);
      else add("biggest-nuke", cell.maxHit, detail);
    }
  }
  // A fight from before the cells existed still splits its own melee and spells per combatant.
  if (!fight.damageCells) {
    for (const row of fight.byCombatant.filter((c) => c.mine)) {
      add("biggest-hit", row.maxHit, against);
      for (const t of row.byType) add(meleeCategory(t.type), t.maxHit, against);
      for (const s of row.bySpell) add("biggest-hit", s.maxHit, `${s.spell}${against ? ` on ${against}` : ""}`);
    }
  }
  return out;
}

/** A score written out, in whatever it's counted in. */
export function formatScore(unit: ScoreUnit, value: number): string {
  switch (unit) {
    case "sec":
      return duration(value, { seconds: true });
    case "dps":
      return `${figure(value)}/s`;
    case "pct":
      // Percent of a level, which is often a fraction of one — two places, or a good fight reads 0%.
      return `${value.toFixed(2)}%`;
    case "copper":
      return formatCoins(value);
    case "hp":
      return `${figure(value)} hp`;
    default:
      return figure(value);
  }
}

/** How much a record beat the one before it by — absent for the first score in a category. */
export function marginOf(score: HighScore): number | undefined {
  return score.previous === undefined ? undefined : score.value - score.previous;
}
