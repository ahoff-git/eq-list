# 0323: A grade is never stored, only applied

## Status

Accepted

## Context

An item's `+N` and a spell's rank are arithmetic on the base page: the item slider
([ADR 0307](./0307-an-item-s-grade-is-the-wiki-slider-s-arithmetic.md)) and the spell slider
([ADR 0312](./0312-an-upgrade-level-is-shown-and-counted-at-its-level.md)) turn the `+0` card into any
level and back. Nothing about a level needs keeping beside the page it is computed from.

Two places kept it anyway, both against [ADR 0057](./0057-a-grade-is-not-an-identity.md)'s rule that a
grade folds wherever names are matched:

- **The wiki page cache.** ADR 0057 had `getPage` ask for the graded title first, "so a build whose
  wiki does carry a grade still gets its own page", and cache the answer under the name asked. No
  wiki title has ever ended in a grade (0 of the full title index, 2026-10-21), so the first fetch
  always missed. What it left behind was one copy of the base page per grade ever hovered, each
  refreshed on its own schedule. On a live install all 29 such rows had drifted from their base, and
  a hover read the drifted copy. The export had started papering over it by writing the newest copy
  under every name.
- **The pooled drop table.** `mergeObservations` matched drop names literally, so every grade was its
  own row with its own rate. On the same install, 101 of 476 known mobs listed one item several
  times. A Blackburrow gnoll's Hunting Bow read as four rows (8.8%, 4.5%, 3.3%, 0.5%) where the drop
  is about 17%. The Mobs view links those rows as `dropTableName`, which promises a fold that wasn't
  happening.

## Decision

**A grade is folded before anything is looked up, cached or tallied, and applied only where the thing
is shown.**

- `getPage` (main and the web snapshot alike) reads, fetches, marks missing and caches by
  `itemBaseName` of the asked-for name. The caller still holds the graded name and levels the page
  by it (`pageForName`). This replaces ADR 0057's "exact title first" clause; the rest of 0057 stands.
- Migration 11 deletes every `wiki_pages` row keyed by a graded name (matched with `itemGrade`, the
  same reader lookup uses). The shipped snapshot drops the same 29 rows.
- `mergeObservations` keys a drop by its base item, so a table and its rate are per item.

Unchanged, because each of these is a record rather than a copy: the raw loot and kill rows keep the
name as looted, prices keep one row per grade (a `+2` sells for its own price), and a frozen tally
keeps its verbatim keys and is folded when read (ADR 0083's rule).

Spell ranks and zone difficulties were checked the same way and needed nothing. Every cached page
with a numeral is a real page (`Burnout IV`, `Distillate of Clarity IV`), and no zone is stored per
difficulty.

## Consequences

- One copy of each page, so a hover at any grade shows today's card, and a graded hover costs no
  network round trip.
- If the wiki ever does publish a page per grade, `getPage` won't find it. That would be a different
  data model, and it would get its own record.
- A kill whose corpse held two grades of one item now counts twice toward that item's rate. That
  takes two copies on one corpse, and none turned up on the live install, so it's accepted rather
  than handled.
- `freshestUnderEveryName` still settles drift among redirect and `#section` aliases, which are
  separate wiki titles and keep their rows.
