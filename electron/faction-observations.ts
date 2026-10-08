/**
 * faction-observations.ts — pooled evidence for what raises or lowers a faction: the *verified*
 * half of a faction hit's guessed cause (`src/shared/faction-cause.ts`), shared the way
 * `mob-knowledge.ts` shares a drop rate — the pooled half of [ADR 0193](../specs/decisions/0193-a-faction-alert-rides-the-existing-line-watch.md)
 * that waited on the kill window actually being measured ([ADR 0281](../specs/decisions/0281-three-seconds-and-point-five-were-already-right.md)),
 * and is built out properly in [ADR 0283](../specs/decisions/0283-a-faction-causes-pooled-half-gets-built.md).
 *
 * **Your own share is derived, never stored here** — the same rule `mob-knowledge.ts` states for
 * your own kills. `faction-log.ts`'s own `standings()` already folds every resolved hit into a
 * per-(faction, cause) `causes` rollup (`FactionCauseTally`), and that rollup is SQL-filtered to
 * `caused_by_kind IS NOT NULL` — which already is this module's whole "only pool a *settled* cause"
 * rule, just enforced at the query rather than restated here. A hit still waiting on nothing but an
 * `unmatchedDialogue` guess (ADR 0282), or a bare floor/ceiling hit with nothing correlated to it,
 * never has a `causedBy` at all, so it never reaches `causes` and never reaches `mine()` either.
 *
 * Peers' observations *are* stored here, keyed by contributor id and kept apart from yours — the
 * same five rules [contributions.ts](./contributions.ts)'s header states. What's left here is the
 * only part that's really about a faction cause: the vetting that decides whether a tally is
 * *possible* (`estimates.ts` rule 2) — a faction delta of 50,000 isn't, the same spirit as
 * `mob-knowledge.ts`'s `KILLS_PLAUSIBLE`.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { plausible } from "../src/shared/estimates";
import { mergeFactionObservations, type FactionCauseKnowledge, type FactionObservation } from "../src/shared/faction/faction-observation";
import { isAdminAudit, type AdminAudit } from "../src/shared/admin";
import type { Contributor } from "../src/shared/contributors";
import { createContributions } from "./contributions";
import { createArrayAdminStore, type AdminStore } from "./admin";
import type { FactionLog } from "./faction-log";

const log = createLogger("faction-observations");

/** Per contributor, so one chatty client can't crowd out everyone else — smaller than
 *  `mob-knowledge.ts`'s 2000, since this is one row per (faction, cause) a career ever produces,
 *  not one per mob+zone. */
const MAX_OBSERVATIONS_PER_PEER = 1000;

const isFinNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * No single logged faction adjustment has ever been seen anywhere near this large — a peer
 * claiming more just means a garbled report, not a bigger swing, the same reasoning
 * `mob-knowledge.ts`'s `KILLS_PLAUSIBLE` states for a kill count. Bounds `net` against `hits` rather
 * than against a fixed ceiling, since a tally summed over many hits can legitimately be large —
 * what can't happen is any *one* of those hits having swung the standing by more than this.
 */
const MAX_SINGLE_HIT = 100;

/** How many hits one contributor's tally for a single cause may claim — generous against a long
 *  career played on one install, small enough that a hostile peer can't use it to swamp a pool. */
const HITS_PLAUSIBLE = { min: 1, max: 1_000_000 };

/**
 * Keep only well-formed, *possible* faction-cause tallies from a peer — the two ways one can be
 * wrong, the same split `mob-knowledge.ts`'s own `sanitizeObservations` checks: a bad **shape**
 * (non-numeric `hits`/`net`) and an impossible **value** (`net` bigger than `hits` could ever have
 * produced). Both are checked here, the one point everything a peer sends passes through.
 *
 * `trustAdmin` carries the admin panel's own edit history forward the same way `sanitizeObservations`
 * does — true only when re-reading our own saved file, never for a report a peer just sent, so a
 * peer can't attach a shape-valid `__admin` to their own row and have it read, in our admin panel, as
 * a correction we ourselves made.
 */
export function sanitizeFactionObservations(input: unknown[], trustAdmin: boolean): FactionObservation[] {
  const out: FactionObservation[] = [];
  for (const o of input) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    if (typeof r.faction !== "string" || !r.faction.trim()) continue;
    if (r.kind !== "kill" && r.kind !== "dialogue") continue;
    if (typeof r.source !== "string" || !r.source.trim()) continue;
    if (!isFinNum(r.hits) || !plausible(r.hits, HITS_PLAUSIBLE)) continue;
    const hits = Math.round(r.hits);
    if (!isFinNum(r.net) || !plausible(Math.abs(r.net), { min: 0, max: hits * MAX_SINGLE_HIT })) continue;
    const clean: FactionObservation = { faction: r.faction, kind: r.kind, source: r.source, net: r.net, hits };
    if (trustAdmin && isAdminAudit(r.__admin)) (clean as FactionObservation & { __admin?: AdminAudit }).__admin = r.__admin;
    out.push(clean);
  }
  return out;
}

export interface FactionObservationsStore {
  /** Your own tallies, derived fresh from the ledger every time — see the module header. */
  mine(): FactionObservation[];
  /** Everyone's, flat and credited — the shape a `give` sends, not a merged verdict. */
  pooled(): FactionObservation[];
  /** Yours folded with every peer's, one row per (faction, kind, source) — what the UI reads. */
  knowledge(): FactionCauseKnowledge[];
  /** File a contributor's latest tallies, replacing whatever they told us before. */
  report(by: Contributor, observations: unknown[]): void;
  /** Forget one contributor's contributions, or everybody's. Your own are derived and unaffected. */
  forgetPeers(id?: string): void;
  /** Moves whenever a peer's report would change what `pooled()` answers (`ShareSource.version`). */
  version(): number;
  flush(): void;
  /** The hidden admin panel's view of what *peers* have told us. */
  admin: AdminStore;
}

export function createFactionObservations(
  userDataDir: string,
  factionLog: Pick<FactionLog, "standings">,
): FactionObservationsStore {
  const store = createContributions<FactionObservation>({
    file: path.join(userDataDir, "faction-observations.json"),
    what: "faction-cause observations",
    concern: "peer-faction-observations",
    cap: MAX_OBSERVATIONS_PER_PEER,
    sanitize: sanitizeFactionObservations,
    // Stamped on the way out, same as `mob-knowledge.ts`'s `credit` — the id is the key the row is
    // filed under, so storing it inside the row too would just be a second copy free to drift.
    credit: (obs, by) => ({ ...obs, by: by.name, byId: by.id }),
  });

  const mine = (): FactionObservation[] =>
    factionLog
      .standings()
      .flatMap((s) => s.causes.map((c): FactionObservation => ({ faction: s.faction, kind: c.kind, source: c.source, net: c.net, hits: c.hits })));

  return {
    mine,

    pooled: () => store.pooled(),

    knowledge: () => mergeFactionObservations(mine(), store.pooled()),

    report(by, observations) {
      store.report(by, observations);
      log.debug("peer faction observations filed", { by: by.id, name: by.name });
    },

    forgetPeers: (id) => store.forget(id),

    version: () => store.version(),

    flush: () => store.flush(),

    // Same reasoning as `mob-knowledge.ts`'s admin view: no per-item key exists here either, since a
    // report replaces a contributor's whole array (contributions.ts's rule 2) — `__row` is a position
    // within that array, decorated on read only so the panel has something to address a row by.
    admin: createArrayAdminStore(
      "Pooled faction-cause observations",
      () =>
        store.all().flatMap(({ by, data }) =>
          data.map((o, row) => Object.assign(o, { contributorId: by.id, contributorName: by.name, __row: row })),
        ),
      {
        idOf: (o) => `${o.contributorId}:${o.__row}`,
        summaryOf: (o) => `${o.faction} — ${o.kind} ${o.source} (${o.net >= 0 ? "+" : ""}${o.net} over ${o.hits}, from ${o.contributorName})`,
        editable: ["faction", "kind", "source", "net", "hits"],
        remove: (o) => store.removeItem(o.contributorId, o.__row),
        save: () => store.flush(),
      },
    ),
  };
}
