# 0283: A faction cause's pooled half gets built

## Status

Accepted

## Context

[ADR 0193](./0193-a-faction-alert-rides-the-existing-line-watch.md) shipped the faction-standing-change
alert and deliberately deferred two things: a structured `parseFactionChange` (unrelated to this ADR —
built out by ADR 0218 and the cause-guessing chain that follows it, ADR 0219–0261/0282), and a pooled
`FactionObservation` store "mirroring `mob-knowledge.ts`/`contributions.ts` exactly... so a *verified*
cause becomes shared evidence of what raises/lowers a faction, alongside (and able to contradict)
whatever the wiki's own faction page says." `specs/todo.md` held this open pending one thing: whether
`CORRELATION_WINDOW_SEC`/`DIALOGUE_MATCH_MIN_SCORE` were even trustworthy enough to be worth pooling.
[ADR 0281](./0281-three-seconds-and-point-five-were-already-right.md) measured both against 20,571 real
hits and found them sound. This ADR builds the pooled half.

**Both kill-caused and dialogue-caused hits are poolable, not kill-only.** A dialogue cause is a weaker
guess than a kill — `src/shared/faction-cause.ts`'s whole header is about how much weaker, and the
Faction tab already renders it "dim, italic and captioned as a guess rather than a fact" — but it is
still evidence, and excluding it would throw away exactly the harder-won half of ADR 0281's own finding
(this player's log had *zero* recorded dialogue causes before ADR 0282, not because the guess is bad but
because nothing survived to recheck). The provenance that already keeps a kill and a dialogue guess
visually apart in the Faction tab (`CauseGroup` renders them in separate, independently-openable groups)
has to survive pooling too, or a reader could no longer tell a stronger data point from a weaker one —
which would be a strictly worse outcome than not pooling dialogue causes at all.

## Decision

**A third consumer of `contributions.ts`'s generic `ContributionStore`, not a reimplementation.**
`electron/faction-observations.ts` is built exactly the way `electron/mob-knowledge.ts` is: an own
`sanitize` (shape plus plausibility — a faction delta can't exceed what its own hit count could
plausibly have produced, the same spirit as `mob-knowledge.ts`'s `KILLS_PLAUSIBLE`), a `report`/
`pooled`/`forgetPeers`/`version`/`flush`/`admin` surface, and the same five rules
(`contributions.ts`'s own header) applied unchanged.

**`FactionObservation`'s shape mirrors `FactionCauseTally` rather than inventing new field names for
the same facts**: `{ faction, kind, source, net, hits }`, plus `by`/`byId` once credited. `kind` is
`"kill" | "dialogue"`, carried through pooling and the merge below — never flattened into one
undifferentiated number, the same reason `FactionRecord.causedBy` itself is a tagged union.

**Your own share is derived, never stored — the same rule `mob-knowledge.ts` states for your own
kills.** `faction-log.ts`'s `standings()` already folds every resolved hit into a per-(faction, cause)
`causes` rollup, SQL-filtered to `caused_by_kind IS NOT NULL` — which is already this module's whole
"only pool a *settled* cause" rule, enforced at the query rather than restated. A hit still waiting on
nothing but an `unmatchedDialogue` guess (ADR 0282), or an uncorrelated floor/ceiling hit, never reaches
`causes`, so it's never reported and never pooled. `createFactionObservations(userDataDir, factionLog)`
reads `factionLog.standings()` for `mine()`; nothing new is written to disk for your own data.

**`src/shared/faction-observation.ts`** holds the pure shape and `mergeFactionObservations(mine,
pooled)`, which folds both into one `FactionCauseKnowledge` row per (faction, kind, source) — `net`,
`hits` summed, `myHits` kept apart (what provenance is judged against), and `contributors` deduped by
id. **`src/shared/faction-pooling.ts`** reuses `pooling.ts`'s `provenanceOf` (already generic over plain
numbers, not `MobKnowledge`-specific) and `faction-cause.ts`'s own `causeConfidence`/`causeConfidenceWhy`
(already generic over a `{ kind, hits }` tally) rather than reimplementing either — the only genuinely
new code is the fold between them, `factionPoolStanding`/`factionPoolWhy`.

**Peer transport: the exact same pipeline `mobs` already uses, extended, not a second one.** A new
`ShareKind` (`"factionObservations"`, family `"observation"`) is added to `src/shared/peer-share.ts`
(`SHARE_KINDS`, `MAX_ROWS`, a `readFactionObservation` reader, an origin-aware `rowKey` the same shape
`mobs`' own states). `peer-share-hub.ts`'s `shareSources` gets a `factionObservations` entry reading
`mine()` ++ `pooled()`, versioned by `factionLog.version()` (new — a cheap counter bumped on `add`/
`clear`/`recheckDialogueCauses`, mirroring `contributions.ts`'s own `version()` contract) plus
`factionObservations.version()`, the same sum `mobs` already does with `killLog.version()`. On the
receiving side, `electron/ipc.ts`'s `fileContribution` — the one place both the legacy broadcast style
and the newer ask/give pull both already funnel an `"observation"`-family kind through
(`peer-share-hub.ts`'s own `if (spec?.family === "observation") deps.fileContribution(...)`) — gets one
more branch: `AWARI_MSG.factionObservations` → `groupByOrigin` → `factionObservations.report`. No second
transport was built; this is the identical wire this app already uses for mobs/kills, carrying a third
kind.

**The UI: a minimal, real surface, not an unused export.** `src/shared/faction-sort.ts` gains
`pooledCauseBadge(faction, tally, knowledge)`, a pure lookup the Faction tab's `CauseGroup` rows call to
render a small "`+N peer hits`" note (hover-explained via `factionPoolWhy`) beside a cause that at least
one peer's own ledger has also reported — silent, with no badge at all, the moment nothing pooled
touches a row (the common case today, and not an error). `FactionPanel.tsx` reads the merged
`FactionCauseKnowledge[]` once per render via a new `useFactionCauseKnowledge` hook (mirroring
`useFactionStandings`'s own refresh wiring) and hands it down through `StandingTable` →
`CauseBreakdown` → `CauseGroup`. This is deliberately the same place the todo list already flagged
`mobs.contributors()`/`poolStanding`/`poolWhy` as wired end to end with nothing calling it for the mob
panel — this pass does not repeat that for faction.

## Consequences

- A new file, `faction-observations.json`, joins `mob-knowledge.json`/`peer-kills.json` as a third
  pooled-peer-data store, with its own `DATA_CONCERNS` entry (`peer-faction-observations`, remedy
  `unrecoverable` — the same reasoning as `peer-kills`: nothing here is ours to rebuild from a log).
- The Faction tab's Standings drill-down can now show a small amount of cross-install corroboration for
  a kill or conversation cause, without ever letting it look stronger than it is — a dialogue cause
  stays visually and structurally apart from a kill cause at every step, pooled or not.
- `FactionLog` gains a `version()` method (additive) so its own already-resolved causes can be versioned
  into the share catalogue the same cheap way `killLog.version()` already is.
- The Peers tab gains one more toggle ("Faction-cause evidence") automatically — `PeersPanel.tsx`/
  `PeerTray.tsx` already iterate `SHARE_KINDS` generically, so nothing there needed hand-wiring.
- `specs/todo.md`'s faction-cause item's "pooled half ADR 0193 originally asked for is still open"
  paragraph is closed out.
