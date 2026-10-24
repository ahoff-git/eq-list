/**
 * contributions.ts — the disk half of "somebody else told us this", once, for every kind of thing
 * they can tell us.
 *
 * Two stores now hold other people's data — pooled mob observations and shared kill positions — and
 * they want exactly the same five rules. Writing those rules twice would be the usual duplication
 * problem with an unusually sharp edge: they are the rules that decide *whose data is whose*, and a
 * pair that drifted would mean one store crediting a peer the other had already forgotten.
 *
 *   1. **Keyed by contributor id, never by name.** See `contributors.ts` for why a name cannot be a
 *      key. The name rides along as a label and is refreshed on every report.
 *   2. **A report replaces that contributor's set — when it comes from them.** Everyone sends their
 *      whole current tally, so adding would double-count everything they had already told us. A
 *      **relayed** report (somebody else handing on what that contributor once taught them) is a
 *      copy of unknown age, though, and must never undo a fresher one. So it is **merged**, row by
 *      row, by the store's `identity`, and can only add or freshen (`mergeRelayed`, ADR 0336).
 *   3. **An empty report does not erase what they taught.** Un-sharing means "stop counting me from
 *      now on", not "unsay it" — the same rule
 *      [ADR 0056](../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md) applies to your
 *      own aged-out records, and the reason is identical: what a report *taught* is the expensive
 *      part and cannot be recovered from a log we never had. `seenAt` still moves, so a reader can
 *      always tell live pooling from a tally nobody has refreshed in a month, and
 *      `forget` is the deliberate, asked-for retraction — and so, at the single-row grain, is
 *      `removeItem`: the admin panel's own correction, not a path a peer's report can reach.
 *   4. **Untrusted on arrival.** Every payload passes the caller's `sanitize` before it is stored:
 *      the shape is checked, and so is whether the numbers are *possible* — an implausible
 *      observation is discarded rather than clamped, per `estimates.ts` rule 2.
 *   5. **Bounded per contributor**, so one chatty client can't crowd out everyone else, and one
 *      hostile one can't fill the disk.
 */
import { createLogger } from "../src/shared/logging";
import type { Contribution, Contributions, Contributor } from "../src/shared/contributors";
import { contributorName } from "../src/shared/contributors";
import { createSaver, readJson, type Saver } from "./json-store";

const log = createLogger("contributions");

/** Reports arrive whenever a peer's tally changes; coalesce the writes. */
const WRITE_DEBOUNCE_MS = 4000;

/** One contributor's data, ready to read: who they are, when they last spoke, what they said. */
export interface Contributed<T> {
  by: Contributor;
  seenAt: string;
  data: T[];
}

/** How a report reached us. */
export interface ReportHow {
  /** Handed on by someone other than `by` (ADR 0242): merged, never replacing (rule 2). */
  relayed?: boolean;
}

/**
 * What makes two rows of one contributor's set **the same row**, possibly at different ages.
 *
 * `key` names the question a row answers (a mob in a zone, a faction cause), never its origin, since
 * everything in one contributor's set shares that. `weight` is how much evidence the row carries
 * (kills, hits, samples). Of two versions, the heavier is the newer, because a tally only grows.
 * A store with no `weight` holds **repeatable** rows (a kill position: many kills share one /loc fix),
 * and is merged as a multiset: the larger count of a row wins, so a stale copy can't thin a pile out.
 */
export interface RowIdentity<T> {
  key: (item: T) => string;
  weight?: (item: T) => number;
}

/**
 * Fold a relayed copy of a contributor's set into what we already hold, losing nothing from either.
 *
 * Rows only `held` stay; rows only `incoming` are added; a row in both keeps its heavier version (or,
 * for repeatable rows, its larger count). Held order first, then what is new, so the cap trims the
 * newest arrivals rather than what was already trusted.
 */
export function mergeRelayed<T>(held: readonly T[], incoming: readonly T[], identity: RowIdentity<T>): T[] {
  const groups = new Map<string, { held: T[]; incoming: T[] }>();
  const group = (key: string) => {
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { held: [], incoming: [] }));
    return g;
  };
  for (const item of held) group(identity.key(item)).held.push(item);
  for (const item of incoming) group(identity.key(item)).incoming.push(item);
  const out: T[] = [];
  for (const g of groups.values()) {
    if (identity.weight) {
      const heaviest = (rows: T[]) => rows.reduce<T | undefined>((a, b) => (!a || identity.weight!(b) > identity.weight!(a) ? b : a), undefined);
      const h = heaviest(g.held);
      const i = heaviest(g.incoming);
      // A tie keeps what we hold: same evidence, and no reason to churn the row.
      const pick = !h ? i : !i ? h : identity.weight(i) > identity.weight(h) ? i : h;
      if (pick) out.push(pick);
    } else {
      out.push(...(g.incoming.length > g.held.length ? g.incoming : g.held));
    }
  }
  return out;
}

export interface ContributionStore<T> {
  /** File a contributor's latest set: replacing what they told us before, or merged if relayed (rule 2). */
  report(by: Contributor, items: unknown[], how?: ReportHow): void;
  /** Everyone's, newest report first. */
  all(): Contributed<T>[];
  /** Just the data, with each item's contributor already attached by `credit`. */
  pooled(): T[];
  /** Forget one contributor, or everybody. */
  forget(id?: string): void;
  /** Remove one item from one contributor's data, by the position `pooled()`/`all()` stamped it with
   *  (the admin panel's `__row`). Unlike `forget`, the contributor keeps everything else they told us —
   *  this corrects a single bad row, not a retraction. Together with `forget`, the only ways anything
   *  leaves this store. */
  removeItem(contributorId: string, row: number): void;
  /** How many contributors, and how many items between them — for a status line. */
  size(): { contributors: number; items: number };
  /**
   * A counter that moves whenever a `report`/`forget`/`removeItem` changes what `pooled()` would
   * answer — cheap enough to check on a tick without reading the store, the same contract
   * `ShareSource.version` states. Meant to be **added** to another such counter (a kill log's, say)
   * rather than compared alone: two monotonically-non-decreasing counters can only sum to something
   * new when at least one of them moved, so combining them this way never misses a change.
   */
  version(): number;
  flush(): void;
}

export interface ContributionOptions<T> {
  /** Absolute path of the JSON file. */
  file: string;
  /** What this holds, for the write log. */
  what: string;
  /** Which `DATA_CONCERNS` entry stamps it. */
  concern: string;
  /** Most items to keep per contributor. */
  cap: number;
  /**
   * Vet an untrusted payload: drop what is malformed or impossible, never repair it.
   *
   * `trustAdmin` is true only when this is *our own* file being re-read back off disk, never for a
   * report a peer just sent — see the `__admin` pass-through rule (`isAdminAudit`, `src/shared/admin.ts`)
   * this exists for. A peer's live payload can look exactly like our own saved shape, and without this
   * flag a sanitizer has no way to tell "reloading an edit we made" from "a peer claiming they're us".
   */
  sanitize: (raw: unknown[], trustAdmin: boolean) => T[];
  /** Stamp each item with who said it, so provenance survives being pooled into a list. */
  credit: (item: T, by: Contributor) => T;
  /** What makes two rows the same row, so a relayed report can be merged instead of replacing (rule 2). */
  identity?: RowIdentity<T>;
}

/**
 * A store of other people's data.
 *
 * The stored shape is `{ contributors: { [id]: {name, seenAt, data} } }`. Reading tolerates
 * anything: an absent or unreadable file is simply nothing pooled — this data is a bonus and must
 * never be load-bearing enough to stop the app starting.
 */
export function createContributions<T>(opts: ContributionOptions<T>): ContributionStore<T> {
  let contributors: Contributions<T> = read();
  const saver: Saver = createSaver(opts.file, opts.what, () => ({ contributors }), WRITE_DEBOUNCE_MS, {
    concern: opts.concern,
  });
  // Bumped by every write. Starts at zero every launch, which is fine: `measure()`'s own cache
  // (`peer-share-hub.ts`) is just as short-lived, so there is no earlier number for a fresh one to
  // disagree with.
  let rev = 0;

  function read(): Contributions<T> {
    const parsed = readJson<{ contributors?: Contributions<T> }>(opts.file, {});
    const stored = parsed.contributors;
    if (!stored || typeof stored !== "object") return {};
    // Re-vet on load as well as on arrival. The file was written by us, but it was written from
    // *their* payloads, possibly by an older build whose vetting was weaker than today's.
    const clean: Contributions<T> = {};
    for (const [id, entry] of Object.entries(stored)) {
      if (!entry || typeof entry !== "object" || !Array.isArray(entry.data)) continue;
      clean[id] = {
        name: contributorName(entry.name),
        seenAt: typeof entry.seenAt === "string" ? entry.seenAt : "",
        // Our own file, written by us — an `__admin` flag in it is a real edit surviving a restart.
        data: opts.sanitize(entry.data, true).slice(0, opts.cap),
      };
    }
    return clean;
  }

  return {
    report(by, items, how) {
      if (!by?.id) return;
      // A live report, fresh off the wire — an `__admin` flag in it is only ever a peer's own claim.
      const data = Array.isArray(items) ? opts.sanitize(items, false).slice(0, opts.cap) : [];
      const held = contributors[by.id];
      const relayed = !!how?.relayed && !!opts.identity && !!held;
      contributors[by.id] = {
        name: by.name,
        seenAt: new Date().toISOString(),
        // Rule 2: a relayed copy is merged, so it can't undo a fresher one. Rule 3: an empty report
        // is a peer going quiet, not a retraction.
        data: relayed
          ? mergeRelayed(held.data, data, opts.identity!).slice(0, opts.cap)
          : data.length
            ? data
            : (held?.data ?? []),
      };
      rev++;
      log.debug("contribution filed", { by: by.id, name: by.name, relayed, items: contributors[by.id].data.length });
      saver.save();
    },

    all() {
      return Object.entries(contributors)
        .map(([id, entry]): Contributed<T> => ({ by: { id, name: entry.name }, seenAt: entry.seenAt, data: entry.data }))
        .sort((a, b) => b.seenAt.localeCompare(a.seenAt));
    },

    pooled() {
      return Object.entries(contributors).flatMap(([id, entry]) =>
        entry.data.map((item) => opts.credit(item, { id, name: entry.name })),
      );
    },

    forget(id) {
      if (id === undefined) contributors = {};
      else delete contributors[id];
      rev++;
      saver.flush();
    },

    removeItem(contributorId, row) {
      const entry = contributors[contributorId];
      if (!entry || row < 0 || row >= entry.data.length) return;
      entry.data.splice(row, 1);
      rev++;
      saver.flush();
    },

    size() {
      const entries = Object.values(contributors);
      return { contributors: entries.length, items: entries.reduce((n, e) => n + e.data.length, 0) };
    },

    version: () => rev,

    flush: () => saver.flush(),
  };
}
