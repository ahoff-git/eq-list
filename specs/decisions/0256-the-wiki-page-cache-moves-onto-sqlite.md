# 0256: The wiki page cache moves onto SQLite

## Status
Accepted

Supersedes [0165](./0165-the-page-cache-is-a-few-files-not-eleven-thousand.md).

## Context
[ADR 0165](./0165-the-page-cache-is-a-few-files-not-eleven-thousand.md) moved the wiki page cache off
one file per page and onto 256 append-only bucket files, and rejected SQLite along the way on the
grounds that it "brings a native dependency into an Electron build for a store with one key and no
queries."

Neither half of that objection still holds.

**The native dependency is no longer a cost this change would introduce.**
[ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md) already brought `better-sqlite3`
into this exact Electron/Windows build for the ledgers (`faction-log.ts`, `kill-log.ts`,
`loot-log.ts`, `combat-history.ts`) and solved the hard part: the dual-ABI prebuild problem (a
newer `better-sqlite3` major segfaults under Electron's bundled Node runtime; 12.11.1's prebuild
strategy doesn't), `build.asarUnpack`, WAL mode, and a shared `eqlist.db` with a `PRAGMA
user_version` migration sequence (`electron/sqlite-store.ts`). Moving the wiki cache onto it adds no
new native-module risk — it reuses the one already proven here.

**"One key, no queries" was already a stretch, and the gap has only widened.** The store is walked
and filtered by `kind` (`factionRows()` wants only faction pages; `buildCatalogue()` branches on
item/mob/zone/quest/spell), and filtered by age against the TTL (`itemShard`, `acceptItems`,
`readCache`). The *only* reason the catalogue-pack file (`catalogue.json`) and its whole
signature/invalidation apparatus (`PACK_SIGNATURE`, `packDropped`, `dropDerived`) exist is to avoid
paying a 256-file-open cost on every launch just to answer "what do we hold, and what kind is it" —
exactly the question an indexed `WHERE kind = ?` answers directly.

Per this project's own rule, `0165` is `Accepted` and is superseded here rather than edited.

## Decision

**Pages live in one table, `wiki_pages`, in the shared `eqlist.db`** — the same database, the same
`Migration`/`PRAGMA user_version` machinery, and the same "each store adds its own migrations to the
list `main.ts` passes in" convention ADR 0232 established for the ledgers.

```sql
CREATE TABLE wiki_pages (
  title TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  version INTEGER NOT NULL,
  page_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX wiki_pages_kind_idx ON wiki_pages(kind);
```

- **`kind`/`fetched_at` are promoted to real columns** because they're what's actually filtered on
  outside a full parse — the same "promote what's queried, blob the rest" shape `faction_hits`
  already uses for its own JSON-ish columns. `page_json` stays one opaque blob; there's no reason to
  normalize the page shape itself.
- **`title` as the primary key replaces the whole bucket-hash/append/compact/torn-line-recovery
  apparatus.** `INSERT OR REPLACE` *is* `put` — "the last write for a title wins" is the database's
  own job now, not something this file implements by hand.
- **`electron/wiki/page-store.ts`'s exported shape is unchanged**: `PageStore` is still
  `get`/`put`/`each`/`ready`, so `electron/wiki/index.ts` — the search/harvest/peer-share/catalogue
  logic that actually uses the cache — needed no changes beyond how the store is constructed.
- **`createWikiClient` takes an optional `db`.** Passed (as `main.ts` does, after moving its
  `openAppDatabase` call ahead of the wiki client's construction and adding
  `WIKI_PAGE_MIGRATIONS` to the combined list), the wiki cache lands in the one shared file next to
  every ledger. Left unset — every existing test that constructs its own client over a temp
  directory — a standalone `eqlist.db` is opened inside that directory instead, so none of those
  call sites needed touching.

**Upgrading an existing install folds two older generations, in the background, exactly as ADR 0165
folded one:**
1. **256 `.jsonl` bucket files** (`pages/*.jsonl`, ADR 0165) — the immediately-prior format, and the
   one a real existing install has today.
2. **One loose file per page** (pre-ADR-0165) — shouldn't exist on any install that has launched
   since 0165 shipped; folded only because reading through to it costs nothing extra.

Both fold keyed by the page's **own key** — for the bucket format that is the line's own leading
field (which is not always `page.title`: a graded alias like `Cloth Cape +2` is stored under its own
key with the base page's title embedded in its JSON, ADR 0057, and the fold must keep the two rows
distinct exactly as the running bucket store already did); the loose-file fold, as before, collapses
by `page.title` and drops the alias filename, matching ADR 0165's own documented (and tested)
behavior for that one-time migration. `get()` reads through to whichever legacy file still holds an
unfolded title while the fold is running, the same contract ADR 0165 gave for loose files.

**`scripts/build-web-snapshot.mjs` keeps publishing the bucket-file wire format**, because that
format is a public contract now — it's what `src/lib/web/snapshot.ts` reads with a plain `fetch()`
on the hosted static site, and what's already committed under `public/data/wiki-cache/pages/`. A new
`exportAsBuckets(db, pagesDestDir)` in `page-store.ts` dumps the table back into that exact shape on
demand; the script calls it (via the compiled `dist-electron` output, same as it already loads
`electron/eq-maps.js` for `listSources`) instead of raw-copying `userData/wiki-cache`, which would
otherwise silently stop including page content the moment the live cache stopped being files at all.

**Migration version 9.** The highest version already claimed across the ledgers' own migration
arrays (`loot-log.ts`'s `8`) — the next free number in the one strictly-increasing sequence every
store sharing `eqlist.db` claims from, the same "claim the next number when the file is created"
rule this project already applies to ADRs themselves.

**Out of scope, deliberately**: the sidecar index files (`title-index.json`, `zone-index.json`,
`faction-index.json`, `out-of-era-zones.json`), the harvest/shape/changes checkpoints, and the
catalogue pack (`catalogue.json`) all stay exactly as they are. Each is small, genuinely single-key,
and read or written as a whole — precisely the case ADR 0165's original reasoning still fits. The
catalogue pack in particular stays for now: `buildCatalogue()`'s walk does real per-page CPU work
(parsing stat cards, gathering level/quest-giver/dialogue cross-references) that an indexed query
can't shortcut, so the pack's job — skipping that CPU-bound rebuild, not file opens — doesn't go
away just because the underlying store did. Shrinking or removing the pack now that a `WHERE kind IN
(...)` query is available is a separable improvement, left for later (see Consequences).

## Consequences

- **No more bucket hashing, append-then-compact, or torn-line recovery code.** A write is one row,
  durably, or it didn't happen — SQLite's own transactional durability replaces the "a torn line
  costs one page, not the bucket" guarantee the append-only format needed to state and test for
  itself.
- **A relaunch's cold-path file-open cost drops further**: reads now go through SQLite's own file
  handle rather than 256 (or, mid-fold, more) separate `fs.readFileSync` calls — the antimalware-scan
  concern ADR 0165 raised for 11,523 files shrinks again, from "a few hundred" to "effectively none"
  for the page cache specifically.
- **The catalogue pack's job could shrink.** Now that `kind`/`fetched_at` are indexed columns, a
  `SELECT ... WHERE kind IN ('item','recipe')` answers what `factionRows()`/parts of
  `buildCatalogue()` want directly — the pack would still be worth keeping for the CPU-bound
  cross-reference build, but its role as "avoid touching 256 files" is gone. Not acted on here; noted
  as the natural next step, the same way ADR 0165 left "patch the pack for one written page instead
  of rebuilding it" as its own unclaimed follow-up.
- **`build-web-snapshot.mjs` now depends on the compiled Electron output for the wiki-cache section
  specifically**, the same dependency it already has for the maps section (`eq-maps.js`) — not a new
  kind of coupling, just a second user of it.
- **Migration numbering is now a cross-cutting resource four unrelated modules (soon five) all claim
  from.** Nothing new about that risk — ADR 0232 already established it — but it's worth remembering
  that "the next number" has to be checked against every `*_MIGRATIONS` array in the codebase, not
  just the one file being edited.
