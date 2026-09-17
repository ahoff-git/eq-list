# 0239: A store with no cap needs a cheap count

## Status

Accepted

## Context

A fourth round of hunting — explicitly briefed to find genuinely new angles after three rounds had
mined old-vs-new divergence, SQL NULL/collation issues, and contract violations — found one real,
severe, and empirically verified issue in the hidden admin panel.

[ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md)'s whole point for `faction-log.ts`
and `loot-log.ts` is that they are now **uncapped** — "the ledger keeps every hit forever," replacing
the old `MAX_FACTION = 5_000`/`MAX_LOOT = 20_000` array bounds. `electron/admin.ts`'s
`createAdminRegistry.stores()` was never updated to match: it calls `store.list()` — a full
`SELECT *`, mapped through `toRecord` (JSON-parsing the audit column, building the summary string,
typing every field) for every row — on **every** registered store, just to report a row count and an
edited count. That was fine when every store was array-backed and cap-bounded; it was never revisited
when two of the four lost their cap.

`stores()` isn't called only when a person opens the admin panel. `src/app/admin/page.tsx` also calls
it inside `app.onDataChanged`'s handler — which fires on every kill, every faction hit, every drop
logged anywhere in the app — for as long as the admin window happens to be open, even in the
background. `createAdminRegistry.search(term)`, used by the panel's cross-store search box, does the
same full scan **per store, per search** across all eight registered stores.

Reproduced against a 300,000-row `faction_hits` table — a few years of a busy character's faction
hits, exactly the scale ADR 0232 says the design now supports — using the real `list()`/`summaryOf`/
`auditOf` code paths: `list()` took 646ms, `stores()`'s per-store work took 636ms, one store's
`search()` scan took 791ms. Since `better-sqlite3` is synchronous and Electron's IPC handlers run on
the single main-process thread, any one of these blocks **every window's IPC**, not just the admin
one — simply leaving the admin panel open during normal play could freeze the whole app for a second
or more on an ordinary kill or faction hit, once a ledger has genuinely grown the way the migration
was built to let it.

## Decision

**`AdminStore` gains an optional `counts(): { total: number; edited: number }`.** `createAdminRegistry
.stores()` calls it when a store provides one, and only falls back to the `list()`-and-filter shape
for a store that doesn't — array-backed stores (`high-scores.ts`, `peer-kills.ts`, `mob-knowledge.ts`,
`spawn-timers.ts`) are unaffected: their `list()` was already a cheap in-memory read, and every one of
them is still cap-bounded, so there's nothing to gain by giving them a `counts()` of their own.

**All four SQL-backed stores implement it**, each with one more `COUNT(*)` prepared statement
alongside the ones they already had (`countHits`/`countKills`/`countFights` for totals; a new
`WHERE adminAudit IS NOT NULL` variant for the edited count — `foldAdminEdit` always sets
`edited: true` the moment an audit exists at all, so a non-null audit column *is* "edited"). Applied
uniformly to `kill-log.ts`/`combat-history.ts` too, even though their own caps (`MAX_KILLS`/
`MAX_FIGHTS`) already keep a `list()`-based count cheap — one rule ("count via `COUNT(*)`, never
`list()`") is simpler to keep true than two capped exceptions to it.

**`search()` is not fixed here.** Building a genuine SQL `WHERE`/`LIKE`-based search matching each
store's own `summaryOf`/field logic, for every one of the eight registered stores, is real per-store
design work — a bigger change than this ADR's scope, and one that shouldn't ride along with a fix
this narrow. Left as a known, documented gap rather than silently accepted.

## Consequences

- Opening the admin panel, or simply leaving it open while playing, no longer risks a multi-hundred-
  millisecond-to-multi-second freeze of the entire app on an uncapped store, verified at the 300,000-row
  scale the migration's own design intends to support.
- `search()` across every registered store still does a full scan per keystroke (after its existing
  200ms debounce) — real, but out of scope here; a future pass building server-side search for the
  SQL-backed stores should follow `faction-log.ts`'s `hitsPage` filter as its template.
- `find()` inside `createSqlAdminStore` (used by `get`/`patch`/`remove`) still does a full `list()`
  scan to locate one row by id — bounded by explicit user action (opening a specific record already
  paid for one `list()` via `records()`), not by an automatic background broadcast, so it doesn't
  share `stores()`'s "freezes the app even when nobody is looking at the panel" severity. Left
  unaddressed for the same reason `search()` was: a real fix needs its own indexed lookup path per
  store, not a one-line change riding along with this one.
