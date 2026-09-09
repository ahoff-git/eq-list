# 0211: A loot filter searches the ledger, not the window

## Status

Accepted

## Context

The Loot tab (`LootPanel.tsx`) fetched a flat `useLootFeed(200)` regardless of what the filters
were doing — 200 rows out of a ledger that persists up to 20,000 (`MAX_LOOT`,
`electron/loot-log.ts`). Every filter, including the item-name search box
(`src/shared/loot-filters.ts`), ran only over those 200 already-fetched rows.

That silently broke the one thing filters exist for. The panel's own doc comment says why they're
there: "by the second evening this is mostly trash you've already dealt with" — the whole premise
is that a filter can reach back and find one real thing in a pile of it. A player who loots at even
a modest pace pushes a drop out of the top 200 within a single evening, and past that point the
item-name box quietly answers "not found" for something that demonstrably dropped — reproduced
against a real player's `loot-log.json` (6,927 drops): every occurrence of "Cat o' Nine Tails" sat
between position 3,928 and 6,260 from the end, so the old fetch never had a chance to see any of
them. The header's own tooltip compounded it, claiming "of the whole ledger" while `drops.length`
was in fact the 200-row fetch.

The zone/mob-knowledge view the player cross-checked against doesn't have this problem: it's fed
from `kill-log.ts`'s pooled observations, which carry no such recency window. That asymmetry — one
view can find a drop, the other can't — is what read as "the loot tab is wonky" rather than as a
capacity limit.

Simply raising the fetch cap outright isn't free, though: `DropTable` draws every row it's handed
straight into `<tr>` elements with no virtualization. Surveying the rest of the app
(`MobKnowledge.tsx`/`MobKills.tsx`, `KillList.tsx`, `DamageHistory.tsx`) turned up no place that
plain-renders more than a few hundred rows at once — large datasets are always aggregated (one row
per mob, not per kill) or paginated (one row per session, fights lazy-loaded on expand) first.
`ItemSearchPanel.tsx` and `SpellSearchPanel.tsx` are the closest precedent: both filter a large flat
catalogue and cap what actually reaches the DOM at `MAX_ROWS = 300`, with a "showing first N of M"
line when truncated. Handing `DropTable` the whole ledger unfiltered would have been the first
uncapped table this codebase has ever drawn.

## Decision

Two independent caps, matching what each is actually protecting:

- **What's fetched depends on whether a filter is narrowing anything.** `LootPanel.tsx` asks
  `isFiltered(filters)` (already computed for the header's "N of M" count) and requests
  `SEARCH_FETCH = 20_000` instead of `DEFAULT_FETCH = 200` the moment any filter — item text, fate,
  source, zone, or "on my list" — is active. Clearing every filter drops the fetch back to 200. No
  new IPC surface: `loot.recent(limit)` already took an arbitrary limit
  ([`electron/ipc.ts`](../../electron/ipc.ts), `CH.lootRecent`); the panel just stopped hardcoding
  it.
- **What's drawn is capped separately, at `MAX_ROWS = 300`** — the same number and the same
  "showing first N of M, narrow it" message `ItemSearchPanel`/`SpellSearchPanel` already use. Fate
  tallies and the header count are taken from the full filtered set (`matches`), not the capped one
  (`shown`), so a truncated table never under-counts what it found.
- The header's tooltip now says which of the two it's showing — "of what's loaded" when unfiltered,
  "of the whole ledger" once a filter actually reaches it — rather than asserting the ledger claim
  unconditionally.

Verified against the real ledger described above: the old path found 0 matches for "Cat o' Nine
Tails"; the new path finds all 34.

## Consequences

- The common case (no filter set) fetches exactly what it did before — 200 rows, one IPC round
  trip — so this costs nothing for the everyday "what did I just get" glance the tab is normally
  used for.
- The moment a filter engages, one refetch pulls up to 20,000 records over IPC. That's a few
  megabytes at the ledger's cap, paid once per filter-engage rather than per keystroke — `limit`
  only changes (and re-triggers `useLootFeed`'s effect) on the unfiltered↔filtered transition, not
  on every character typed into the item box.
- Zone/source dropdown options (`lootZones`/`lootSources`) are still derived from whatever's
  currently fetched, so an old zone can't be *picked* from the dropdown until some other filter (in
  practice, the free-text item box) has already widened the fetch. Free-text search is what the
  original report needed and what this fixes; a zone/source filter reaching the whole ledger on its
  own, with nothing else engaged, is a narrower follow-up if it turns out to matter.
- `MAX_ROWS = 300` is a second place this exact cap now lives (`ItemSearchPanel.tsx`,
  `SpellSearchPanel.tsx`, and here), each with its own local constant rather than a shared one — matching
  how the other two already chose not to share it either.
