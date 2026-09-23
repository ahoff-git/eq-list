# 0271: The Faction tab gets a Session view

## Status

Accepted

## Context

The user asked for a way to see, at a glance, what a faction hit total looked like just for tonight —
not the lifetime standing `FactionPanel`'s Standings view already folds to, which by design answers
"where do I stand" rather than "what changed just now."

`faction-log.ts` deliberately keeps every hit forever with nothing session-shaped about it — a faction
standing is a fact about the character, not a fact about one evening ([ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md)).
"Session" already means one specific thing elsewhere in the app: `CombatStats` is the one tracker every
other "session" reading (Combat, XP, Loot's coin/hour) is read off of, reset together by one button
([ADR 0019](./0019-parse-once-and-one-tracker.md) — "one tracker now owns all of
it, so both 'reset' buttons can only ever mean the same thing," `src/lib/api.ts`'s `resetSession`).
Nothing about the faction ledger participates in that tracker or that reset; a session-scoped faction
view has to ask a genuinely new question of the ledger — everything at or after `CombatStats.startedAt`
— rather than read a number that tracker already keeps.

Two shapes were available to answer it. `hitsPage`'s column filter already supports numeric comparison
operators, but only for its `number`-kind columns (`delta`) — `at` is a `text`-kind column, and
`filterItemSql`'s text branch only implements `contains`/`startsWith`/`equals` and their negations, not
`>=`. Widening that filter to a real date range would touch `FactionHitsGrid`'s own column-filter menu
(ADR 0260's allow-list), a UI surface built for narrowing a column by hand, not for a fixed programmatic
cutoff. The alternative — a dedicated query, mirroring `standings()`'s own SQL shape but scoped by
`WHERE at >= ?` — reuses the exact same fold (net summed, floor/ceiling counted apart, causes rolled up)
without touching the grid's filter contract at all.

## Decision

- **`electron/faction-log.ts`**: `FactionLog` gains `standingsSince(sinceIso: string): FactionStanding[]`,
  built the same way `computeStandings` is — its own pair of prepared statements
  (`selectStandingsSinceAgg`/`selectCausesSince`), both scoped by `WHERE at >= ?` — but reading only the
  live `faction_hits` table, with nothing `clear("records")` has frozen folded in on top. A freeze can
  only ever be older than any session that could be asking for one, so this isn't a gap, it's the
  correct answer for what a session is. The `net`/`raises`/`lowers` `COALESCE` guard `computeStandings`
  needed only in its outer, frozen-folding re-aggregation is needed directly here instead, since there's
  no outer step to carry it. `mergeCauseTallies`' cause-ordering comparator is pulled out as
  `byCauseImpact` so both functions share the one rule for "biggest `|net|` leads" rather than each
  re-stating it.
- **`faction:standingsSince`** (`ipc-channels.ts`/`ipc.ts`/`preload.ts`/`EqlApi.faction.standingsSince`,
  `src/lib/web-api.ts`'s stub): the same shape as `faction:standings`, minus the correction fold-in —
  `applyFactionCorrections` states a *lifetime* total, which a bounded window can't meaningfully offset,
  so the Session view reads uncorrected net.
- **`src/lib/hooks.ts`**: `useFactionStandingsSince(sinceIso, refreshKey)` mirrors `useFactionStandings`
  exactly, with `sinceIso` in its own dependency list so a session reset (a new `CombatStats.startedAt`)
  re-reads immediately rather than waiting on the next hit.
- **`FactionPanel.tsx`**: a fourth segmented view, Session, reusing `StandingTable` rather than a second
  copy of its columns — `useCombatStats().startedAt` is the cutoff, matching every other "session" label
  in the app. Its own stat-tile row above the table gives the top-line numbers (factions touched, hits
  raised/lowered/capped) before the per-faction detail; "Raised"/"Lowered" are hit counts, the same
  meaning those words already carry as the table's own column headers, not a net total blended across
  factions that share no common scale. `StandingTable` gains three new props — `drillDown` (default
  `true`), `emptyTitle`, `emptyHint` — so the Session view can turn its row's click-to-open breakdown
  off: `hitsPage` has no per-session *hit* query (only per-faction, via `FactionHitsGrid`'s existing
  `faction` prop), so opening one from a Session row would show that faction's whole lifetime of hits
  under a "this session" heading — a lie by omission — rather than the honest "nothing further to show."
  A "Reset session" button on this view calls the same `resetSession()` Combat and Session already
  expose, since it clears the same one tracker (ADR 0019).

## Consequences

- "What changed tonight" is answerable per faction, without reaching for the lifetime Standings view and
  mentally subtracting whatever it already showed last time you looked.
- The Session view's likely-cause column is still session-scoped and correct (`standingsSince` computes
  its own `causes` from the same windowed rows), even though its row no longer opens a further
  breakdown — the summary line was already the complete, correctly-scoped answer; only the *deeper* view
  was the part with no honest scoping to offer.
- A faction touched only before the current session began simply doesn't appear in the Session view at
  all — expected, not a bug: it hasn't changed *this* session.
- `standingsSince` intentionally diverges from `standings()` by excluding frozen data — the one existing
  test suite covering `faction-log.ts` now documents that difference directly (a `clear()` mid-session
  shows up in `standings()`'s net but not in `standingsSince()`'s), so a future change that tried to
  unify the two queries would have to consciously override an assertion, not silently drift past one.
