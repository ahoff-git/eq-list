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
 * there is a reason to — a person asking, or the room holding pages we lack (ADR 0176), a page already held costs no request and no wait, a broken page is a row and not an ending,
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
  countShards,
  planShardStep,
  roomCoverage,
  roomShards,
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

/**
 * How old a roster may be before a run walks the categories again.
 *
 * This is the "periodically explore the wiki" interval, and it needs no timer of its own: a run
 * already starts on the button and on the room-fill tick, so the check happens whenever one begins
 * and the walk costs 194 listing requests — measured — against the crawl's twelve thousand pages.
 *
 * A week rather than the page TTL's fortnight, because the two answer different questions. A page
 * expiring means *this copy may be out of date*; a roster expiring means *we may not know an item
 * exists at all*, and not knowing is the failure that hides itself.
 */
export const ROSTER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** What a stopped run leaves behind, and what a resumed one picks up. */
export interface SavedHarvest {
  /** The roster as last walked, so a resume needn't re-walk the categories. */
  roster: string[];
  /**
   * When that walk happened, and the reason a page added to the wiki can ever reach us.
   *
   * Without it the roster was written once and believed for ever: `start()` took the saved roster
   * whenever there was one, so the only way to notice a new item was `restart`, which no button
   * passes. An install that filled its catalogue in March was still working from March's item list in
   * September ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)).
   *
   * Optional because a checkpoint written before this existed has no date — which reads as
   * "unknown, therefore stale", and re-walks once.
   */
  listedAt?: string;
  /** Pages fetched from the wiki, across runs. */
  fetched: number;
  /** Pages taken from peers, across runs — the number that says what the room saved us. */
  fromPeers: number;
  /** Titles the wiki wouldn't give us. Kept by name: a dozen broken pages is a thing to look at. */
  failed: string[];
  /**
   * The categories the last walk passed through.
   *
   * Kept so the **incremental** path can judge a newly created page by the same definition the walk
   * used — a page created straight into `Category:Fingers` is an item for exactly the reason the walk
   * would have found it there ([ADR 0181](../../specs/decisions/0181-the-wiki-says-what-changed.md)).
   * Without it, "is this new title ours?" would need a second rule, free to drift from the first.
   */
  categories?: string[];
  /**
   * Items the last walk (or a peer) told us about that we had never heard of.
   *
   * Kept because a discovery nobody can see is a feature nobody knows works: "680 items we had no
   * record of" is the whole answer to *is exploring the wiki worth doing*, and it is only knowable at
   * the moment the new roster meets the old one.
   */
  found?: number;
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
  /** Items the walk or a peer turned up that we had never heard of (ADR 0177). */
  found: number;
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
  /**
   * Every item title the wiki knows — the category **walk**, not a listing (ADR 0177).
   *
   * Takes the pace because the walk is itself a trickle of 194 listing requests and must honour the
   * same gap the crawl does, and a `note` because it is a phase long enough to look like a hang: at
   * the default pace it is three minutes before the first page, which reads as broken.
   *
   * Called once per run, not per page, and only when the saved roster is missing or a week old.
   *
   * `complete` is what stops one press of Stop freezing a half-walked item list for a week: only a
   * walk that reached the end of the graph is written down as this week's answer.
   */
  roster(gapMs: number, note: (what: string) => void): Promise<{ titles: string[]; complete: boolean; categories: string[] }>;
  /**
   * Bring what we hold up to date with what the wiki says it changed, before planning any work.
   *
   * Runs at the **start of every run**, where the roster walk runs only when the roster is stale:
   * an edit is news at any time, and nine requests buys a fortnight of it
   * ([ADR 0181](../../specs/decisions/0181-the-wiki-says-what-changed.md)). Returns how many pages
   * it invalidated or added, for the log. A failure here is not fatal — see the caller.
   */
  catchUp(note: (what: string) => void): Promise<number>;
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
  /**
   * Rebuild the candidate set — links from pages we hold that no roster names (ADR 0180). Called
   * once when the shard work runs out, not per candidate.
   */
  candidates?(): Promise<string[]>;
  /**
   * Fetch one candidate and say what it was. Records its own verdict; the harvester only paces it
   * and folds an `item` back into the roster.
   */
  probe?(title: string): Promise<"item" | "other" | "missing">;
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
  /**
   * Take titles a peer named into the roster, and say which of them were new.
   *
   * The counterpart to the walk: a peer answering a shard ask names the roster titles **it** has in
   * that shard, so one install's exploration reaches the room without anybody re-walking
   * ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)). What arrives
   * is a *title*, never a claim about the page — completeness stays self-assessed, so a title we
   * learn and do not hold simply makes its shard incomplete and gets fetched like any other gap.
   *
   * Safe while a run is going: the roster only ever grows, and `fetchShard` re-reads `byShard` for
   * each shard it takes.
   */
  learn(titles: readonly string[]): string[];
  /**
   * Is the roster old enough to be walked again?
   *
   * Asked by the room-fill tick, because a stale roster is a reason to start a run that no
   * *coverage* test can see: an install holding every page its roster names has no gaps, so the room
   * comparison says "nothing to do" and the weekly walk [ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)
   * relies on would never happen. That is the difference between a catalogue that grows with the
   * wiki and one frozen on the day it first filled.
   *
   * **No roster at all is not stale.** There is nothing to refresh, and a first walk happens because
   * a run started for some other reason — which keeps ADR 0176's "ignorance is not emptiness"
   * distinction in one place rather than two.
   */
  rosterExpired(): boolean;
}

const clampGap = (ms: number): number => Math.min(GAP_RANGE.max, Math.max(GAP_RANGE.min, Math.round(ms)));

function emptyRun(roster: string[], at: string): SavedHarvest {
  return { roster, listedAt: at, fetched: 0, fromPeers: 0, failed: [], startedAt: at, updatedAt: at };
}

export function createHarvester(deps: HarvestDeps): Harvester {
  let state: SavedHarvest | null = null;
  let status: HarvestStatus = "idle";
  let gapMs = DEFAULT_GAP_MS;
  let title: string | undefined;
  let from: "wiki" | "peer" | undefined;
  /** The candidate queue for this run, built when the shard work runs out. `null` = not built yet. */
  let probing: string[] | null = null;
  let probeAt = 0;
  /**
   * This run has no roster of its own and is taking one from the room (ADR 0181).
   *
   * Two things behave differently while it is set, and only while it is set: `present` comes from
   * what the room holds rather than from our roster, and `learnRoster` will seed an empty roster
   * instead of refusing to (ADR 0177's rule, which exists to stop that happening by accident).
   */
  let bootstrapping = false;
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

  /**
   * Is the saved roster old enough to be worth walking the categories for again?
   *
   * An unparseable or missing date reads as stale, which is the safe way round: the cost of being
   * wrong is ~100 listing requests, and the cost of the other mistake is never learning that an item
   * exists.
   */
  function rosterStale(saved: SavedHarvest): boolean {
    const at = saved.listedAt ? Date.parse(saved.listedAt) : NaN;
    return !Number.isFinite(at) || deps.now() - at >= ROSTER_TTL_MS;
  }

  /**
   * The roster after a fresh walk, given what we had.
   *
   * The walk is authoritative when it plausibly succeeded, so a page the wiki has genuinely deleted
   * stops being a title we retry for ever. But a walk that came back *shorter* than what we hold is
   * far more likely to be a truncated or half-failed crawl than eleven thousand deletions, and
   * shrinking the roster on it would quietly un-share shards the room depends on — so that case
   * keeps everything and adds whatever is new.
   */
  function rewalk(previous: readonly string[], walked: readonly string[]): string[] {
    if (walked.length >= previous.length) return [...walked];
    log.warn("category walk returned", walked.length, "against", previous.length, "held - keeping both");
    return [...new Set([...previous, ...walked])];
  }

  /** File one title into the shard map. The one place a title becomes a shard's business. */
  function indexTitle(title: string): void {
    const shard = shardOf(title);
    setShard(present, shard);
    const bucket = byShard.get(shard);
    if (bucket) bucket.push(title);
    else byShard.set(shard, [title]);
  }

  function indexRoster(roster: string[]): void {
    byShard = new Map();
    present = emptyCoverage();
    for (const t of roster) indexTitle(t);
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
      found: state?.found ?? 0,
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

  /**
   * Check one candidate, at the same pace as everything else.
   *
   * Returns whether it did something, so the loop can come back round: a run that is exploring is
   * still running, and one that has nothing left to check is genuinely done.
   *
   * The queue is built once per exhaustion rather than per candidate — it is a set subtraction over a
   * few thousand titles, and doing it per page would be the expensive half of a cheap operation.
   * A title that turns out to be an **item** is folded into the roster through the same `learn` a
   * peer's titles arrive by, so it is shared, sharded and re-fetched on its TTL exactly like any
   * other; anything else is remembered as checked and never asked about again.
   */
  async function exploreShape(): Promise<boolean> {
    if (!deps.candidates || !deps.probe) return false;
    if (!probing) {
      probing = await deps.candidates();
      probeAt = 0;
      if (probing.length) log.debug("shape:", probing.length, "candidates to check");
    }
    if (probeAt >= probing.length) return false;
    const next = probing[probeAt++];
    from = "wiki";
    title = next;
    report();
    const verdict = await deps.probe(next);
    if (verdict === "item") {
      // `learn` is the roster's one door, so a discovery is indistinguishable from a peer's title
      // once it is through it — which is what makes it travel, shard and expire without anything
      // else being taught about where it came from. It also counts into `found`, which is already
      // the number for "an item we had no record of" (ADR 0177).
      learnRoster([next]);
      log.debug("shape: discovered", next);
    }
    title = undefined;
    checkpoint();
    await deps.wait(gapMs);
    return true;
  }

  /**
   * Take titles into the roster and say which were new — the roster's one door.
   *
   * Named rather than only a method because two things come through it and they must not diverge: a
   * peer's shard titles (ADR 0177) and this install's own shape discoveries (ADR 0180). Once a title
   * is through, nothing downstream can tell which it was, which is exactly what makes a discovery
   * travel and expire like anything else.
   */
  function learnRoster(titles: readonly string[]): string[] {
      const current = state ?? deps.load();
      if (!current) return [];
      // ADR 0177 refuses to invent a roster out of a peer's message, because that would make
      // `hasRoster` true on an install that has never listed anything and ADR 0176 depends on telling
      // that ignorance apart from emptiness. A **bootstrap** is that same act done deliberately and
      // with its eyes open (ADR 0181): the run knows it has no roster, is asking for one, and leaves
      // `listedAt` unset so a real walk still happens later.
      if (!current.roster.length && !bootstrapping) return [];
      state = current;
      const known = new Set(current.roster);
      const fresh = titles.filter((t) => t && !known.has(t));
      if (!fresh.length) return [];
      current.roster.push(...fresh);
      // Only patch the shard index if there *is* one. Between launch and the first run it is empty,
      // and adding one title to it would leave `present` claiming the roster touches exactly one
      // shard — a far worse answer than "not built yet". A run rebuilds it from the roster anyway.
      if (byShard.size) {
        // Only the shards that actually changed are re-judged: a title we don't hold makes its shard
        // incomplete, which is precisely how it becomes work the planner will pick up.
        const touched = new Set<number>();
        for (const t of fresh) {
          indexTitle(t);
          touched.add(shardOf(t));
        }
        for (const shard of touched) recheck(shard);
      }
      current.found = (current.found ?? 0) + fresh.length;
      log.debug("learned", fresh.length, "roster titles from a peer");
      checkpoint();
      return fresh;
  }

  /**
   * Walk the category graph and make it the roster. `false` means the walk gave nothing.
   *
   * Named because it happens in two places and must behave identically in both: at the top of a run
   * whose roster is missing or a week old, and — after ADR 0181 — partway through a *bootstrap* whose
   * room turned out to have nothing to give.
   */
  async function walkRoster(saved: SavedHarvest | null): Promise<boolean> {
    const at = new Date(deps.now()).toISOString();
    const walk = await deps.roster(gapMs, (what) => {
      title = what;
      from = "wiki";
      report();
    });
    title = undefined;
    const roster = walk.titles;
    const categories = walk.categories;
    if (!roster.length) {
      // A run that silently "finished" instantly would look like success. This is the one
      // failure worth putting in front of somebody.
      error = "the wiki gave no item list — offline, or the category has moved";
      // A stale roster is still a roster. Refusing to run on it because *today's* walk failed
      // would turn a moment offline into an install that stops filling, so the old list is
      // kept and the next start tries the walk again.
      if (saved?.roster.length) state = saved;
      status = "idle";
      log.warn("harvest not started:", error);
      return false;
    }
    if (saved?.roster.length) {
      const known = new Set(saved.roster);
      state = {
        ...saved,
        roster: rewalk(saved.roster, roster),
        // A walk that was stopped or capped keeps the *old* date, so the next run tries
        // again rather than believing a short list for a week.
        listedAt: walk.complete ? at : saved.listedAt,
        categories,
        // Counted against the roster we *had*, not added to a running total: this says what
        // this walk turned up, which is the number worth showing after it.
        found: roster.filter((t) => !known.has(t)).length,
      };
    } else {
      state = { ...emptyRun(roster, at), categories };
      if (!walk.complete) delete state.listedAt;
    }
    // A walk partway through a run has to re-index: everything after this reads `byShard`.
    indexRoster(state.roster);
    // **And the exhaustion verdicts go with it.** "This shard cannot be completed" is a statement
    // about the titles a shard held at the time, and a walk has just changed them — most sharply
    // after a bootstrap, where every shard was judged against an empty roster and would otherwise
    // stay excluded from fetching for the rest of the run.
    exhausted.clear();
    for (const shard of byShard.keys()) recheck(shard);
    return true;
  }

  async function run(): Promise<void> {
    try {
      while (status === "running" && state) {
        // While bootstrapping, what *exists* is what the room says it holds: our own roster is empty
        // and would claim there is nothing to do (ADR 0181). Re-read each pass, because a peer
        // joining mid-run adds shards nobody had offered when it started.
        if (bootstrapping) present = roomShards(deps.peers());
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
          // **The room could not supply one, so crawl after all** (ADR 0181). Asking first is the
          // whole point, but a bootstrap that ends with an empty roster has produced nothing — the
          // peers were too old to send titles, dropped, or held nothing we could use — and finishing
          // there would leave a new install with no catalogue and no reason to try again. So the
          // walk we skipped happens now, in the same run, and the run carries on normally.
          if (bootstrapping && !state.roster.length) {
            log.debug("bootstrap: the room gave no roster - walking after all");
            bootstrapping = false;
            if (!(await walkRoster(null))) break;
            continue;
          }
          // The roster is satisfied. **Now** explore: the links on the zone and quest pages we hold
          // name pages the category walk can never reach, because the wiki never filed them as items
          // (ADR 0180). Deliberately last — known work first, and a guess at what might exist is
          // worth less than a page the roster says is missing.
          if (await exploreShape()) continue;
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

    rosterExpired() {
      const current = state ?? deps.load();
      return !!current?.roster.length && rosterStale(current);
    },

    learn: learnRoster,

    start(opts) {
      if (status === "running" || running) return progress();
      error = undefined;
      gapMs = clampGap(opts?.gapMs ?? DEFAULT_GAP_MS);
      status = "running";
      // A new run re-reads the shape: pages have been written since the last one, so the links they
      // point at — and therefore what is worth checking — have moved.
      probing = null;
      bootstrapping = false;
      running = (async () => {
        try {
          /**
           * What the wiki says it changed, before anything else — because it decides what counts as
           * held, and every later step is an answer to that question.
           *
           * Never fatal. A run that could not reach `recentchanges` still has a roster and a cache
           * and plenty to do; refusing to start would turn a cheap optimisation into a single point
           * of failure for the whole crawl.
           */
          try {
            const caught = await deps.catchUp((what) => {
              title = what;
              from = "wiki";
              report();
            });
            if (caught) log.debug("catch-up touched", caught, "pages");
          } catch (e) {
            log.warn("could not read recent changes:", (e as Error).message);
          }
          title = undefined;

          const saved = opts?.restart ? null : (state ?? deps.load());
          const at = new Date(deps.now()).toISOString();
          const room = deps.peers();
          if (saved?.roster.length && !rosterStale(saved)) {
            state = saved;
          } else if (!saved?.roster.length && room.some((p) => countShards(p.have) > 0)) {
            /**
             * **Nothing of our own, and a room that has done the work: ask before crawling**
             * ([ADR 0181](../../specs/decisions/0181-a-new-install-asks-before-it-crawls.md)).
             *
             * The walk is 194 requests and about three minutes before the first page, and every one
             * of them re-derives a list the room is already holding. So a first run with peers in it
             * skips the walk entirely and takes its roster off their shard answers, which arrive as
             * titles beside the pages (ADR 0177) — minutes of somebody else's already-paid-for work
             * instead of a fresh crawl of eqlwiki.
             *
             * `listedAt` is deliberately left unset, so this roster reads as *never walked*: the room
             * is a fast start, not a substitute for the wiki, and `rosterExpired` will bring us back
             * to walk it properly once the room has given what it can.
             */
            state = emptyRun([], at);
            delete state.listedAt;
            bootstrapping = true;
            log.debug("bootstrap: taking a roster from", room.length, "peer(s) rather than walking");
          } else {
            if (!(await walkRoster(saved))) return;
          }
          // Every branch above sets it; this is the compiler's assurance rather than a real case.
          if (!state) return;
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
