/**
 * harvest.ts — filling the item catalogue, slowly, and **once per room rather than once per person**.
 *
 * [ADR 0153](../../specs/decisions/0153-the-catalogue-is-filled-by-a-gentle-trickle.md) made the
 * catalogue fillable: 11,136 wiki pages, one a second, about three hours. That is the right price for
 * one person and the wrong one for five, who between them would ask eqlwiki for the same eleven
 * thousand pages five times over to end up with five identical caches.
 *
 * So the roster is cut into shards ([`item-shards.ts`](../../src/shared/item-shards.ts)) and the room
 * divides the work ([ADR 0160](../../specs/decisions/0160-a-room-fills-the-catalogue-once.md)). Each
 * pass asks one question — *what is the most useful thing I could do next?* — and the order of
 * preference is the whole design:
 *
 *  1. **Take a shard a peer already has.** One message, no wiki request, about a second. This is
 *     what makes joining a room that has done the work take minutes instead of hours.
 *  2. **Fetch a shard nobody has**, chosen in an order that is ours alone, skipping whatever the
 *     room is visibly working on.
 *  3. **Wait**, when every remaining gap is somebody else's live claim — because fetching it anyway
 *     is precisely the duplicate this exists to prevent.
 *
 * Everything ADR 0153 promised still holds: one request at a time with a gap, nothing starts unless
 * asked, a page already held costs no request and no wait, a broken page is a row and not an ending,
 * and progress survives being stopped. What changed is that "what's left" is now a question about the
 * room and not only about this machine.
 *
 * Every dependency is injected — the roster, the cache tests, the fetch, the peers, the clock, the
 * sleep — so the whole schedule, including the sharing, is testable in milliseconds with no network
 * and no room ([testing](../../specs/testing/README.md)).
 */
import { createLogger } from "../../src/shared/logging";
import {
  coverageOf,
  emptyCoverage,
  hasShard,
  planShardStep,
  roomCoverage,
  setShard,
  shardOf,
  type Coverage,
  type PeerCoverage,
} from "../../src/shared/item-shards";

const log = createLogger("wiki-harvest");

/**
 * The gap between pages. Measured against the live wiki (~90 ms and ~3 KB a page), a second is about
 * a tenth of one visitor's load, sustained. Adjustable, because how gentle to be with someone's
 * server is a judgement the person running it may hold more strongly than a default can.
 */
export const DEFAULT_GAP_MS = 1000;

/** The bounds a caller's pace is clamped to — neither a stampede nor a standstill. */
export const GAP_RANGE = { min: 250, max: 10_000 } as const;

/**
 * How long to give a peer to answer a shard ask before moving on.
 *
 * A shard is one small message over an already-open connection, so an answer is nearly immediate
 * when it is coming at all. This is the timeout for when it isn't — a peer that dropped, or whose
 * catalogue was a minute stale and no longer true.
 */
const ASK_TIMEOUT_MS = 8_000;

/** Don't ask the same peer for the same shard again inside this — see `askedRecently`. */
const ASK_COOLDOWN_MS = 60_000;

/** How long to pause when every remaining gap is somebody else's claim. */
const WAIT_MS = 15_000;

/** What a stopped run leaves behind, and what a resumed one picks up. */
export interface SavedHarvest {
  /** The roster as last fetched, so a resume needn't re-list the category. */
  roster: string[];
  /** Pages fetched from the wiki, across runs. */
  fetched: number;
  /** Pages taken from peers, across runs — the number that says what the room saved us. */
  fromPeers: number;
  /** Titles the wiki wouldn't give us. Kept by name: a dozen broken pages is a thing to look at. */
  failed: string[];
  startedAt: string;
  updatedAt: string;
}

export type HarvestStatus = "idle" | "running" | "stopping" | "done";

/** What the panel draws while this runs. */
export interface HarvestProgress {
  status: HarvestStatus;
  /** Roster size — 0 before a run has learned it. */
  total: number;
  /** How many of those titles we now hold. The bar. */
  at: number;
  /** Fetched from the wiki. */
  fetched: number;
  /** Taken from peers instead — the saving the room made. */
  fromPeers: number;
  failed: number;
  /** Shards: how many the roster touches, how many we hold, how many the **room** holds between it. */
  shards: { present: number; mine: number; room: number };
  /** The page or shard in flight, so a stalled run looks stalled rather than merely quiet. */
  title?: string;
  /** Where the current work is coming from — a peer costs nobody anything, the wiki costs the wiki. */
  from?: "wiki" | "peer";
  etaMs?: number;
  error?: string;
}

export interface HarvestDeps {
  /** Every item title the wiki knows. Called once per run, not per page. */
  roster(): Promise<string[]>;
  /** Every roster title we currently hold at the current parser version and inside its TTL. */
  heldTitles(): Promise<Set<string>>;
  /** Do we hold this one page? Must not touch the network. */
  held(title: string): boolean;
  /** Fetch and cache one page. `false` when the wiki had nothing to give. */
  fetch(title: string): Promise<boolean>;
  /** The room's coverage, as its catalogues last described it. */
  peers(): PeerCoverage[];
  /** Our own peer id, which is what gives us a shard order nobody else shares. */
  myId(): string;
  /** Ask one peer for one shard. Fire-and-forget: the pages land through the share hub. */
  askPeer(peerId: string, shard: number): void;
  /** Tell the room which shard we are fetching, so nobody else takes it. */
  claim(shard: number | undefined): void;
  load(): SavedHarvest | null;
  save(state: SavedHarvest): void;
  wait(ms: number): Promise<void>;
  now(): number;
  onProgress(progress: HarvestProgress): void;
}

export interface Harvester {
  start(opts?: { gapMs?: number; restart?: boolean }): HarvestProgress;
  stop(): HarvestProgress;
  status(): HarvestProgress;
}

const clampGap = (ms: number): number => Math.min(GAP_RANGE.max, Math.max(GAP_RANGE.min, Math.round(ms)));

function emptyRun(roster: string[], at: string): SavedHarvest {
  return { roster, fetched: 0, fromPeers: 0, failed: [], startedAt: at, updatedAt: at };
}

export function createHarvester(deps: HarvestDeps): Harvester {
  let state: SavedHarvest | null = null;
  let status: HarvestStatus = "idle";
  let gapMs = DEFAULT_GAP_MS;
  let title: string | undefined;
  let from: "wiki" | "peer" | undefined;
  let error: string | undefined;
  let running: Promise<void> | null = null;

  /** Roster titles grouped by shard — rebuilt whenever the roster is. */
  let byShard = new Map<number, string[]>();
  /** Shards the roster touches. A shard with nothing in it is not a gap. */
  let present: Coverage = emptyCoverage();
  /** Shards we hold every roster title for. */
  let mine: Coverage = emptyCoverage();
  /** Titles we hold, so the bar can move without re-reading the cache directory. */
  let held = new Set<string>();
  /** `shard:peerId` → when we asked, so a peer that never answers isn't asked in a loop. */
  const asks = new Map<string, number>();
  /**
   * Shards we have fetched right through and still cannot complete.
   *
   * eqlwiki's own `Category:Items` lists pages that 404 or won't parse, and a shard holding one is
   * never *complete* — so without this the planner would hand it back for ever and the run would
   * spin on the same eleven pages instead of reaching the rest of the catalogue. Per-run, not
   * persisted: a page broken today may be fixed next month, and the next run should find out.
   */
  const exhausted = new Set<number>();

  const askedRecently = (shard: number, peerId: string): boolean => {
    const at = asks.get(`${shard}:${peerId}`);
    return at !== undefined && deps.now() - at < ASK_COOLDOWN_MS;
  };

  function indexRoster(roster: string[]): void {
    byShard = new Map();
    present = emptyCoverage();
    for (const t of roster) {
      const shard = shardOf(t);
      setShard(present, shard);
      const bucket = byShard.get(shard);
      if (bucket) bucket.push(t);
      else byShard.set(shard, [t]);
    }
  }

  /**
   * Re-decide whether we hold a shard, by asking the cache about each of its titles.
   *
   * Completeness is always **self-assessed**, never taken from a peer's word: a peer whose roster has
   * one title more than ours hands us their shard, we notice we are still short, and we fetch that one
   * page ourselves. A disagreement about the roster costs a page and never leaves a hole.
   */
  function recheck(shard: number): void {
    const titles = byShard.get(shard) ?? [];
    let complete = titles.length > 0;
    for (const t of titles) {
      if (deps.held(t)) held.add(t);
      else {
        held.delete(t);
        complete = false;
      }
    }
    setShard(mine, shard, complete);
  }

  function progress(): HarvestProgress {
    const roster = state?.roster.length ?? 0;
    const shards = roomCoverage({ mine, present, peers: deps.peers() });
    // Pessimistic on purpose, and only about what *we* would have to fetch: shards the room can hand
    // over are a message each, not a minute each.
    const gaps = Math.max(0, shards.present - shards.room);
    return {
      status,
      total: roster,
      at: held.size,
      fetched: state?.fetched ?? 0,
      fromPeers: state?.fromPeers ?? 0,
      failed: state?.failed.length ?? 0,
      shards,
      title,
      from,
      etaMs: status === "running" && roster ? gaps * Math.ceil(roster / Math.max(1, shards.present)) * gapMs : undefined,
      error,
    };
  }

  function report(): HarvestProgress {
    const p = progress();
    deps.onProgress(p);
    return p;
  }

  function checkpoint(): void {
    if (!state) return;
    state.updatedAt = new Date(deps.now()).toISOString();
    deps.save(state);
    report();
  }

  /** Fetch the titles of one shard we don't already hold, with the gap between them. */
  async function fetchShard(shard: number): Promise<void> {
    if (!state) return;
    deps.claim(shard);
    from = "wiki";
    const titles = byShard.get(shard) ?? [];
    for (const next of titles) {
      if (status !== "running") break;
      // The fast path, and the reason a second run is cheap: a page we hold costs no request and,
      // crucially, no wait.
      if (deps.held(next)) {
        held.add(next);
        continue;
      }
      title = next;
      try {
        const got = await deps.fetch(next);
        if (got) {
          state.fetched++;
          held.add(next);
        } else if (!state.failed.includes(next)) {
          state.failed.push(next);
        }
      } catch (e) {
        log.warn("harvest failed on", next, (e as Error).message);
        if (!state.failed.includes(next)) state.failed.push(next);
      }
      checkpoint();
      if (status === "running") await deps.wait(gapMs);
    }
    title = undefined;
    recheck(shard);
    // Fetched through and still short: something in it is not gettable, so stop offering it as work.
    if (!hasShard(mine, shard) && status === "running") {
      exhausted.add(shard);
      log.debug("shard", shard, "cannot be completed - leaving it");
    }
    deps.claim(undefined);
  }

  /** Ask a peer for a shard and give the answer a moment to land. */
  async function askShard(shard: number, peerId: string): Promise<void> {
    if (!state) return;
    asks.set(`${shard}:${peerId}`, deps.now());
    from = "peer";
    title = `shard ${shard}`;
    const before = held.size;
    deps.askPeer(peerId, shard);
    // No callback and no promise from the transport: the pages arrive through the share hub and land
    // in the same cache `held` reads. Waiting a beat and looking again is both simpler and more
    // honest than a delivery receipt that could still be a lie.
    await deps.wait(ASK_TIMEOUT_MS);
    recheck(shard);
    state.fromPeers += Math.max(0, held.size - before);
    title = undefined;
    checkpoint();
  }

  async function run(): Promise<void> {
    try {
      while (status === "running" && state) {
        const step = planShardStep({
          mine,
          present,
          peers: deps.peers(),
          myId: deps.myId(),
          now: deps.now(),
          asked: askedRecently,
          exhausted: (shard) => exhausted.has(shard),
        });

        if (step.action === "done") {
          status = "done";
          log.debug(`harvest done: ${state.fetched} fetched, ${state.fromPeers} from peers, ${state.failed.length} failed`);
          break;
        }
        if (step.action === "wait") {
          // Every gap left is somebody's live claim. Idling is the *point* — the alternative is
          // fetching what the room is already fetching.
          from = undefined;
          title = undefined;
          report();
          await deps.wait(WAIT_MS);
          continue;
        }
        if (step.action === "ask") await askShard(step.shard, step.from);
        else await fetchShard(step.shard);
      }
      if (status !== "done") status = "idle";
    } finally {
      title = undefined;
      from = undefined;
      deps.claim(undefined);
      running = null;
      checkpoint();
    }
  }

  return {
    status: () => progress(),

    start(opts) {
      if (status === "running" || running) return progress();
      error = undefined;
      gapMs = clampGap(opts?.gapMs ?? DEFAULT_GAP_MS);
      status = "running";
      running = (async () => {
        try {
          const saved = opts?.restart ? null : (state ?? deps.load());
          if (saved?.roster.length) {
            state = saved;
          } else {
            const roster = await deps.roster();
            if (!roster.length) {
              // A run that silently "finished" instantly would look like success. This is the one
              // failure worth putting in front of somebody.
              error = "the wiki gave no item list — offline, or the category has moved";
              status = "idle";
              log.warn("harvest not started:", error);
              return;
            }
            state = emptyRun(roster, new Date(deps.now()).toISOString());
          }
          indexRoster(state.roster);
          // The one expensive step, and it happens once per run: work out what we already hold, so
          // every later decision is a set lookup. Resumability comes from *this* rather than from a
          // saved cursor — the cache is the record of what is done, so a run interrupted anywhere
          // resumes correctly even if the checkpoint was lost.
          held = await deps.heldTitles();
          mine = emptyCoverage();
          for (const shard of byShard.keys()) recheck(shard);
          log.debug(`harvest over ${state.roster.length} items; holding ${held.size}`);
          report();
          await run();
        } catch (e) {
          error = (e as Error).message;
          status = "idle";
          log.warn("harvest aborted:", error);
        } finally {
          running = null;
          report();
        }
      })();
      return progress();
    },

    stop() {
      // The loop reads `status` before each shard and each page, so flipping it here is the whole
      // mechanism — no cancellation token, and no request abandoned mid-flight. `stopping` rather
      // than `idle` because for up to one page that is the truth.
      if (status === "running") {
        status = "stopping";
        log.debug("harvest stopping");
      }
      return report();
    },
  };
}

/** Re-exported so the wiki client can build a coverage bitmap without a second import path. */
export { coverageOf, hasShard };
