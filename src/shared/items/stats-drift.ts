/**
 * stats-drift.ts — when a stats read has stopped being true, and why.
 *
 * A read (`stats-page.ts`) is stored as what the game showed beyond what the plan counts (`stat-base.ts`).
 * That offset is right for as long as nothing the game *or the plan* put into it has changed — and four
 * things can, each with a different witness
 * ([ADR 0369](../../../specs/decisions/0369-a-stale-stats-read-says-so.md)):
 *
 * - **A level-up.** Class HP and mana tables, per-level attribute gains. Any level line counts, because EQL
 *   levels per class: a lower class gaining a level moves stats just the same. *Witness: the log.*
 * - **A stat-moving ability.** Innate Eminence, Natural Durability… (`stat-buffs.ts` says which). *The log.*
 * - **A stat buff coming or going.** The read was taken with whatever was up, and the offset holds it.
 *   Compared **then against now, per buff** — not by what the board holds, which is deliberately empty after
 *   every launch — so a buff that fades and is recast stops being a reason by itself. *The buff board.*
 * - **The plan's own inputs.** The offset is measured against a modelled base (your ticked race and classes,
 *   the Items tab's level): change them and the same offset is measured against a different base — ticking
 *   a race after a read would count the race's attributes twice. *The builder.*
 *
 * What is *not* here, on purpose: **gear**. The offset is the character's own part, so it follows the
 * worn gear by design (ADR 0366) and a new dump needs no new read.
 *
 * Pure → a tested black box.
 */
import { abilityMovesStats } from "../buffs/stat-buffs";

// ── What the witnesses record ──

/** Something the log said happened to the character, kept by the main process (it outlives the app). */
export type StatChange = { at: string; kind: "level"; level?: number } | { at: string; kind: "ability"; name: string; rank?: number };

/** A stat buff on you coming up or going down, as the buff board showed it. */
export interface BuffMove {
  /** The log's clock, ISO. */
  at: string;
  key: string;
  spell: string;
  up: boolean;
}

/** One row of the buff board, restricted to stat buffs on you — what `movesBetween` diffs. */
export interface BoardEntry {
  key: string;
  spell: string;
  up: boolean;
  at: string;
}

/** What the plan measures a read against: the character the player *says* they are. */
export interface Basis {
  race?: string;
  /** Sorted, so ticking the same classes in another order is not a change. */
  classes: string[];
  /** The Items tab's level — the rates (STA→HP, INT→mana) are taken at it. */
  level: number;
}

/** When the stats were last read, and against what. */
export interface StatsStamp {
  at: number;
  basis: Basis;
}

export interface Reason {
  kind: "level" | "ability" | "buffs" | "basis";
  /** For the pill: a couple of words. */
  short: string;
  /** For the tooltip and the builder's note: a sentence fragment. */
  text: string;
}

/** How many of each journal is kept: a session of stat buffs flickering is dozens, a week of levels is a handful. */
export const JOURNAL_LIMIT = { changes: 80, moves: 120 } as const;

// ── Journals ──

const when = (iso: string): number => Date.parse(iso);

function sameChange(a: StatChange, b: StatChange): boolean {
  if (a.at !== b.at || a.kind !== b.kind) return false;
  return a.kind === "level" ? a.level === (b as typeof a).level : a.name === (b as typeof a).name && a.rank === (b as typeof a).rank;
}

/** Is this already in the journal? Asked first by the caller that broadcasts, so a replayed log is quiet. */
export const hasChange = (journal: readonly StatChange[], change: StatChange): boolean => journal.some((c) => sameChange(c, change));

/**
 * The journal with `change` in it, oldest first and capped. **Idempotent**: the log is read again on a
 * catch-up and on a re-read ([ADR 0033](../../../specs/decisions/0033-eating-a-log-is-idempotent.md)), and
 * the same level line twice is one level.
 */
export function noteChange(journal: readonly StatChange[], change: StatChange, limit: number = JOURNAL_LIMIT.changes): StatChange[] {
  if (hasChange(journal, change)) return [...journal];
  return [...journal, change].sort((a, b) => when(a.at) - when(b.at)).slice(-limit);
}

/** The same for buff moves: the same move at the same moment is one move. */
export function noteMoves(journal: readonly BuffMove[], moves: readonly BuffMove[], limit: number = JOURNAL_LIMIT.moves): BuffMove[] {
  const fresh = moves.filter((m) => !journal.some((j) => j.key === m.key && j.at === m.at && j.up === m.up));
  if (!fresh.length) return [...journal];
  return [...journal, ...fresh].sort((a, b) => when(a.at) - when(b.at)).slice(-limit);
}

/**
 * The moves between two looks at the buff board: a buff that is new, or whose state or moment changed.
 * One that merely vanished from the board (dismissed, forgotten, a fight ended) is not a move — nothing
 * happened to you. The first look after a launch has no `before`, so it is never passed here: a board
 * that starts empty is not news.
 */
export function movesBetween(before: readonly BoardEntry[], after: readonly BoardEntry[]): BuffMove[] {
  const was = new Map(before.map((e) => [e.key, e]));
  const out: BuffMove[] = [];
  for (const e of after) {
    const p = was.get(e.key);
    if (!p || p.up !== e.up || p.at !== e.at) out.push({ at: e.at, key: e.key, spell: e.spell, up: e.up });
  }
  return out;
}

// ── The plan's inputs ──

/** The basis for a set of criteria: classes sorted and folded, so the order they were ticked in is not a difference. */
export function basisOf(race: string | undefined, classes: readonly string[], level: number): Basis {
  return { ...(race && { race }), classes: [...classes].map((c) => c.toLowerCase()).sort(), level };
}

/** What differs between the basis a read was measured against and the one the plan uses now — null when nothing. */
export function basisChange(then: Basis, now: Basis): string | null {
  const parts: string[] = [];
  if ((then.race ?? "") !== (now.race ?? "")) parts.push("your race");
  if (then.classes.join(",") !== now.classes.join(",")) parts.push("your classes");
  if (then.level !== now.level) parts.push(`the planner's level (${then.level} → ${now.level})`);
  if (!parts.length) return null;
  return `${parts.join(" and ")} changed, and the read was measured against the old ${parts.length > 1 ? "ones" : "one"}`;
}

// ── Reasons ──

function listOf(names: readonly string[], spelled = 3): string {
  return names.length <= spelled ? names.join(", ") : `${names.slice(0, spelled).join(", ")} and ${names.length - spelled} more`;
}

/**
 * Buffs, then against now. For each stat buff that moved after the read: what it was at the read (its last
 * move before; failing that, a first fade proves it was up and a first landing says it wasn't) against what
 * it is now (its last move). Different is a reason; the same — faded and recast — is not.
 *
 * The one unfair case: a buff up at the read that the board never saw land (before this launch), and then
 * refreshed. Its landing reads as a new buff. Rare, and a glance settles it.
 */
function buffReasons(moves: readonly BuffMove[], since: number): { gone: string[]; added: string[] } {
  const byKey = new Map<string, BuffMove[]>();
  for (const m of [...moves].sort((a, b) => when(a.at) - when(b.at))) byKey.set(m.key, [...(byKey.get(m.key) ?? []), m]);
  const gone: string[] = [];
  const added: string[] = [];
  for (const history of byKey.values()) {
    const before = history.filter((m) => when(m.at) <= since);
    const after = history.filter((m) => when(m.at) > since);
    if (!after.length) continue;
    const then = before.length ? before[before.length - 1].up : !after[0].up;
    const now = after[after.length - 1].up;
    if (then === now) continue;
    (now ? added : gone).push(after[after.length - 1].spell);
  }
  return { gone, added };
}

/** Why the read at `stamp` can no longer be trusted, if it can't. Empty is "nothing the app can see has changed". */
export function driftReasons(input: { stamp: StatsStamp; changes: readonly StatChange[]; moves: readonly BuffMove[]; basisNow?: Basis }): Reason[] {
  const { stamp, changes, moves, basisNow } = input;
  const out: Reason[] = [];

  const basis = basisNow && basisChange(stamp.basis, basisNow);
  if (basis) out.push({ kind: "basis", short: "race/class/level changed", text: basis });

  const levels = changes.filter((c): c is Extract<StatChange, { kind: "level" }> => c.kind === "level" && when(c.at) > stamp.at);
  if (levels.length) {
    const top = Math.max(0, ...levels.map((l) => l.level ?? 0));
    out.push({
      kind: "level",
      short: "level up",
      text: levels.length === 1 ? (top ? `reached level ${top}` : "gained a level") : `gained ${levels.length} levels${top ? ` (now ${top})` : ""}`,
    });
  }

  const abilities = [...new Set(changes.filter((c): c is Extract<StatChange, { kind: "ability" }> => c.kind === "ability" && when(c.at) > stamp.at && abilityMovesStats(c.name)).map((c) => c.name))];
  if (abilities.length) out.push({ kind: "ability", short: "new ability", text: `bought ${listOf(abilities)}` });

  const { gone, added } = buffReasons(moves, stamp.at);
  if (gone.length || added.length) {
    const said = [gone.length ? `${listOf(gone)} ${gone.length === 1 ? "has" : "have"} gone` : "", added.length ? `${listOf(added)} ${added.length === 1 ? "is" : "are"} up that wasn't` : ""].filter(Boolean);
    out.push({ kind: "buffs", short: "buffs changed", text: said.join("; ") });
  }
  return out;
}

/** The pill's words: the first couple of reasons, not a paragraph. */
export function driftLabel(reasons: readonly Reason[]): string {
  const shown = reasons.slice(0, 2).map((r) => r.short);
  const more = reasons.length - shown.length;
  return `Re-read your stats · ${shown.join(" · ")}${more > 0 ? ` · +${more}` : ""}`;
}
