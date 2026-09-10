/**
 * faction-log.ts — a running record of what has raised or lowered your faction standing, kept in
 * the main process so it's complete whether or not the Faction tab is open.
 *
 * Mirrors [loot-log.ts](./loot-log.ts): the watcher hands every parsed `FactionEvent` here, the tab
 * reads the history on open and follows live ones after, and it's persisted (capped) so the ledger
 * survives a restart. Eating a past log feeds this too, for the same reason loot does (ADR 0055) —
 * every hit is keyed by its log line, which is what makes that safe to do twice (ADR 0033).
 *
 * Deliberately its own file rather than a branch of loot-log.ts: a faction hit is not a drop, needs
 * no zone (a standing is a fact about your character, not about where you were standing when the
 * game told you about it — ADR 0136 has nothing to attach to here), and folds to a **net delta** per
 * faction rather than a count.
 *
 * A standing outlives the hits that built it, the same way a vendor price outlives the drop that
 * proved it (ADR 0056): the feed is capped, but a hit aging out of it must not silently erase part
 * of a faction's net — that would make the number depend on how many other hits happened to log
 * after it, which is not something the game itself ever undoes. `retired` is the running fold of
 * every hit that has left the feed, kept forever; `standings()` folds it together with whatever is
 * still in the feed.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import type { FactionEvent, FactionStanding, ForgetScope } from "../src/shared/types";
import { createSaver, readJson } from "./json-store";

const log = createLogger("faction-log");

/** Hits arrive one at a time, or a handful together off a replayed gap; coalesce the writes. */
const WRITE_DEBOUNCE_MS = 3000;

/**
 * How many hits the feed keeps. A faction hit is rarer than a drop by an order of magnitude — a
 * quest turn-in or a kill that happens to matter to one faction, not every corpse — so this needs
 * nowhere near loot's 20,000 to cover months of play. Whatever ages out is folded into `retired`
 * first, so the cap only ever trims detail, never a faction's net standing.
 */
const MAX_FACTION = 5_000;

/** How many hits the feed returns when the caller doesn't say. */
const DEFAULT_LIMIT = 200;

export type FactionAdded = "added" | "known";

/**
 * A faction hit's identity: the log line behind it, the same rule a drop is keyed by (ADR 0033).
 * Two hits against the same faction, in the same direction, for the same amount, in the same
 * logged second collapse into one — the same trade loot's own key makes, and under-counting is the
 * safer way to be wrong.
 */
const factionKey = (e: FactionEvent): string => `${e.at} ${e.faction.toLowerCase()} ${e.direction} ${e.delta ?? ""}`;

/** A faction touched for the first time: every tally starts at zero, both timestamps are this hit's. */
function blankStanding(faction: string, at: string): FactionStanding {
  return { faction, net: 0, raises: 0, lowers: 0, floors: 0, ceilings: 0, firstAt: at, lastAt: at };
}

/** Fold one hit into a standing — a new object, so a caller holding the old one is unaffected. */
function foldHit(row: FactionStanding, e: FactionEvent): FactionStanding {
  const next = { ...row };
  if (e.delta !== null) {
    next.net += e.delta;
    if (e.delta >= 0) next.raises += 1;
    else next.lowers += 1;
  } else if (e.direction === "floor") {
    next.floors += 1;
  } else if (e.direction === "ceiling") {
    next.ceilings += 1;
  }
  if (e.at < next.firstAt) next.firstAt = e.at;
  if (e.at > next.lastAt) next.lastAt = e.at;
  return next;
}

/** Fold a batch of hits onto a starting set of standings — `retired` plus whatever's still live. */
function foldAll(base: readonly FactionStanding[], hits: readonly FactionEvent[]): FactionStanding[] {
  const byFaction = new Map(base.map((s) => [s.faction, s]));
  for (const e of hits) {
    const row = byFaction.get(e.faction) ?? blankStanding(e.faction, e.at);
    byFaction.set(e.faction, foldHit(row, e));
  }
  return [...byFaction.values()];
}

export interface FactionLog {
  /**
   * Record a faction-standing change, live or eaten from a past log. Keyed by its log line, so a
   * replayed gap — or a log eaten twice — can't file the same hit twice (ADR 0033).
   */
  add(event: FactionEvent): FactionAdded;
  /** The most recent hits, newest first (at most `limit`). */
  recent(limit?: number): FactionEvent[];
  /**
   * Every faction the ledger has seen a change for, folded to one row each — `net` summing every
   * stated delta, plus how many hits of each kind produced it. Covers hits that have aged out of
   * the feed as well as what's still in it (see the header).
   */
  standings(): FactionStanding[];
  /**
   * Forget the feed. **Standings survive by default** — they're what the ledger *taught*, same rule
   * as a loot price (ADR 0056). `"everything"` is the deliberate, asked-for wipe.
   */
  clear(scope?: ForgetScope): void;
  flush(): void;
}

export function createFactionLog(userDataDir: string): FactionLog {
  const file = path.join(userDataDir, "faction-log.json");
  const stored = read();
  let events: FactionEvent[] = stored.hits;
  /** Standings folded from hits that have aged out of the feed — kept forever (ADR 0056). */
  let retired: FactionStanding[] = stored.retired;
  /** Every hit in the feed, by its log line — see `add`. Rebuilt from what's on disk. */
  const byKey = new Map(events.map((e) => [factionKey(e), e]));
  const saver = createSaver(file, "faction log", () => ({ hits: events, retired }), WRITE_DEBOUNCE_MS, {
    concern: "faction-log",
  });

  function read(): { hits: FactionEvent[]; retired: FactionStanding[] } {
    // Absent or unreadable is an empty ledger — the feed is a nicety, never a hard failure.
    const parsed = readJson<{ hits?: FactionEvent[]; retired?: FactionStanding[] }>(file, {});
    return {
      hits: Array.isArray(parsed.hits) ? parsed.hits : [],
      retired: Array.isArray(parsed.retired) ? parsed.retired : [],
    };
  }

  function save(): void {
    saver.save();
  }

  return {
    add(event) {
      const key = factionKey(event);
      if (byKey.has(key)) return "known";
      byKey.set(key, event);
      events.push(event);
      if (events.length > MAX_FACTION) {
        // The oldest hits leave the feed, but what they taught about the faction is kept — otherwise
        // a standing built up over months would silently shrink the moment the feed filled up.
        const leaving = events.slice(0, events.length - MAX_FACTION);
        events = events.slice(-MAX_FACTION);
        for (const e of leaving) byKey.delete(factionKey(e));
        retired = foldAll(retired, leaving);
      }
      save();
      return "added";
    },

    recent: (limit = DEFAULT_LIMIT) => events.slice(-limit).reverse(),

    standings() {
      // Most recently touched first — the faction you're actively working belongs at the top, the
      // same "what's fresh" ordering the spawn and buff boards use.
      return foldAll(retired, events).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
    },

    clear(scope = "records") {
      // The hits still in the feed are retired on the way out, the same as when they age out of it —
      // "keep the standings" has to mean *all* of them, not just the ones already folded.
      if (scope === "records") retired = foldAll(retired, events);
      else retired = [];
      events = [];
      byKey.clear();
      saver.flush();
      log.debug("cleared", { scope });
    },
    flush() {
      saver.flush();
    },
  };
}
