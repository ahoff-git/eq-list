# 0245: A camp's cost is its footprint, not its kill count

## Status

Accepted

## Context

Reported live: opening almost any item's page (selecting a search result is the common path in,
but any `ItemDrops`/`WikiPageView` render does the same thing) froze the whole app for seconds at a
time — "a huge lag spike."

Traced through `ItemDrops.tsx` → `useItemDrops` → `useAllMobs()` → `mobs.all()` →
`killLog.observations()` → `observeMobs` → `clusterAreas`. `clusterAreas` (`src/shared/mob-stats.ts`)
is a greedy agglomerative clustering pass: on every iteration it rescans every remaining cluster
pair to find the closest one, merges it, and repeats — O(n²) per merge, O(n) merges, so **cubic**
overall in how many points it's handed. Until now that was fine, because `observeMobs` handed it one
raw point per positioned kill, and `kill-log.ts`'s `MAX_KILLS` cap meant no single mob-in-a-zone could
ever accumulate more than a few thousand points *total across the whole ledger*, let alone at one
spot.

[ADR 0243](./0243-remove-the-remaining-storage-caps.md) removed that cap so a heatmap could show a
character's **whole** history at a heavily-farmed camp — which is exactly the scenario that now feeds
`clusterAreas` thousands of points **for one single spot** on every `observations()` read, since
nothing folds old detail away any more. Measured directly: 2,000 raw same-ish-position points took
**~23 seconds** to cluster; 4,000 didn't finish in two minutes. `observations()` runs synchronously
on Electron's single main process thread, so this wasn't a slow render — it froze IPC for every
window for as long as the clustering ran. ADR 0243's own Consequences flagged `observations()` as "not
measured to matter yet"; it matters.

## Decision

**Bucket positions to a coarse grid before they ever reach `clusterAreas`.** A new `bucketPoints`
(`mob-stats.ts`, called from `observeMobs`) groups raw points into `AREA_GRID_UNITS` (100, a sixth of
`LOCATION_CLUSTER_UNITS`) cells, computing each cell's own weighted centroid and exact spread
directly, before handing `clusterAreas` one point per *occupied cell* instead of one per kill.
`clusterAreas` itself is unchanged — this only shrinks what it's asked to chew through.

Why this doesn't lose or blur anything real: `AREA_GRID_UNITS` is well under the 600-unit merge
threshold, so two points sharing a bucket were always going to end up in the same final cluster
regardless — bucketing never changes a clustering *decision*, only how many inputs it takes to reach
one. A camp visited from nearly the same coordinates thousands of times collapses to however many
100-unit patches its own footprint actually covers — a small, roughly constant number for a tight
farming spot, however many kills happened there — while a genuinely sprawling or multi-camp mob still
gets every real distinct area it earned. `samples` is conserved exactly (a bucket's sample count is
its point count; `clusterAreas`'s own merge math already sums these); `spread` is computed as the true
farthest point from a bucket's own centroid, which for same-bucket points is a *tighter* bound than
the recursive triangle-inequality accumulation the old one-point-at-a-time path would have built —
never looser, so a roam marker's radius never shrinks by pretending less spread exists than the
positions actually show.

Verified directly: the 2,000-point case that took ~23 seconds unbucketed now takes ~1ms; 100,000
points at one exact spot takes 53ms. A realistic two-camp scenario (5,000 kills spread over a real
300-unit footprint, plus 500 at a second camp 2,000 units away) still separates correctly in 5ms.

## Consequences

- Opening an item's page — search, the wiki, anywhere `ItemDrops` renders — no longer risks a
  multi-second-to-multi-minute freeze once a character has a genuinely popular farming spot, which
  the SQLite migration's whole premise (ADR 0232/0243) is that it lets happen.
- `sumObservations`/`mergeObservations`'s own `clusterAreas` calls were not touched: their inputs are
  already-clustered `MobArea[]` lists (a handful of areas per mob-zone, never raw per-kill points), so
  they were never at risk from kill count the way `observeMobs`'s raw point accumulation was.
- `combat-history.ts`'s `zones()`/`bests()`/`sessions()` — flagged in ADR 0243 as remaining full scans
  over now-uncapped data — don't share this specific risk: their per-fight arithmetic is a flat sum,
  not a recursive geometric merge, so nothing there scales worse than linear in fight count. This ADR
  doesn't change that assessment, only closes the one spot that turned out to be cubic.
- Two new regression tests (`electron/tests/mob-stats.test.ts`) pin this down directly: one asserts a
  generous wall-clock ceiling for a 5,000-kill single camp (milliseconds in practice; the un-bucketed
  path couldn't clear it at all at less than half that size), the other asserts two real, heavily-
  farmed camps stay distinct and fully sample-accounted-for rather than being blended or truncated.
