# 0058: A ledger needs filters and a column to sort by

## Status

Accepted

## Context

The Loot tab stacked two things in one scroll: the drop ledger, then "what it sells for" underneath
it. That was fine when the feed was a session's worth of drops and wrong the moment the ledger
started outliving the app ([ADR 0033](./0033-eating-a-log-is-idempotent.md),
[ADR 0055](./0055-eating-a-log-fills-history.md)) — a few hundred rows of mostly trash push the
price table off the bottom of the screen, where nobody scrolls to find it. The prices are the
*answer* to "is this worth carrying home", and they were the part you couldn't see.

The rows themselves had the matching problem: a flexbox list, newest first, no way to ask a
question of it. "What did that mob actually give me", "what have I kept rather than auto-sold",
"which of this is on my list" were all eyeball work over hundreds of lines.

There was also a quiet duplication forming: `SpellTable` had grown its own sortable-header
component and its own single-direction sort rule, so a second sortable table would have meant a
second answer to "what does clicking a header do".

## Decision

**Two segmented views, the way the damage tab does scopes.** **Drops** and **Sells for** each get
the whole panel. Splitting beats shrinking: both are lists that want the height, and a tab whose
second half is only reachable by scrolling past the first is a tab with a hidden half.

**Filters on the drops view** (`src/shared/loot-filters.ts`, pure and tested, deliberately shaped
like [`kill-filters.ts`](./0023-kill-heatmap.md)): fate, item substring, which corpse (a select of
the corpses actually present, not a free-text box), and "on my list". One filter object applied by
one function, so the header's tallies and the rows beneath them can't describe different sets — the
tallies count **what's on screen**, which is what makes them worth reading after filtering.

"On my list" folds through `normalizeItemName`, the same fold the store matches loot with, so it
means here exactly what it means when a drop lights the list up — grade included
([ADR 0057](./0057-a-grade-is-not-an-identity.md)).

**Sortable columns on both views**, with one rule for what a click means: `src/shared/sorting.ts`
owns `Sort<K>`, `nextSort` (click the sorted column to flip it) and a stable `sortRows`, and
`SortHeader` renders it. `SpellTable` was moved onto the same pieces, which deleted its private
copy and gained it a direction toggle.

**The sort must be stable, and callers rely on it.** The log stamps to the whole second, so several
drops off one corpse share a timestamp. Sorting them by that clock has to be a no-op on their
order — which a stable sort makes true, and a tiebreak would break. This is the same reason
`mergeLootFeed` doesn't sort by time at all.

Rejected alternatives:

- **Keeping one scroll and just moving the prices to the top.** Swaps which half is hidden.
- **Collapsing the prices into a summary line with a "show more".** A third interaction to learn,
  and the table is the useful form of that data.
- **Sorting and filtering inside the component.** It's the logic most worth testing here (a stable
  sort, a fold that has to agree with the store's) and the least worth reasoning about inside a
  render.
- **A generic table component.** The two views share headers and a sort, not a shape — the drops
  view is text-led with a highlight rule, the prices view is numeric. Sharing the *rule* and not
  the whole table is where the reuse actually was.

## Consequences

- The prices are visible without scrolling, and sortable — "what's my best copper per slot" is the
  `Each` column, which is a click rather than arithmetic.
- The drops view is now a table, so the old `.loot-row` flex list is gone. The wanted-row highlight
  survives as a row class; the fate colours are unchanged and still shared with the tallies.
- Filters are per-window state, not persisted. A filtered ledger is a question you're asking now,
  not a preference — and a filter that survived a restart would look like a tab with missing rows.
- The ignore list the todo asks for is now a filter question rather than a new mechanism, and the
  broader highlight rule ("used by a quest in my level range in this zone") has somewhere to live.
- Two tables now depend on `.stat-table th.sortable`, which moved out of `.spell-table`'s scope. A
  third sortable table gets the styling for free.
