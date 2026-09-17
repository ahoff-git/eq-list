# 0235: A migrated ledger's permanent keys migrate too

## Status

Accepted

## Context

Exercising [ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md)'s migration harder than
its own test suite had — a synthetic legacy `kill-log.json` shaped like a real long-lived character's,
where kills have actually aged past `MAX_KILLS` and retired — turned up a real, silent data-loss bug in
`kill-log.ts`'s `migrateFromLegacyJson`.

[ADR 0207](./0207-a-retired-kill-still-remembers-its-own-line.md) made `kill-log.json` keep three
permanent identity sets — `seenKillKeys`/`seenLootKeys`/`seenCoinKeys` — **independent of** the `kills`
array, specifically so a kill/loot/coin line already retired past the cap is still recognised on a
later re-read. That was the whole point of that ADR: without it, an unattended re-read (ADR 0129)
re-records and re-retires history a second time, doubling drop rates.

`migrateFromLegacyJson`, as first written, only reconstructed `kill_seen_keys`/`loot_seen_keys`/
`coin_seen_keys` from whatever the legacy file's `kills` array still held — it never read
`seenKillKeys`/`seenLootKeys`/`seenCoinKeys` at all. For any real player with enough history to have
retired kills (the cap is 5,000; a month of real play is tens of thousands of kills, per ADR 0207's own
numbers), migrating to SQL would silently drop the permanent identity of everything already retired —
reintroducing, at the exact moment of upgrading, the precise bug ADR 0207 shipped to fix. Confirmed by
reproduction: a legacy file with an empty `kills` array, a `retired` observation, and populated
`seenKillKeys`/`seenLootKeys`/`seenCoinKeys` migrated cleanly, but replaying the exact log line that
built that retired observation was **not** refused as a duplicate — it was recorded and re-retired,
doubling the observation's kill count.

A second, unrelated regression turned up alongside it: `createSqlAdminStore`'s generic field-typing
(`admin.ts`'s `adminFieldType`) infers a field's type from its live JS value. The three array-backed
stores' domain objects held real JS `boolean`s for `named`/`killerNamed`/`mine` (`kill-log.ts`) and
`unsourced` (`combat-history.ts`); their SQL replacements store the same facts as plain SQLite
integers (`0`/`1`/`NULL` — there is no boolean column type), and the admin store's `list()` handed
those raw rows straight to the generic layer. The hidden admin panel's field editor
(`src/app/admin/page.tsx`) switches on `field.type === "boolean"` to choose a true/false toggle versus
a free-text box; with the raw integer leaking through, these four fields silently became free-text
number inputs instead — a plain text box accepting any integer where a toggle used to be the only way
to reach true/false.

## Decision

**`migrateFromLegacyJson` (kill-log.ts) migrates `seenKillKeys`/`seenLootKeys`/`seenCoinKeys` directly,
as the authoritative permanent identity, alongside (not instead of) reconstructing what the `kills`
array itself carries.** A `seeding` flag — `!parsed.seenKillKeys`, mirroring the original JSON store's
own flag of the same name exactly — tells the two paths apart: a file already past ADR 0207 (the
common case for any real install) trusts the three arrays as ground truth; a file that predates ADR
0207 entirely (no such arrays ever existed) falls back to the same best-effort reconstruction from
`kills` that ADR 0207 itself describes as the correct floor for that case — "a kill retired before this
shipped has no key left to recover."

**`createSqlAdminStore`'s row types for these two stores present the affected columns as real
booleans**, converted at the admin boundary only (`KillAdminRow`/`FightAdminRow`, each a thin `Omit`-
and-replace over the row type used everywhere else in the store) — not by changing the SQL schema or
any other reader of these rows, which have no reason to prefer a boolean over the integer SQLite
already gives them. `applyPatch` folds a genuine boolean back to `0`/`1` before binding it, since
`better-sqlite3` has no boolean bind type of its own.

**A new cross-store integration test** (`electron/tests/ledger-sqlite-integration.test.ts`) exercises
what no existing test did: all four ledgers sharing one `eqlist.db` under the exact combined migration
list `main.ts` builds, constructed in `main.ts`'s own order, including a simultaneous legacy-JSON
upgrade of all four files sitting in one `userData` folder at once — the shape a real install's upgrade
actually takes, as opposed to each store's own isolated `:memory:`/single-migration-array test setup.

## Consequences

- A real player upgrading from a pre-SQLite build with any retired kill history no longer loses that
  history's protection against re-recording — verified by reproducing the exact double-count and
  confirming the fix closes it, in both the isolated (`kill-log.test.ts`) and combined
  (`ledger-sqlite-integration.test.ts`) migration paths.
- `loot-log.ts`, `faction-log.ts` and `combat-history.ts`'s own dedup identity was already scoped to
  currently-held records only, in both the old array-backed stores and their SQL replacements — this
  bug and fix are specific to `kill-log.ts`, the only store ADR 0207 ever applied to.
- The hidden admin panel's `named`/`killerNamed`/`mine` (Kills) and `unsourced` (Fights) fields are
  true/false toggles again, matching every other boolean field in the panel and these fields' own
  pre-SQLite behavior.
- Any future SQL-backed store whose admin view exposes a column that is logically a boolean needs the
  same `Omit`-and-replace treatment at the admin boundary — `admin.ts`'s generic layer has no way to
  know a `0`/`1` integer column "means" a boolean unless the store that owns it says so.
