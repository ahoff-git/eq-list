/**
 * Your crafting log — every combine your log records, credited to its tradeskill and to the skill you
 * had when you made it, then rolled up two ways: by **sitting** (an evening at the forge, the way the
 * combat log has fights) and by **item at each skill level** (your success rate as you climb).
 *
 * A combine's line names the item and never the skill ("You lacked the skills to fashion Sheet
 * Metal."), so the skill is read off the sitting, the same rule `skill-progress.ts` measures your pace
 * by: an unbroken run of crafting with no gap longer than `SESSION_GAP_MS`, belonging to the tradeskill
 * that skills up in it. Combines before the sitting's first skill-up wait for it; combines after it
 * are that skill's at once. A sitting where nothing skilled up — all of it trivial — leaves its
 * combines un-credited rather than guessed: they still count in the sitting, under "unknown skill".
 *
 * **The level** is your skill when you made the combine — the skill's value before the skill-up that
 * claimed it. The game prints a skill-up just *before* the result of the combine that earned it, so
 * that one combine reads one level high. Over a sitting it doesn't move a rate.
 */
import type { CombineEvent, SkillUpEvent } from "../types";
import { LOG_TRADESKILLS, SESSION_GAP_MS, type SkillValue } from "./skill-progress";

/** One combine. `skill`/`level` are set once the sitting says which tradeskill it was. */
export interface CraftRecord {
  at: string;
  item: string;
  ok: boolean;
  skill?: string;
  level?: number;
}

/** A tradeskill skill-up, kept so a sitting can say how far it took you. */
export interface CraftSkillUp {
  at: string;
  skill: string;
  value: number;
}

/** The log as the reducer keeps it. Plain data: it is persisted with the rest of your progress. */
export interface CraftingLog {
  records: CraftRecord[];
  ups: CraftSkillUp[];
  /** The sitting in progress: its tradeskill once known, and its last event (ms). */
  sitting: { skill?: string; last: number };
  /** Records in this sitting waiting for its tradeskill. */
  waiting: number[];
}

export function emptyCraftingLog(): CraftingLog {
  return { records: [], ups: [], sitting: { last: 0 }, waiting: [] };
}

/** A new sitting when the gap since the last crafting event is too long to be the same one. */
function maybeNewSitting(log: CraftingLog, t: number): void {
  if (log.sitting.last && t - log.sitting.last > SESSION_GAP_MS) {
    log.sitting = { last: t };
    log.waiting = [];
  }
  log.sitting.last = t;
}

/**
 * Take one event in, in log order. `skills` is your skills **before** this event — the tracker
 * calls this ahead of `skill-progress.ts`'s `noteEvent`, which is what makes a skill-up's "before"
 * value available here. A combat skill-up is ignored: it neither belongs in a crafting log nor ends a
 * sitting.
 */
export function noteCraft(log: CraftingLog, e: SkillUpEvent | CombineEvent, skills: Readonly<Record<string, SkillValue>>): void {
  const t = Date.parse(e.at);
  if (e.kind === "combine") {
    maybeNewSitting(log, t);
    const record: CraftRecord = { at: e.at, item: e.item, ok: e.ok };
    const skill = log.sitting.skill;
    if (skill) {
      record.skill = skill;
      const level = skills[skill]?.value;
      if (level !== undefined) record.level = level;
    } else log.waiting.push(log.records.length);
    log.records.push(record);
    return;
  }
  if (!LOG_TRADESKILLS.has(e.skill)) return;
  maybeNewSitting(log, t);
  const before = skills[e.skill]?.value ?? e.value - 1;
  for (const i of log.waiting) {
    log.records[i].skill = e.skill;
    log.records[i].level = before;
  }
  log.waiting = [];
  log.sitting.skill = e.skill;
  log.ups.push({ at: e.at, skill: e.skill, value: e.value });
}

// ─── Rolled up ──────────────────────────────────────────────────────────────────────────────────

export interface Tally {
  attempts: number;
  ok: number;
}

/** One sitting at a station. */
export interface CraftSitting {
  start: string;
  end: string;
  /** The tradeskill that skilled up in it, if one did. */
  skill?: string;
  attempts: number;
  ok: number;
  /** Skill-ups in it, and the skill before the first and after the last. */
  points: number;
  from?: number;
  to?: number;
  /** What was made, most attempted first. */
  items: (Tally & { item: string })[];
}

/** One item at one skill level. */
export interface CraftLevel extends Tally {
  level: number;
}

/** One item, all told and level by level. */
export interface CraftItem extends Tally {
  item: string;
  skill?: string;
  levels: CraftLevel[];
  /** Attempts whose level isn't known (a sitting where nothing skilled up). */
  unlevelled: Tally;
  lastAt: string;
}

export interface CraftingSummary {
  sittings: CraftSitting[];
  items: CraftItem[];
}

const tally = (): Tally => ({ attempts: 0, ok: 0 });
const count = (t: Tally, ok: boolean) => {
  t.attempts++;
  if (ok) t.ok++;
};

/**
 * Fill in what a sitting couldn't say. A sitting where nothing skilled up — an evening of trivial
 * ore bricks — credits no tradeskill, but the same item made in a sitting that did skill up says which
 * one it is; and your skill-ups say what that skill stood at, at that moment. A combine no sitting ever
 * tied to a skill (a quest combine in a container) stays without one.
 */
function withInferredSkills(log: CraftingLog): CraftRecord[] {
  const itemSkill = new Map<string, string>();
  for (const r of log.records) if (r.skill && !itemSkill.has(r.item)) itemSkill.set(r.item, r.skill);
  const valueAt = (skill: string, at: string): number | undefined => {
    let value: number | undefined;
    for (const up of log.ups) {
      if (up.at > at) break;
      if (up.skill === skill) value = up.value;
    }
    return value;
  };
  return log.records.map((r) => {
    if (r.skill) return r;
    const skill = itemSkill.get(r.item);
    if (!skill) return r;
    const level = valueAt(skill, r.at);
    return level === undefined ? { ...r, skill } : { ...r, skill, level };
  });
}

/** Sittings newest first; items most attempted first. */
export function summarizeCrafting(log: CraftingLog): CraftingSummary {
  const records = withInferredSkills(log);
  type Ev = { t: number; at: string; record?: CraftRecord; up?: CraftSkillUp };
  const events: Ev[] = [
    ...records.map((record) => ({ t: Date.parse(record.at), at: record.at, record })),
    ...log.ups.map((up) => ({ t: Date.parse(up.at), at: up.at, up })),
  ].sort((a, b) => a.t - b.t);

  const sittings: CraftSitting[] = [];
  let current: CraftSitting | undefined;
  let byItem = new Map<string, Tally & { item: string }>();
  let last = 0;
  const close = () => {
    if (!current) return;
    current.items = [...byItem.values()].sort((a, b) => b.attempts - a.attempts);
    sittings.push(current);
  };
  for (const ev of events) {
    if (!current || ev.t - last > SESSION_GAP_MS) {
      close();
      current = { start: ev.at, end: ev.at, attempts: 0, ok: 0, points: 0, items: [] };
      byItem = new Map();
    }
    last = ev.t;
    current.end = ev.at;
    if (ev.record) {
      count(current, ev.record.ok);
      const it = byItem.get(ev.record.item) ?? { item: ev.record.item, ...tally() };
      count(it, ev.record.ok);
      byItem.set(ev.record.item, it);
      current.skill ??= ev.record.skill;
    } else if (ev.up) {
      current.skill ??= ev.up.skill;
      current.points++;
      current.from ??= ev.up.value - 1;
      current.to = ev.up.value;
    }
  }
  close();

  const items = new Map<string, CraftItem>();
  for (const r of records) {
    const key = `${r.skill ?? ""}|${r.item}`;
    let it = items.get(key);
    if (!it) {
      it = { item: r.item, skill: r.skill, ...tally(), levels: [], unlevelled: tally(), lastAt: r.at };
      items.set(key, it);
    }
    count(it, r.ok);
    it.lastAt = r.at > it.lastAt ? r.at : it.lastAt;
    if (r.level === undefined) count(it.unlevelled, r.ok);
    else {
      let lv = it.levels.find((l) => l.level === r.level);
      if (!lv) it.levels.push((lv = { level: r.level, ...tally() }));
      count(lv, r.ok);
    }
  }
  for (const it of items.values()) it.levels.sort((a, b) => a.level - b.level);

  return {
    sittings: sittings.reverse(),
    items: [...items.values()].sort((a, b) => b.attempts - a.attempts),
  };
}

/** "62%" — or "—" when there's nothing to divide. */
export function successText(t: Tally): string {
  return t.attempts ? `${Math.round((t.ok / t.attempts) * 100)}%` : "—";
}
