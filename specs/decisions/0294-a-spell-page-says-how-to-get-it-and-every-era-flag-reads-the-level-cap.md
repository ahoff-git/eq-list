# 0294: A spell page says how to get it, and every era flag reads the level cap

## Status

Accepted

## Context

A player opened Tashania from the search box and got its card and a line saying to check eqlwiki
for how to acquire it. An item page has a "How to get it" list. The spell page on the wiki has the
same thing in its "Where to Obtain" section (a quest, Coin of Tash) and also lists the items that
cast it (Shissar Nullifier Staff, Orb of Tishan). The spell parser kept neither.

The same search for "Tashania" also listed Tashanian, an Enchanter 57 spell, as in era while the
cap is 50. [ADR 0288](./0288-a-spell-past-the-live-level-cap-is-out-of-era.md) added the level rule,
but only the Spells tab applied it. The search box and the page view still flagged a spell by its
page categories alone. Tashanian's page has no era category, so nothing caught it.

## Decision

**The level rule lives in one module and every era flag applies it.**
`src/shared/spells/spell-era.ts` holds `pastLevelCap` and `withSpellLevelEra`. The Spells tab's
`spellEraRows`, main's search results and served pages (`electron/wiki`'s `flagOutOfEra` and
`servedPage`), and the web build's `wiki.search`/`getPage` all go through it. The rule is layered on
the way out, like the GM-event rule ([ADR 0292](./0292-a-gm-event-item-is-never-in-era.md)), and is
never cached. The cap comes from the cached out-of-era zone list (`liveLevelCap`), so an era opening
reaches the next search. A search result is judged by the cached copy of its page. The whole spell
catalogue is harvested, so a cached copy is nearly always there.

**A spell page reads its "Where to Obtain" into `sources` and its "Items with Spell Effect" into
`effectItems`.** It renders through the item page's `SourceList`, so the era badges come free. The
section has four shapes: a merchant table (read by the same `merchantRows` as an item's "Sold by"),
`<Class>#Spell_Vendors` links, prose naming quests, and unlinked notes such as "Kunark Level 50+ Mob
Drop". An `ItemSource` gains `label` (a piped link's own text) and `plain` (prose, not a page).

**Only the page view needs v26, so only the page view asks for it.** `CACHE_VERSION` is 26, but the
spell entry in `MIN_PARSE_VERSION` is not raised. Raising it would drop every cached spell from the
Spells tab until a re-harvest fetched about 2,000 unchanged cards. Instead, a new
`MIN_VIEW_VERSION` re-fetches an older spell when it is opened. A peer sends `sources` only from a
copy parsed at v26 or later. A copy that arrives without them is filed at v25, so its card still
serves the catalogue and opening it still fetches the page.

## Consequences

Tashanian reads "out of era" in the search box and on its own page, the same as in the Spells tab.
It comes back unflagged when Kunark opens. Opening Tashania shows its quest and the two items that
carry it, and each one links like any other source.

The first time an older cached spell is opened, it costs one fetch. Nothing is fetched in bulk.

[ADR 0296](./0296-spell-sources-are-generated-static-data.md) was written alongside this one. It
reads the same `where_to_obtain` field at build time for the Spells tab's Source column. Two readers
of one field is the open question this leaves (see the README).
