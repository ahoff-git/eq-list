/**
 * fight-trends.ts — what a set of past fights against the same thing has in common, and the tips
 * that follow from it ("most of Lord Nagafen's damage is Lava Breath"). Pure, no I/O: the history
 * search hands it the fights it found and draws what comes back.
 *
 * Read entirely off the fights' damage cells ([ADR 0053](../../specs/decisions/0053-damage-is-cells-rolled-up.md)),
 * which already say who hit whom with what — including what was resisted and how swings were
 * turned aside ([ADR 0343](../../specs/decisions/0343-resists-and-avoidance-live-in-the-damage-cells.md)).
 * Fights stored before the cells existed are counted but can't contribute figures.
 *
 * The tips carry a `kind` and the figures they were written from, not just a sentence: the next
 * step is suggesting what to do about them (fire resist against a fire breath, mitigation against
 * crushes), and that wants the damage type, not a parse of the prose.
 * See [ADR 0344](../../specs/decisions/0344-fight-search-finds-combatants-and-reads-trends.md).
 */
import { SELF } from "./combat-parser";
import { cellLandings, enemiesIn } from "./damage-tree";
import { searchWords } from "./fight-search";
import { percent } from "../format";
import { ratio } from "../numbers";
import type { Avoidance, AvoidanceCounts, DamageCell, DamageKind, StoredFight } from "../types";

/**
 * A resist rate worth flagging. One in four casts wasted is the point where the spell is the problem
 * rather than the luck — below that it's variance on a small number of casts.
 */
export const HIGH_RESIST_RATE = 0.25;

/** Below this, a spell is a reliable choice against the subject — worth naming beside a bad one. */
const RELIABLE_RESIST_RATE = 0.1;

/** Casts that reached the subject before its resist rate says anything about the spell. */
const MIN_SPELL_TRIES = 5;

/** Swings at the subject before its avoidance says anything about it. */
const MIN_SWINGS = 20;

/** An avoidance rate worth a tip — a fifth of your swings going nowhere. */
const HIGH_AVOID_RATE = 0.2;

/** The damage mix names sources until they cover this much of the total… */
const MIX_COVERAGE = 0.75;
/** …but never more than this many, or it's a table pretending to be a sentence. */
const MIX_MAX = 3;

/** One way the subject damaged your side, summed over the fights. */
export interface TrendSource {
  kind: DamageKind;
  /** The skill ("Crush"), spell ("Lava Breath") or shield word ("flames"). */
  source: string;
  /** The spell's damage type, when the log gave one — what a resist would be raised against. */
  damageType?: string;
  damage: number;
  hits: number;
  maxHit: number;
  /** Of everything the subject did to your side, 0–1. */
  share: number;
}

/** One of your spells against the subject. */
export interface TrendSpell {
  spell: string;
  /** Times it took hold — damaging landings or announced ones, ticks excluded (`cellLandings`). */
  landings: number;
  resists: number;
  /** `resists / (landings + resists)`. */
  resistRate: number;
}

export interface FightTrends {
  /**
   * Who the trends are about: the enemies whose names the search named, most damaging first. Empty
   * when the search only named a place — then the trends are about every enemy in those fights.
   */
  subjects: string[];
  /** Fights looked at, and how many of them carried the cells the figures come from. */
  fights: number;
  measured: number;
  /** Of `fights`, the ones you died in. */
  deaths: number;
  /** The subject's damage on your side, biggest first. */
  incoming: TrendSource[];
  incomingTotal: number;
  /** Your spells at the subject, most-resisted first. */
  spells: TrendSpell[];
  /** Your swings at the subject, and what became of the ones that missed. */
  swings: { swings: number; misses: number; avoided: AvoidanceCounts };
}

export type TrendTipKind = "damage-mix" | "biggest-hit" | "resisted" | "reliable" | "avoidance" | "deaths";

export interface TrendTip {
  kind: TrendTipKind;
  text: string;
  /** The sources the tip is about, for the tips that are about damage taken. */
  sources?: TrendSource[];
  /** The spell the tip is about, for the tips that are about your casting. */
  spell?: TrendSpell;
}

/**
 * Trends across `fights` for whatever `term` names. Null when there's nothing to say — no fights,
 * or none old enough to have cells.
 */
export function fightTrends(fights: StoredFight[], term: string): FightTrends | null {
  if (!fights.length) return null;
  const words = searchWords(term);
  const sided = fights.filter((f) => f.stats.damageCells?.length).map(sides);
  if (!sided.length) return null;

  // Decided across all the fights at once, so "steamfont" (a place) doesn't become "about whichever
  // mob happened to have 'steam' in its name in one of them".
  const named = new Set<string>();
  for (const f of sided) {
    for (const name of f.enemies) if (namedBy(name, f.zone, words)) named.add(name);
  }
  const isSubject = (name: string, enemies: Set<string>) => (named.size ? named.has(name) : enemies.has(name));

  const incoming = new Map<string, TrendSource>();
  const spells = new Map<string, TrendSpell>();
  const swings = { swings: 0, misses: 0, avoided: { dodge: 0, parry: 0, block: 0, riposte: 0 } };
  const bySubject = new Map<string, number>();

  for (const { cells, enemies } of sided) {
    for (const c of cells) {
      if (isSubject(c.attacker, enemies) && !enemies.has(c.target)) {
        addIncoming(incoming, c);
        bySubject.set(c.attacker, (bySubject.get(c.attacker) ?? 0) + c.damage);
      }
      if (c.attacker !== SELF || !isSubject(c.target, enemies)) continue;
      if (c.kind === "Spell") addSpell(spells, c);
      if (c.kind === "Melee") addSwings(swings, c);
    }
  }

  const incomingTotal = [...incoming.values()].reduce((n, s) => n + s.damage, 0);
  return {
    subjects: named.size ? [...named].sort((a, b) => (bySubject.get(b) ?? 0) - (bySubject.get(a) ?? 0)) : [],
    fights: fights.length,
    measured: sided.length,
    deaths: fights.filter((f) => (f.stats.deaths ?? []).length > 0 || f.stats.endReason === "death").length,
    incoming: [...incoming.values()]
      .map((s) => ({ ...s, share: ratio(s.damage, incomingTotal) }))
      .sort((a, b) => b.damage - a.damage),
    incomingTotal,
    spells: [...spells.values()]
      .map((s) => ({ ...s, resistRate: ratio(s.resists, s.landings + s.resists) }))
      .sort((a, b) => b.resistRate - a.resistRate || b.resists - a.resists),
    swings,
  };
}

/** A fight's cells with the sides worked out — the enemy set `damage-tree` would draw it with. */
function sides(f: StoredFight): { cells: DamageCell[]; enemies: Set<string>; zone: string } {
  const cells = f.stats.damageCells ?? [];
  const mine = new Set(f.stats.byCombatant.filter((c) => c.mine).map((c) => c.name));
  return { cells, enemies: enemiesIn(cells, (n) => mine.has(n)), zone: f.zone ?? "" };
}

/**
 * Whether the search named this combatant: every word appears in its name or the fight's zone, and
 * at least one in the name — so "coyote steam" is the coyotes in Steamfont, and "steamfont" alone
 * names nobody.
 */
function namedBy(name: string, zone: string, words: string[]): boolean {
  const lower = name.toLowerCase();
  const where = zone.toLowerCase();
  return words.some((w) => lower.includes(w)) && words.every((w) => lower.includes(w) || where.includes(w));
}

function addIncoming(into: Map<string, TrendSource>, c: DamageCell): void {
  const key = `${c.kind}\u0000${c.source}`;
  let s = into.get(key);
  if (!s) into.set(key, (s = { kind: c.kind, source: c.source, damage: 0, hits: 0, maxHit: 0, share: 0 }));
  s.damage += c.damage;
  s.hits += c.hits;
  s.maxHit = Math.max(s.maxHit, c.maxHit);
  if (c.damageType) s.damageType ??= c.damageType;
}

function addSpell(into: Map<string, TrendSpell>, c: DamageCell): void {
  let s = into.get(c.source);
  if (!s) into.set(c.source, (s = { spell: c.source, landings: 0, resists: 0, resistRate: 0 }));
  s.landings += cellLandings(c);
  s.resists += c.resists ?? 0;
}

function addSwings(into: FightTrends["swings"], c: DamageCell): void {
  into.swings += c.hits - c.ticks + c.misses;
  into.misses += c.misses;
  for (const how of Object.keys(into.avoided) as Avoidance[]) into.avoided[how] += c.avoided?.[how] ?? 0;
}

/** Past tense of each way a swing is turned aside. */
const AVOIDED_AS: Record<Avoidance, string> = { dodge: "dodged", parry: "parried", block: "blocked", riposte: "riposted" };

/**
 * The tips worth saying about `t`, most useful first. Each one only appears when its figures clear
 * the bar for meaning something — a tip off three casts is a coincidence written as advice.
 */
export function trendTips(t: FightTrends): TrendTip[] {
  // Lower case throughout, as EQ writes a mob ("a coyote"); `sentence` capitalizes where one opens a tip.
  const who = t.subjects.length === 1 ? t.subjects[0] : t.subjects.length ? "they" : "the mobs here";
  const whose = t.subjects.length === 1 ? `${t.subjects[0]}'s` : t.subjects.length ? "their" : "the mobs'";
  const tips: TrendTip[] = [];

  const mix = damageMix(t.incoming);
  if (mix.length) {
    const covered = mix.reduce((n, s) => n + s.share, 0);
    const list = joinList(mix.map(describeSource));
    tips.push({
      kind: "damage-mix",
      text: covered >= 0.5
        ? `Most of ${whose} damage to your side is ${list}.`
        : `${whose} damage to your side is spread out — the biggest parts are ${list}.`,
      sources: mix,
    });
    const biggest = [...t.incoming].sort((a, b) => b.maxHit - a.maxHit)[0];
    if (biggest.maxHit > 0) {
      tips.push({
        kind: "biggest-hit",
        text: `${whose} biggest hit on your side: ${biggest.maxHit.toLocaleString()} from ${biggest.source}.`,
        sources: [biggest],
      });
    }
  }

  const tried = t.spells.filter((s) => s.landings > 0 && s.landings + s.resists >= MIN_SPELL_TRIES);
  const resisted = tried.filter((s) => s.resistRate >= HIGH_RESIST_RATE);
  for (const s of resisted) {
    tips.push({
      kind: "resisted",
      text: `${who} resisted ${percent(s.resistRate)} of your ${s.spell} (${s.resists} of ${s.landings + s.resists}).`,
      spell: s,
    });
  }
  // Only worth saying beside a bad one: on its own, "this spell works" is what you'd expect.
  const reliable = resisted.length ? tried.filter((s) => s.resistRate < RELIABLE_RESIST_RATE)[0] : undefined;
  if (reliable) {
    tips.push({
      kind: "reliable",
      text: `${reliable.spell} lands far more reliably — resisted ${percent(reliable.resistRate)} of the time.`,
      spell: reliable,
    });
  }

  const { swings, misses, avoided } = t.swings;
  if (swings >= MIN_SWINGS && ratio(misses, swings) >= HIGH_AVOID_RATE) {
    const ways = (Object.keys(avoided) as Avoidance[])
      .filter((how) => avoided[how] > 0)
      .sort((a, b) => avoided[b] - avoided[a])
      .map((how) => `${avoided[how]} ${AVOIDED_AS[how]}`);
    const whiffed = misses - Object.values(avoided).reduce((n, x) => n + x, 0);
    const parts = whiffed > 0 ? [...ways, `${whiffed} missed outright`] : ways;
    tips.push({
      kind: "avoidance",
      text: `${percent(ratio(misses, swings))} of your swings at ${who} didn't land (${misses} of ${swings}): ${parts.join(", ")}.`,
    });
  }

  if (t.deaths > 0) {
    tips.push({ kind: "deaths", text: `You died in ${t.deaths} of these ${t.fights} fights.` });
  }
  return tips.map((tip) => ({ ...tip, text: sentence(tip.text) }));
}

/** The biggest sources, until they cover most of the damage or the list gets long. */
function damageMix(incoming: TrendSource[]): TrendSource[] {
  const mix: TrendSource[] = [];
  let covered = 0;
  for (const s of incoming) {
    if (covered >= MIX_COVERAGE || mix.length >= MIX_MAX || s.damage <= 0) break;
    mix.push(s);
    covered += s.share;
  }
  return mix;
}

/** "Lava Breath (fire, 58%)", "Crush (melee, 31%)", "flames (damage shield, 4%)". */
function describeSource(s: TrendSource): string {
  const how = s.kind === "Melee" ? "melee" : s.kind === "Other" ? "damage shield" : s.damageType ?? "spell";
  return `${s.source} (${how}, ${percent(s.share)})`;
}

/** "a, b and c". */
function joinList(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Capitalize the opening letter — a tip can open on a mob's name, and EQ writes those lower case. */
const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
