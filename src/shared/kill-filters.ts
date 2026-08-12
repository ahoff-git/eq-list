/**
 * kill-filters.ts — which recorded kills the map and the list are showing.
 *
 * One filter object, applied by one function, used by both: a filtered heatmap and the list
 * beside it have to describe the same set of kills, and the surest way to guarantee that is
 * to have only one implementation. Pure and DOM-free, so it's testable on its own.
 */
import type { MobKnowledge } from "./mob-stats";
import type { KillRecord } from "./types";

/** How far back to look. */
export type KillWindow = "10m" | "1h" | "session" | "all";

export interface KillFilters {
  window: KillWindow;
  /** Substring match on the mob's name. */
  mob: string;
  /** Substring match on what the corpse dropped. */
  drop: string;
  /** Only kills that dropped anything at all. */
  droppedOnly: boolean;
  /** Hide kills whose position is less trustworthy than this (0 keeps everything). */
  minConfidence: number;
  /**
   * Keep kills peers shared. **On by default: a peer's kill is data.** A mob dying somewhere is
   * evidence of where it spawns whoever watched it, so the default is to pool — this is the switch for
   * "show me only what I saw myself", which is the question you ask when you doubt the pool.
   */
  shared: boolean;
}

export const DEFAULT_KILL_FILTERS: KillFilters = {
  window: "session",
  mob: "",
  drop: "",
  droppedOnly: false,
  minConfidence: 0,
  shared: true,
};

/**
 * "session" is a generous span rather than a real session boundary: the kill log outlives
 * any one run of the app, and a play session is the thing a player means by "tonight".
 */
const WINDOW_MS: Record<KillWindow, number> = {
  "10m": 10 * 60_000,
  "1h": 60 * 60_000,
  session: 12 * 60 * 60_000,
  all: Number.POSITIVE_INFINITY,
};

/**
 * Does this window have a cutoff that moves as time passes, so anything displaying it needs a
 * clock of its own? Everything but "all" does.
 *
 * `filterKills` reads the clock when it is *called*, which makes a caller that memoizes on the
 * kills and the filters alone quietly wrong: the cutoff freezes at whenever those last changed, so
 * a camp that goes quiet keeps showing kills well past the ten minutes the button claims. This is
 * how a caller knows whether it has to tick.
 */
export function windowMoves(window: KillWindow): boolean {
  return Number.isFinite(WINDOW_MS[window]);
}

/**
 * What a kill looks like coming off the wire. Structural on purpose — the room hook owns the real
 * `SharedKill`, and this module has no business importing renderer code to describe four numbers.
 */
export interface SharedKillLike {
  zone: string;
  y: number;
  x: number;
  mob: string;
  confidence: number;
  /** Who shared it. */
  by?: string;
}

/**
 * A peer's kill as an ordinary `KillRecord`, so **one list and one filter describe the whole map**.
 *
 * They used to bypass both: peer kills went straight onto the canvas while the list beside it showed
 * only your own, so the dots outnumbered the rows and narrowing to one mob left every peer's marker
 * exactly where it was. Converting once, here, is what makes "the list explains the map" true.
 *
 * Two fields it cannot have. There is **no time** — a shared kill carries where, what and how much to
 * believe it, and nothing else (the evidence stays on the machine that saw it) — so `at` is empty, which
 * every window keeps and `clock` renders as a gap rather than a lie. And **no drops**: a peer shares the
 * conclusion, not the loot, so a drop filter excludes them, which is correct — they are no evidence
 * about drops at all.
 */
export function sharedAsKill(shared: SharedKillLike, index: number): KillRecord {
  return {
    // Stable within a render: the sender plus their index in what they sent. A shared kill has no id
    // of its own, and React needs one that doesn't move under it as more arrive.
    id: `shared:${shared.by ?? "peer"}:${index}`,
    logId: -1, // never came from a log line of ours
    at: "",
    mob: shared.mob,
    zone: shared.zone,
    y: shared.y,
    x: shared.x,
    confidence: shared.confidence,
    mine: false,
    sharedBy: shared.by ?? "a peer",
  };
}

/** Apply the filters. `now` is injectable so the time window is testable. */
export function filterKills(kills: KillRecord[], filters: KillFilters, now = Date.now()): KillRecord[] {
  const cutoff = now - WINDOW_MS[filters.window];
  const mob = filters.mob.trim().toLowerCase();
  const drop = filters.drop.trim().toLowerCase();

  return kills.filter((k) => {
    const at = Date.parse(k.at);
    // An unparseable timestamp is kept rather than silently dropped — losing a kill because
    // its clock looked odd would be worse than showing it.
    if (!Number.isNaN(at) && at < cutoff) return false;
    if (mob && !k.mob.toLowerCase().includes(mob)) return false;
    if (filters.droppedOnly && !k.drops?.length) return false;
    if (drop && !k.drops?.some((d) => d.toLowerCase().includes(drop))) return false;
    if (k.confidence < filters.minConfidence) return false;
    if (!filters.shared && k.sharedBy) return false;
    return true;
  });
}

/**
 * The same filters, narrowing **what the kills taught us** rather than the kills themselves.
 *
 * Here so that the one filter object has one place that applies it, whichever panel is asking — the
 * reason `filterKills` is shared between the map and the list in the first place.
 *
 * Only the filters that mean something here are honoured, and the bar hides the rest rather than
 * offering controls that do nothing:
 *
 *  - **No time window.** Mob knowledge is a *lifetime* tally — 300 kills over three weeks is the whole
 *    point of it — so windowing would hide what you learned last week behind a control whose default is
 *    twelve hours. `lastAt` would make it possible; it would also make "session" mean something quite
 *    different here than it does one panel down.
 *  - **No position floor.** A row has a roam *area*, not a position, and confidence is a property of an
 *    individual kill's `/loc`.
 *  - **`shared` drops the rows that are only peers'** (`myKills === 0`), rather than rewriting the
 *    counts of rows you contributed to. "Show me only what I saw" is a question about which mobs you
 *    have first-hand knowledge of; a pooled rate you helped build is still partly yours, and silently
 *    restating it as your own smaller sample would be a different claim.
 */
export function filterMobKnowledge(mobs: MobKnowledge[], filters: KillFilters): MobKnowledge[] {
  const mob = filters.mob.trim().toLowerCase();
  const drop = filters.drop.trim().toLowerCase();

  return mobs.filter((m) => {
    if (mob && !m.mob.toLowerCase().includes(mob)) return false;
    if (filters.droppedOnly && !m.drops.length) return false;
    if (drop && !m.drops.some((d) => d.item.toLowerCase().includes(drop))) return false;
    if (!filters.shared && m.myKills === 0) return false;
    return true;
  });
}
