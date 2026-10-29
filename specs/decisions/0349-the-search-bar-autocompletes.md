# 0349: The search bar autocompletes across everything, in one ranking

## Status
Accepted

## Context
[ADR 0346](./0346-search-is-a-bar-in-the-frame.md) put the search bar in the window's frame, but
its list only matched section names; anything else meant pressing "Look up" and reading Find →
Search's results. The answers were already to hand without a round trip: the wiki's title index is
searched locally (`wiki.search`), and `findAcross` matches your inventory, stances and AAs
([ADR 0321](./0321-find-answers-from-one-box.md)).

## Decision
**The bar autocompletes from all of them, in one ranked list** (`globalSuggestions` in
`src/shared/find/global-suggest.ts`, drawn by `chrome/SearchBar.tsx`).

- **One ranking, not groups.** Each candidate gets the fuzzy score (`fuzzy.ts`) plus a lift when
  its name starts with what you typed (+0.3) or a word in it does (+0.1). Without the lift, "moon"
  rated every name containing the word Moon as perfect, and put Chase the Moon above Moonstone.
  Small nudges then order near-ties: something you picked before (+0.15), something you hold
  (+0.1), and an out-of-era page down (−0.1, still shown). Sections need a score of 0.6 and take at
  most three lines. Eight lines in all.
- **A page you hold is one line**, at your best grade, saying how many and where; it opens the page.
- **What a pick does**: a section opens; a page or held item opens its page directly; a stance,
  invocation or AA is looked up in Find → Search, whose row says what it does. "Look up …" stays as
  the last line.
- **The ghost**: the rest of the top prefix match is greyed behind the caret, and Tab (or → at the
  end) takes it — `SuggestField`'s convention. The lift means the ghost and the top line agree.
- **Recent picks** (`eqlist.main.searchRecent`, eight) are what the bar shows when focused empty;
  before any pick it lists the sections, as before.

The wiki lookup's debounce moved into `useWikiSearch` (`src/lib`), shared with `ItemNameField`.

## Consequences
- Typing a name and pressing Enter usually lands on the page, with no results page between.
- The wiki side is the title index's top twelve, so a common word can crowd out the page you meant;
  "Look up" still reaches the full search, Lucy and your log.
- Fuzzy matching tolerates typos, so near-misses ("spawn" → Deathfist Pawn) appear under the real
  matches.
