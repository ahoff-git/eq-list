/**
 * polite-queue.ts — **not crowding a stranger's server.**
 *
 * eqlwiki is the community's own wiki and expects this app's traffic. [Lucy](../../electron/lucy/)
 * is neither: it is a twenty-year-old volunteer-run database for a different game that has never
 * heard of us, and it is only ever asked about searches eqlwiki couldn't answer — i.e. the queries
 * a frustrated player retries. An unthrottled name search that fanned out over a results list would
 * be a dozen requests a keystroke, which is how a well-meaning client becomes an outage.
 *
 * So every request to a borrowed source goes through one of these, and it enforces two rules:
 *
 *   - **One at a time, with a gap.** Requests are serialized and no two *start* closer together
 *     than `minGapMs`, so a burst of work becomes a steady trickle rather than a spike. Slower than
 *     parallel, and that is the point — nothing here is on a path a person waits on without a
 *     spinner.
 *   - **The same question is asked once.** Two callers wanting the same key while it is in flight
 *     share the one answer. Two panels opening the same item, or a re-render mid-fetch, is a normal
 *     thing to happen and a silly reason to fetch twice.
 *
 * Note what this deliberately is *not*: a cache. A queue that remembered answers would keep a
 * failure forever and would have to grow a TTL, an eviction rule and a version — all of which the
 * caller's on-disk cache already has. This forgets a key the moment it settles.
 *
 * Pure but for the clock, which is injected, so the gap can be tested without waiting for it.
 */

export interface PoliteQueueOptions {
  /** Minimum milliseconds between the *starts* of two requests. */
  minGapMs: number;
  /** Injected so a test can run a queue at full speed. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface PoliteQueue {
  /**
   * Run `work` when it's this caller's turn. Two calls with the same `key` while the first is still
   * running share its result — including its rejection, since a failure they'd both have suffered is
   * still the same answer.
   */
  run<T>(key: string, work: () => Promise<T>): Promise<T>;
  /** Waiting plus in flight — for a log line that explains why something is taking a while. */
  readonly pending: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createPoliteQueue({ minGapMs, now = Date.now, sleep = realSleep }: PoliteQueueOptions): PoliteQueue {
  /** In-flight work by key, so the same question isn't asked twice at once. */
  const inFlight = new Map<string, Promise<unknown>>();
  /** Who currently owns each key — see the `claim` token in `run`. */
  const claims = new Map<string, object>();
  /** The chain every request links onto. Serializing *is* the throttle. */
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = -Infinity;
  let waiting = 0;

  async function turn<T>(work: () => Promise<T>): Promise<T> {
    const gap = minGapMs - (now() - lastStart);
    if (gap > 0) await sleep(gap);
    lastStart = now();
    return work();
  }

  function run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const shared = inFlight.get(key) as Promise<T> | undefined;
    if (shared) return shared;

    waiting++;
    // Cleaning up in a `finally` rather than a chained `.then` is the whole trick: it runs *before*
    // the caller's `await` resumes, so a caller that immediately asks the same question again gets a
    // fresh request rather than the corpse of the last one — and `pending` is already correct by the
    // time anyone downstream can read it.
    // A token rather than the promise itself, so the `finally` can tell "still mine" from "someone
    // asked again after I settled" without referring to a variable it is nested inside.
    const claim = {};
    claims.set(key, claim);
    const mine = (async () => {
      try {
        // Wait for the previous request whatever became of it: a rejection must not poison the chain.
        await tail.catch(() => undefined);
        return await turn(work);
      } finally {
        waiting--;
        if (claims.get(key) === claim) {
          claims.delete(key);
          inFlight.delete(key);
        }
      }
    })();
    tail = mine.catch(() => undefined);
    inFlight.set(key, mine);
    return mine;
  }

  return {
    run,
    get pending() {
      return waiting;
    },
  };
}
