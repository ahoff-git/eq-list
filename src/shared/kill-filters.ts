/**
 * kill-filters.ts — which recorded kills the map and the list are showing.
 *
 * One filter object, applied by one function, used by both: a filtered heatmap and the list
 * beside it have to describe the same set of kills, and the surest way to guarantee that is
 * to have only one implementation. Pure and DOM-free, so it's testable on its own.
 */
import type { MobKnowledge } from "./mob-stats";
import { compareValues } from "./sorting";
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

/** Substring match, folded — how every free-text filter here reads. An empty filter asks nothing. */
const contains = (value: string, filter: string): boolean => {
  const needle = filter.trim().toLowerCase();
  return !needle || value.toLowerCase().includes(needle);
};

/**
 * Does this name answer the mob filter? The filter is a *substring*, not a name — the picker offers
 * whole names but the map's "show me this one" and a half-typed fragment land in the same field — so
 * the rule for "is this the mob we're asking about" lives in one place, and the filter bar can ask it
 * about a mob as easily as the panels ask it about a row.
 */
export function matchesMob(name: string, filter: string): boolean {
  return contains(name, filter);
}

/**
 * Does this item answer the drop filter? `matchesMob`'s counterpart, and exported for the same
 * reason: the 📖 panel marks the drop row that matched and opens the mob holding it, which is asking
 * the filter's own question about a single item. A second implementation of "matched" there would be
 * a search that highlights rows the filter didn't keep.
 */
export function matchesDrop(item: string, filter: string): boolean {
  return contains(item, filter);
}

/** Apply the filters. `now` is injectable so the time window is testable. */
export function filterKills(kills: KillRecord[], filters: KillFilters, now = Date.now()): KillRecord[] {
  const cutoff = now - WINDOW_MS[filters.window];
  const drop = filters.drop.trim();

  return kills.filter((k) => {
    const at = Date.parse(k.at);
    // An unparseable timestamp is kept rather than silently dropped — losing a kill because
    // its clock looked odd would be worse than showing it.
    if (!Number.isNaN(at) && at < cutoff) return false;
    if (!matchesMob(k.mob, filters.mob)) return false;
    if (filters.droppedOnly && !k.drops?.length) return false;
    // Guarded on `drop` rather than left to `matchesDrop`: with no filter typed, a kill that dropped
    // nothing has nothing for `some` to be true about, and would be filtered out by an empty ask.
    if (drop && !k.drops?.some((d) => matchesDrop(d, drop))) return false;
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
  const drop = filters.drop.trim();

  return mobs.filter((m) => {
    if (!matchesMob(m.mob, filters.mob)) return false;
    if (filters.droppedOnly && !m.drops.length) return false;
    // Guarded like `filterKills`: an empty ask must not hide the mobs that have never dropped.
    if (drop && !m.drops.some((d) => matchesDrop(d.item, drop))) return false;
    if (!filters.shared && m.myKills === 0) return false;
    return true;
  });
}

/** One choice the mob picker offers: a name, and whether that mob has ever given anything up. */
export interface MobChoice {
  mob: string;
  /**
   * Has anything ever come off it? Carried alongside the name because a picker that offers a mob
   * and a `droppedOnly` filter that then hides it are the same fact seen twice — see `withDroppedOnly`.
   */
  dropped: boolean;
}

/**
 * The mobs a filter bar can offer, from whichever rows the panel has: kills (`drops?: string[]`) or
 * mob knowledge (`drops: DropStat[]`). One choice per name, ordered the way every other picker is.
 *
 * Here rather than in either panel for the same reason as `lootSources`: "the choices this filter
 * has" is the filter module's business, and two bars filtering one object must offer the same names.
 */
export function mobChoices(rows: Iterable<{ mob: string; drops?: readonly unknown[] }>): MobChoice[] {
  const dropped = new Map<string, boolean>();
  for (const row of rows) dropped.set(row.mob, (dropped.get(row.mob) ?? false) || !!row.drops?.length);
  return [...dropped]
    .map(([mob, dropped]) => ({ mob, dropped }))
    .sort((a, b) => compareValues(a.mob, b.mob));
}

/**
 * Turn "dropped" on or off — releasing a picked mob that has never dropped anything.
 *
 * The two can't both be satisfied, and the panel left behind says only "nothing matches" while the
 * mob's name still sits in the picker, so the box you just ticked looks like the thing that broke.
 * The tick is the newer intent, so it wins: the mob is let go rather than the question made
 * unanswerable. Turning "dropped" back off never touches the mob — nothing is in conflict then, and
 * a filter that forgot your pick on the way out would be its own surprise.
 *
 * A rule about which filters can coexist, so it lives beside them and not in the bar that renders
 * the checkbox — the bar is one of two, and both toggle the same box.
 */
export function withDroppedOnly(filters: KillFilters, on: boolean, mobs: MobChoice[]): KillFilters {
  const answerable = mobs.some((m) => m.dropped && matchesMob(m.mob, filters.mob));
  return { ...filters, droppedOnly: on, mob: on && !answerable ? "" : filters.mob };
}
