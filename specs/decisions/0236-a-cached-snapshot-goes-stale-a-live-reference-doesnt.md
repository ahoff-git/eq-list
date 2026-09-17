# 0236: A cached snapshot goes stale; a live reference doesn't

## Status

Accepted

## Context

A further pass exercising the ADR 0232 migration — differential fuzzing of each rewritten store
against its actual pre-migration array-backed implementation, both fed identical randomized operation
sequences and diffed on every read, plus an adversarial review of the remaining SQL — turned up five
more real divergences.

**`loot-log.ts`'s `items()` sorted by SQL collation instead of locale.** `selectItems`'s
`ORDER BY count DESC, item ASC` relies on SQLite's default `BINARY` collation for the tie-break, which
sorts byte-for-byte: every upper-case letter sorts before every lower-case one. EQ item names mix
articled drops ("a Bone Chip") with proper nouns ("Zebra Fang") constantly, and most items are looted
exactly once — so this tie-break is exercised on nearly every real ledger, and it disagreed with the
old array-backed code's locale-aware `Array#sort`/`localeCompare` tie-break. Confirmed empirically:
SQLite sorted `["Bat Wing", "Zebra Fang", "a Bone Chip", "an Iron Sword"]`; `localeCompare` sorted
`["a Bone Chip", "an Iron Sword", "Bat Wing", "Zebra Fang"]`.

**`combat-history.ts`'s `rederive` could throw `UNIQUE constraint failed`, discarding an entire batch.**
EQ's own log timestamp is one-second resolution, so two genuinely different, very short fights in the
same file can legitimately share a `(file, startedAt, endedAt)` signature — `combat_fights.key`'s own
identity. A plain `derived.map(...)` let two such entries both try to insert under the same key; the
second threw from *inside* `rederive`'s own transaction, rolling back every other, unrelated fight the
same batch was about to correctly refresh. Reproduced with a differential fuzzer feeding the SQL and
array-backed stores identical randomized `add`/`rederive` sequences — the crash was reliably
reachable within a few dozen random steps. A secondary form of the same root cause: if two colliding
derived fights both matched the same already-stored `prior`, both entries in `next` carried that
prior's `id`, silently inflating the `refreshed`/`matched` outcome counters even once the crash itself
was guarded against.

**`combat-history.ts`'s admin store never re-stamps the file.** `createArrayAdminStore`'s `save`
parameter is mandatory, so the old array-backed admin called `scheduleWrite` on every `patch`/`remove`
— matching the module's own doc, "rewritten... on every mutation exactly as before." The new
`createSqlAdminStore`'s `onChanged` is optional, and this store's own call left it out; the other three
stores all wire one (`faction-log.ts`/`loot-log.ts`: `onChanged: () => saver.save()`; `kill-log.ts`:
`onChanged: bump`, which also saves). An admin-only edit or delete with no other combat activity in the
session silently never touched the provenance stamp.

**`kill-log.ts`'s cap eviction lost its "unparseable timestamp evicts first" rule.** The old `oldest(n)`
explicitly mapped an unparseable `at` to `Number.MIN_SAFE_INTEGER` before sorting — "it can't be placed
in time at all, so it is the least useful thing here to keep." The rewrite's `ORDER BY at ASC LIMIT ?`
relies on SQLite's plain `BINARY` text collation instead: a garbled string like `"not-a-real-date"`
sorts *after* every real `"2026-…"` timestamp (`'n' > '2'`), so it would be evicted **last**, not
first — the opposite of the old rule. Only reachable via a legacy JSON migration (`record()`'s live
path already refuses to insert an unparseable `at`), but confirmed by reproduction: a legacy file with
one such kill among otherwise-valid ones, pushed past the cap, kept the unparseable one and evicted a
genuinely older valid one instead.

**`kill-log.ts`'s `noteCoin` fast path read a stale snapshot of `mine`, not the row.** The old
`lastLooted = { kill, at }` held a live reference to the actual `KillRecord` object in the array — an
admin edit to `kill.mine` (which mutates that same object in place) was visible immediately. The
rewrite's `lastLooted = { killId, mine: tri(row.mine), at }` captured `mine` as a value at attach time;
`noteCoin`'s gating check read that cached copy, while the row it actually credits coin to (fetched via
`selectById.get(lastLooted.killId)` right afterward) was always fresh. An admin correction to `mine`
landing inside the `COIN_FOLLOWS_LOOT_MS` window between a drop attaching and its coin line would be
invisible to the gate, even though the very next line fetches the row it's gating fresh anyway.

Four of these five are instances of one shape: **the array-backed stores got a behavior for free, by
holding a live object reference or letting `Array#sort` default to locale-aware comparison, that the
SQL rewrite had to state explicitly and, in these four places, didn't.**

## Decision

**`loot-log.ts`'s `selectItems` drops `ORDER BY item`**; the tie-break moves into `items()` itself as
a JS `.sort((a, b) => b.count - a.count || a.item.localeCompare(b.item))`, restoring the locale-aware
comparison.

**`combat-history.ts`'s `rederive` deduplicates `derived` by key before building `next`.** A
`keysThisBatch` `Set`, checked and filled as the loop runs, keeps a second colliding entry from ever
reaching `insertFight` or claiming a `prior` match — "first one wins," the same rule a key collision
gets everywhere else in this app. `insertFight` itself also gains `OR IGNORE`, as defense in depth: it
was never actually enforced unique in the old array-backed store (nothing stopped two array entries
sharing one), so silently dropping a second same-keyed row rather than crashing the whole batch is the
closer match to old behavior, not a new kind of data loss.

**`combat-history.ts`'s `createSqlAdminStore` call gains `onChanged: () => saver.save()`**, matching
the other three stores.

**`kill-log.ts` regains a JS-side `oldest(n)` helper**, identical in spirit to the one it's named
after: `selectAll.all()`, sorted with the same `Date.parse`-or-`MIN_SAFE_INTEGER` comparator, sliced to
`n`. `kill_records` is capped at `MAX_KILLS`, so this costs no more than the in-memory array's own sort
did. The plain-SQL `selectOldest` it replaces is removed rather than kept as dead code.

**`kill-log.ts`'s `lastLooted` drops `mine` entirely.** `noteCoin`'s fast-path gate now checks the
freshly-fetched row's `mine` column directly, in the same place it already re-fetches that row to
credit the coin — one read doing both jobs, rather than a cached copy of the answer to half of it.

## Consequences

- The Loot tab's item list sorts alphabetically among ties again, matching every other alphabetized
  list in the app.
- An unattended re-read (ADR 0129) of a log whose fights include a same-second collision no longer
  loses an entire batch's worth of otherwise-correct refreshes to one thrown exception; the colliding
  pair resolves to one row instead of crashing or silently duplicating outcome counts.
- Editing a fight through the hidden admin panel with no other combat-history activity that session
  now correctly re-stamps `combat-history.json`'s provenance, same as the other three stores always
  did.
- A legacy `kill-log.json` carrying a kill whose timestamp never parsed is evicted before any genuinely
  placeable kill, once the log grows past `MAX_KILLS` — restoring the old rule rather than inverting it.
- `noteCoin`'s "corpse you were just looting" fast path now agrees with an admin correction made to
  `mine` in the seconds between a drop and its coin line, rather than trusting whatever `mine` said at
  attach time.
- Four of five are narrow-window, high-volume, or migration-only edge cases, not everyday-play
  regressions most players would ever notice — found by fuzzing realistic-but-uncommon sequences and
  scale rather than by a report of wrong numbers in the wild. They're fixed here on the same footing as
  [ADR 0235](./0235-a-migrated-ledgers-permanent-keys-migrate-too.md)'s findings: real, demonstrable
  divergences from a store's own prior behavior, regardless of how often a real session hits them.
