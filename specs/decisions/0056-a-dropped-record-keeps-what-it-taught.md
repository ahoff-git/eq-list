# 0056: A dropped record keeps what it taught

## Status
Accepted

## Context
Three stores on disk are bounded, and the bounds were set by thinking about *file size* rather
than about what each store is for:

| store | cap | what it holds | measured on a real player |
| --- | --- | --- | --- |
| `combat-history.json` | 1000 fights | how a fight went | 668 fights, 1.6MB |
| `kill-log.json` | 5000 kills | what died, where, and what it dropped | 1,952 records, 703KB, after **two weeks** |
| `loot-log.json` | 2000 drops | what you looted and what it sold for | 460 drops over **two evenings** |

Those caps are not equivalent, because the records are not equivalent. A fight is a *record of an
event*: once it's gone, nothing else changes. The other two are the **evidence behind knowledge**
that is derived from them on demand — observed drop rates and roam areas from the kill log
([ADR 0024](./0024-mob-knowledge.md), `observeMobs`), vendor prices from the loot ledger
([ADR 0047](./0047-money-is-copper-in-two-ledgers.md), `prices()`).

Deriving rather than duplicating is the right call ([ADR 0016](./0016-combat-history-and-spell-analytics.md)),
and it has a consequence nobody costed: **evicting a record silently un-learns what it taught**.
At the measured rates the kill log fills in about five weeks and the loot ledger in about nine
days, after which a drop rate quietly loses its oldest denominators, a mob's roam area loses its
oldest positions, and a vendor price you learned last month can vanish entirely. Nothing warns;
the numbers simply drift.

## Decision
Keep the caps on *detail*, and make eviction lossless for *knowledge*.

- **The kill log retires a record into an observation before dropping it.** `retired:
  MobObservation[]` sits beside `kills` in the same file — one entry per mob-in-a-zone, however
  many times you've killed it — and `retire()` folds the outgoing records into it as the cap
  trims. `observations()` returns held records and retired ones added together; that, not
  `kills()`, is what mob knowledge derives from.
- **`sumObservations` (shared, pure) does the adding.** It's the arithmetic `mergeObservations`
  already used to pool across *people*, applied within one observer: kills and drops add, `lastAt`
  takes the later, and areas combine with the existing sample-weighted `mergeAreas` — so a spread
  covers both centres rather than shrinking towards one.
- **The loot ledger does the same for prices.** An evicted drop's sale is folded into `retired:
  ItemPrice[]` and `prices()` sums the retained totals with the sales still in the feed. A price
  is a property of the *item* (ADR 0047), so it must outlive the line that proved it.
- **The loot feed's cap goes from 2,000 to 20,000** — "many evenings" turned out to mean nine
  days. At ~270 bytes a drop that's a few MB at worst, and about three months at the measured rate.
- **A drop in the feed is keyed by its log line** (`at | item | source`, ADR 0033's shape), so a
  replayed gap after a crash can't file it twice. That mattered less when the feed was a rolling
  window; it matters now that a sale's price is kept forever.
- **Clearing asks a second question, and keeps the summaries by default.** `clear(scope)` takes
  `"records"` (the default: kill records and the loot feed go, and everything they taught is
  retired on the way out, so *nothing* is unlearned) or `"everything"`. The Settings control offers
  them as two differently-worded answers — **"Keep observations"** and **"Forget observations
  too"** — because the two are not the same size of mistake: records can be rebuilt by eating the
  logs again, months of observation cannot. It's an inline second step rather than a native
  confirm dialog, since a modal over an always-on-top window is a blackout of the game
  ([ADR 0052](./0052-an-error-goes-to-the-log-not-the-screen.md)).
- **Combat history stays lossy on purpose.** A fight is the one record here that teaches nothing
  beyond itself, so the 1000-fight cap keeps dropping the oldest — the explicit trade.

Rejected alternatives:
- **Raising the caps and moving on.** Buys months, not a fix: the same silent un-learning arrives
  later, and it grows the files by the full detail rather than by a summary.
- **Storing knowledge as the primary record** and keeping records only as a cache. That inverts
  ADR 0016 and puts the app's most valuable data one bug away from drifting from its evidence.
  Here the summary exists *only* for records already gone, so live records stay the single truth.
- **Unbounded stores.** The whole file is rewritten on a debounce; letting it grow without limit
  makes every write slower forever.

## Consequences
- Drop rates, roam areas and vendor prices are permanent. Only the *detail* ages out: the map's
  heatmap plots individual kill records, so the oldest pins disappear while the mob's approximate
  location — the thing the area summarises — stays.
- The retired summaries are tiny: on a real log, 151 mob-in-zone observations for 1,510 kills.
  A lifetime of play is kilobytes.
- A retired kill can't be re-examined, re-scored, or attributed to a new drop later. Retro-scoring
  a kill's confidence from a later `/loc` (an open item on the todo) can only reach records still
  held.
- Records already on disk carry no `retired` block; absent reads as empty, so nothing breaks and
  everything already stored is still counted from the records themselves.
- Two identical loot lines in the same second now collapse to one, which is ADR 0033's trade
  applied to the feed.
- There is no longer a one-click way to wipe observations, and that's the point. The only path is
  the second answer, which names what it destroys.
