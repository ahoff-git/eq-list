# 0237: An empty SUM is SQL NULL, not zero — and a stable sort keeps a tie's read order

## Status

Accepted

## Context

A further differential-fuzzing pass — this time against `faction-log.ts` (the one migrated store
that hadn't yet been fed an identical randomized operation sequence side-by-side with its
pre-migration array-backed implementation) — found one real divergence, and two code-reading passes
following the same lead as [ADR 0236](./0236-a-cached-snapshot-goes-stale-a-live-reference-doesnt.md)
found two more. All three trace back to the same root shape: **the array-backed stores' iteration
order was implicit and always oldest-first (`push`-order); the SQL rewrite reads back whichever order
is convenient for its *other* caller, and three separate places downstream turned out to depend on
which one they actually got.**

**`standings()` returned `net: null`/`raises: null`/`lowers: null` for a faction touched only by
floor/ceiling hits.** `computeStandings()`'s SQL aggregates `SUM(delta)`, `SUM(delta >= 0)`,
`SUM(delta < 0)` over `faction_hits` grouped by faction. A floor/ceiling hit states no amount — its
`delta` column is `NULL` by design (ADR 0232's schema). SQLite's `SUM` correctly ignores `NULL`
inputs when *some* rows in the group have a real value, which is why the mixed case (some raised/
lowered hits alongside some floor/ceiling ones) already worked. But `SUM` over a group where *every*
row's `delta` is `NULL` — a faction whose entire recorded history is caps, never a single stated
raise or lower — itself returns SQL `NULL`, not `0`. The old array-backed fold always started a
standing at `net: raises: lowers: 0` (`blankStanding`) and only ever added to them, so this case
never existed there. Confirmed by differential fuzzing: a single floor or ceiling hit against a
faction with no other history produced `net: 0` in the old store and `net: null` in the new one.
`FactionStanding.net`'s own type is a plain `number` — nothing downstream expects `null` — and the
Standings table's own `renderCell` (`p.row.net > 0 ? ... : p.row.net`) renders a bare `null` as
nothing: a blank cell where "0" belongs.

**`kill-log.ts`'s `observations()` fed `clusterAreas` a different point order than the old array
ever did, and the greedy nearest-pair merge's tie-break is order-dependent.** `observeMobs` (called
from `observations()`) builds a `points` array per mob-in-a-zone in whatever order its input `kills`
arrives in, and clusters those points via `clusterAreas`'s greedy nearest-pair merge — which, on a
genuine distance tie between two candidate pairs, picks whichever pair its nested scan meets first,
and that depends on input order. The old array-backed store fed `observeMobs` from `kills`,
oldest-first (`push`-order, the order a JSON file's `kills` array naturally held it in). The SQL
store's `observations()` fed it from `selectAll.all()` — `ORDER BY rowid DESC`, newest-first, chosen
because that's what `kills()` (a different consumer of the same prepared statement) wants for display.
Reproduced by extracting `clusterAreas` into a standalone script and clustering 2,000 randomized
trials of realistic EQ-coordinate points both forward and reversed: 4 of 2,000 diverged, each by
roughly one EQ unit in the resulting roam-area centroid — the same set of kills, no new data, a
different reported "most likely spot," purely from which order the migration happened to read them in.

**`kill-log.ts`'s cap eviction could evict the kill that had just been recorded, in the same
`record()` call that recorded it.** `oldest(n)` sorts `selectAll.all()` — `rowid DESC`, newest-inserted
first — ascending by timestamp with `Array#sort`, which is *stable*: for kills sharing an identical
logged second (EQ's timestamp resolution is one second; any AoE pull or fast trash-clearing session
produces these routinely), the comparator returns `0` for every tied pair, and a stable sort preserves
the *input's* relative order through the tie — newest-inserted first, the exact opposite of "evict
this one first." The old array-backed store sorted `kills` straight from its own oldest-first array,
so a tie there kept its oldest-first relative order and always evicted correctly. Reproduced directly:
filling a fresh ledger to exactly `MAX_KILLS` with same-second kills, then recording one more — the
one just recorded was evicted in the same call that inserted it, and a `noteLoot` a moment later for
that corpse silently returned `false`, with the drop nowhere to attach. Differentially confirmed
against the real pre-migration store: old attaches the loot, new drops it.

## Decision

**`computeStandings()`'s outer aggregation wraps `net`/`raises`/`lowers` in `COALESCE(..., 0)`.**
`floors`/`ceilings` need no such guard: `SUM(direction = 'floor')`/`SUM(direction = 'ceiling')` are
always `0` or `1` per row, never `NULL`, so their `SUM` can never be empty-group `NULL` the way
`SUM(delta)` can. `selectLiveCauses`'s own `SUM(delta) as net` (the per-cause rollup) needed no
matching fix: it is *always* consumed through `mergeCauseTallies`'s `cur.net += c.net`, and JS's `+`
operator already coerces a `null` operand to `0` — confirmed by the same fuzz run, which never showed
a `null` cause tally even before this fix. Left as-is rather than "fixed" a second time in a place
that was never actually broken.

**Every place `kill-log.ts` feeds `observeMobs` reverses `selectAll.all()`'s rows first**, restoring
the old store's oldest-first feed order without touching `selectAll` itself (still `rowid DESC`, still
correct for `kills()`, its other caller). Three call sites needed it, not one: `observations()` (found
first, by differential fuzzing), the cap-eviction path in `record()` (via `oldest()`, below — it feeds
the evicted records to `retire()`, which also calls `observeMobs`), and `clear("records")`'s own
`retire()` call, which reads `selectAll.all()` directly rather than through `oldest()` and so needed
its own explicit `.reverse()`. `kills()` keeps reading newest-first everywhere; only the paths that
end up in `observeMobs` read the reversed copy.

**`kill-log.ts`'s `oldest(n)` reverses `selectAll.all()`'s rows before the stability-sensitive sort**,
for the identical reason — a stable sort's tie-break depends on the input's own relative order, and
the input needs to arrive oldest-first for that tie-break to still mean "evict the oldest-inserted of
a tied group," matching what a straight sort of the old array's own oldest-first order always did.

## Consequences

- A faction whose ledger holds only floor/ceiling hits now reports `net: 0`/`raises: 0`/`lowers: 0`,
  matching its pre-migration behavior and the Standings table's own rendering assumptions.
- A roam-area centroid computed from an unchanged kill history no longer depends on which order the
  SQL migration happened to read old records back in — order-sensitivity in `clusterAreas`'s own
  tie-breaking is a separate, pre-existing property of that algorithm (not introduced or fixed here),
  but which order it's fed is now, once again, chosen rather than incidental.
- A same-second kill recorded at the cap boundary is no longer at risk of being evicted by its own
  insertion — verified by a regression test that fills the ledger to `MAX_KILLS` with same-second
  kills, records one more, and confirms both that it survives and that a drop attaches to it a
  moment later.
- No regression test was added for the `clusterAreas` ordering fix specifically: reproducing a
  genuine distance tie deterministically (rather than via 2,000 random trials) would need hand-tuned
  floating-point coordinates tied tightly to `clusterAreas`'s own internals, and the real-world impact
  — roughly one EQ unit on a map, never surfaced as raw coordinates anywhere in the UI — doesn't
  justify a test that fragile. The fix is covered by reasoning, by the agent's independent empirical
  verification, and by the full suite continuing to pass with it in place.
- Any future SQL aggregate over a nullable column needs the same "what does an empty or all-NULL
  group return" check `COALESCE` answers here — `SUM` and `AVG` return `NULL` for one, `COUNT` and
  `SUM` of a boolean-style `0`/`1` expression never do.
- Any future `Array#sort` fed from a SQL read needs to ask which order its own tie-breaks need to
  fall back to when the sort key itself doesn't distinguish two rows — `sort`'s stability makes input
  order load-bearing the moment there's a tie, whether or not that was the intent.
