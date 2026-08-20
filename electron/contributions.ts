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
 *   2. **A report replaces that contributor's set.** Everyone broadcasts their whole current tally,
 *      so adding would double-count everything they had already told us.
 *   3. **An empty report does not erase what they taught.** Un-sharing means "stop counting me from
 *      now on", not "unsay it" — the same rule
 *      [ADR 0056](../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md) applies to your
 *      own aged-out records, and the reason is identical: what a report *taught* is the expensive
 *      part and cannot be recovered from a log we never had. `seenAt` still moves, so a reader can
 *      always tell live pooling from a tally nobody has refreshed in a month, and
 *      `forget` is the deliberate, asked-for retraction.
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

export interface ContributionStore<T> {
  /** File a contributor's latest set, replacing whatever they told us before. */
  report(by: Contributor, items: unknown[]): void;
  /** Everyone's, newest report first. */
  all(): Contributed<T>[];
  /** Just the data, with each item's contributor already attached by `credit`. */
  pooled(): T[];
  /** Forget one contributor, or everybody. The only way anything leaves this store. */
  forget(id?: string): void;
  /** How many contributors, and how many items between them — for a status line. */
  size(): { contributors: number; items: number };
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
  /** Vet an untrusted payload: drop what is malformed or impossible, never repair it. */
  sanitize: (raw: unknown[]) => T[];
  /** Stamp each item with who said it, so provenance survives being pooled into a list. */
  credit: (item: T, by: Contributor) => T;
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
        data: opts.sanitize(entry.data).slice(0, opts.cap),
      };
    }
    return clean;
  }

  return {
    report(by, items) {
      if (!by?.id) return;
      const data = Array.isArray(items) ? opts.sanitize(items).slice(0, opts.cap) : [];
      const held = contributors[by.id];
      contributors[by.id] = {
        name: by.name,
        seenAt: new Date().toISOString(),
        // Rule 3: an empty report is a peer going quiet, not a retraction.
        data: data.length ? data : (held?.data ?? []),
      };
      log.debug("contribution filed", { by: by.id, name: by.name, items: contributors[by.id].data.length });
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
      saver.flush();
    },

    size() {
      const entries = Object.values(contributors);
      return { contributors: entries.length, items: entries.reduce((n, e) => n + e.data.length, 0) };
    },

    flush: () => saver.flush(),
  };
}
