# 0232: A ledger that outlives its cap is a database

## Status

Accepted

## Context

Every "ledger" in the app — `faction-log.ts`, `kill-log.ts`, `loot-log.ts`, `combat-history.ts` — is a
JSON file holding a capped in-memory array, written whole through
[json-store.ts](../../electron/json-store.ts)'s `createSaver`. The cap exists only because the whole
array has to fit in memory and be rewritten to disk as one blob on every change: `MAX_FACTION = 5_000`,
`MAX_KILLS = 5_000`, `MAX_LOOT = 20_000`, 1,000 fights — five hand-picked numbers standing in for "as
much as this design can hold," not "as much as the player needs."

The cap forces real complexity that has nothing to do with the data itself. `faction-log.ts` and
`loot-log.ts` each keep a parallel `retired` fold so a faction's net standing, or an item's vendor
price, doesn't shrink the moment an old hit ages out of the array — a hand-maintained aggregate that
exists purely to survive an eviction the design itself causes.
[combat-history.ts](../../electron/combat-history.ts) doesn't even have that: `zones()`/`bests()` are
recomputed by scanning the live array on every call, so a fight's contribution to a zone's or
opponent's totals **silently disappears** once it ages past the 1,000-fight cap — an accepted, if
un-discussed, data-loss bug baked into the array-cap design. And when the Faction tab's Hits view
wanted a real "page back through everything," the array design had no answer beyond
`HITS_FETCH_LIMIT = Number.MAX_SAFE_INTEGER` — shipping the *entire* capped ledger over IPC on every
open and letting the grid "paginate" an array that was already fully fetched.

[ADR 0165](./0165-the-page-cache-is-a-few-files-not-eleven-thousand.md) rejected SQLite once already,
for the wiki page cache, on the grounds that it "brings a native dependency into an Electron build for
a store with one key and no queries." That reasoning is correct for that store and does not transfer
here: these ledgers want unbounded retention plus filter/sort/search/paginate, which is exactly what a
query engine is for and exactly the case ADR 0165 was *not* answering.

**The native dependency turned out to be the real cost, and not the one expected.** `better-sqlite3`
ships prebuilt N-API binaries bundled directly in the package as of its current major version, so no
compiler is needed to use it under plain Node — but its bundled Windows binary **segfaults when loaded
inside Electron's own bundled Node runtime** (confirmed both in Electron's `ELECTRON_RUN_AS_NODE`
compatibility mode and in a real `app.whenReady()` boot), despite N-API's cross-runtime ABI promise.
This machine has no Visual Studio Build Tools installed, so `electron-rebuild`'s usual fix (recompile
from source against Electron's exact ABI) isn't available either. What does work: `better-sqlite3`'s
**older** major (12.11.1) still publishes its prebuilt binaries the classic way, one per
runtime/ABI/platform, fetched on demand by `prebuild-install` — including an `electron`-tagged one,
built and published upstream against Electron's own ABI, that loads and runs correctly. No compiler
needed, just the right binary for the process that's about to load it.

## Decision

**`better-sqlite3@12.11.1`, pinned exactly (not `^12.11.1`, not latest)**, since the newer 13.x
bundling strategy is the one that doesn't work under Electron on this platform, and a future minor/patch
bump could silently reintroduce that. Its synchronous API matches this codebase's style everywhere —
`json-store.ts` is fully synchronous and `main.ts` constructs every store synchronously at startup — so
nothing else about the store's shape has to change to accommodate it.

**One shared `eqlist.db`, not one file per store.** `electron/sqlite-store.ts` is the SQLite analogue of
`json-store.ts`: `openAppDatabase(userDataDir, migrations)` opens (or creates) the one file and brings
its schema up to date via `PRAGMA user_version`, treated as one strictly-increasing sequence across
every store that uses it — the same "claim the next number when the file is created" discipline this
project already applies to ADRs. `main.ts` collects every store's own exported `Migration[]` and passes
the combined list in, since it's already the one place that constructs every store.

**`faction-log.ts` is the pilot**, chosen because it was already the one showing the pain
(`HITS_FETCH_LIMIT`). Its `MAX_FACTION` cap and `retired`/`foldAll` fold are gone entirely:
`standings()` is one `GROUP BY faction` query over the live table, unioned with a small
`faction_standings_frozen` table that only exists for `clear("records")` — asked to forget the hits but
keep what they taught, it freezes the current *merged* standings (live + whatever was already frozen)
into that table and only then deletes the hits. That is the old `retired` idea, reinvented: no longer a
side effect of an array filling up, now a snapshot taken exactly once, when the player asks. A new
`hitsPage(query)` method (additive — `recent(limit)`'s existing contract is untouched, so every
existing small-limit caller keeps working unchanged) answers `HitTable`'s grid with one page at a time,
sorted by an allow-listed column expression (never a caller's raw string interpolated into SQL) with
SQLite's own `NULL`-ordering flipped to match what `sortRows` already promised elsewhere: a floor/ceiling
hit's `null` delta, or an uncorrelated hit's `null` cause, always sorts last, in either direction.

**`electron/admin.ts` gains `createSqlAdminStore`**, the SQL-backed twin of `createArrayAdminStore`,
reusing the same field-typing/coercion/audit-folding helpers. `faction_hits` carries its own
`admin_audit` column rather than a decorative field mutated onto a live object in memory — the same
audit trail, a different place to keep it.

**A pre-existing `faction-log.json` is folded into the new tables once, then renamed to `.bak`** — the
same "old store folded in, then the loose file retired" shape ADR 0165 used for the wiki cache, except
renamed rather than deleted: this is a player's own history, not a re-fetchable cache, so the source
stays as an escape hatch. Guarded by the legacy file's own existence rather than by whether the new
tables are empty, so a player who has genuinely cleared the ledger since migrating can't have it
silently repopulated by a stale file.

**`HitTable` moves to true server-side pagination and sorting** (`paginationMode="server"`,
`sortingMode="server"`, `rowCount` from `hitsPage`'s own count) instead of client-side paging over an
already-fully-fetched array. Column-level filtering stays exactly as every other MUI-backed table in
this app already works it (ADR 0230/0211): it narrows *what's on screen*, not the whole ledger — no
existing IPC method in this app takes a filter object today, and inventing one is explicitly deferred
rather than folded into this pass.

**The dual-ABI problem is solved with two scripts, not a manual step to remember.**
`scripts/rebuild-native-electron.mjs` fetches the Electron-tagged prebuild via `prebuild-install`
(reading the installed Electron's own version, never hardcoded); `npm rebuild better-sqlite3` fetches
the plain-Node one. `predev`/`prestart`/`predist` run the former before Electron ever launches;
`pretest` runs the latter before the compiled test suite does, since it runs under plain `node --test`.
`prebuild-install`'s own cache makes the second and later runs of either near-instant. `package.json`
sets `build.npmRebuild: false` so `electron-builder`'s own native-rebuild step (which defaults to
compiling from source and would fail the same way `electron-rebuild` did) never runs; `predist` already
guarantees the right binary is in place before packaging starts. `better-sqlite3/**` joins
`tesseract.js`'s existing entries in `build.asarUnpack`, since a native `.node` file can't be loaded
from inside an asar archive.

Rejected alternatives:

- **`node:sqlite`, Node's own built-in module.** Would need no dependency and no prebuild story at all
  — except Electron 33 bundles Node 20.18.3, which predates the module's introduction (Node 22.5+), so
  it simply isn't there to use inside this app's main process.
- **A WASM-compiled SQLite.** Sidesteps native-binary distribution entirely, at the cost of losing the
  ordinary, synchronous, disk-backed ergonomics `better-sqlite3` already gave every other store in this
  codebase — a WASM build needs its own explicit serialize/flush-to-file plumbing to persist at all, which
  is the exact "load everything, write the whole blob" shape this migration exists to get away from.
- **Migrating every ledger at once.** `kill-log.ts`, `loot-log.ts` and `combat-history.ts` share the
  same underlying problem but not the same shape — `kill-log.ts` carries three permanent, never-capped
  dedup key sets beyond its own `retired` fold; `combat-history.ts` has no fold at all today and a
  separate, more complex `rederive()` write path for re-imported logs. Each deserves its own schema
  decision once the pattern this ADR establishes has actually been proven, not a single mechanical
  rewrite across all four before any one of them has run for real.

## Consequences

- `MAX_FACTION`, the `retired` array, and `foldAll`/`foldCause`'s per-event incremental maintenance are
  gone from `faction-log.ts` entirely — the ledger keeps every hit forever, for free, because there is
  no cap left to evict past.
- Running the app and running the test suite now want the native module built for two different
  runtimes, which did not used to be true of anything in this codebase. `predev`/`prestart`/`predist`/
  `pretest` make the switch automatic rather than a step someone has to remember, at the cost of a few
  seconds the first time each is needed after a fresh `npm install`.
- `admin.ts` now has two store adapters (`createArrayAdminStore`, `createSqlAdminStore`) rather than
  one. `peer-kills.ts`/`mob-knowledge.ts`/`high-scores.ts` still lean on the array adapter's
  "decorate the live object in place" trick, which a SQL-backed store has no equivalent of — a boundary
  worth knowing about before assuming the two adapters are interchangeable.
- Server-side *filtering* is not built. A future ledger that wants "search reaches the whole table," not
  just the fetched page, needs to extend the `hitsPage`-style query shape (and the SQL behind it) rather
  than assume this ADR already covers it.
- `loot-log.ts`, `kill-log.ts` and `combat-history.ts` migrating onto this same foundation is recorded
  as open work in [todo.md](../todo.md), each with its own wrinkle noted so the follow-up doesn't have to
  re-derive it. `peer-kills.ts`/`mob-knowledge.ts` (a different shape, built on `contributions.ts`, with
  no cap-driven pain observed) and `high-scores.ts` (bounded by character × category, not by time — ADR
  0165's "one key, no queries" reasoning still holds for it) are deliberately left on JSON.
