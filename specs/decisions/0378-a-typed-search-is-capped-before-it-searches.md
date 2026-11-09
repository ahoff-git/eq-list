# 0378: A typed search is capped before it searches

## Status

Accepted

## Context

The wiki's and Lucy's searches match fuzzily, and the cost of a match is linear in the length of the query: **about
0.9 ms per character** over the 24,000 pages a real cache holds. The searches run in the main process — the one that
follows the game log and raises the overlay's alerts — and nothing capped the query.

Found by fuzzing the running app's own IPC API (every function on `window.eql`, ten argument shapes each, asking the
browser-level debug endpoint after each call whether main still answered): a 2 MB string handed to `wiki.search` held
main at 100% CPU, with no answer, for as long as it takes to finish — about half an hour. A 20,000-character query
took ~15 s; a pasted 5,000-character line, four. No item, spell, zone or faction name is anywhere near a hundred
characters, so none of that work could find anything a short query would not.

The same fuzz showed a second, quieter fault at the same edge: a handler given a number or `null` threw "term.trim is
not a function", which the caller sees as a rejected search rather than an empty one.

## Decision

- **A query is a string of at most `MAX_QUERY_CHARS` (120) characters, trimmed** — `cleanQuery` in
  `src/shared/search-query.ts`. Anything that isn't a string is the empty query. A longer one keeps its start, what a
  person typed first.
- **The cap is applied once, at each search's entry point,** before the term is turned into a base name or handed to the
  matcher: `wiki.search`, `wiki.searchZones`, `wiki.searchFactions` and `lucy.search`. The matcher itself is unchanged.
- **The limit is a constant in one module,** not a number inside each handler, so a future search takes it from there.

## Consequences

- A search costs at most ~110 ms of matching however much was pasted, and the main process stays free for the log.
- A name longer than 120 characters can't be searched for in full. None exists; if one ever does, the constant is the
  one place to raise it, against the 0.9 ms-a-character cost.
- Searches that take other free text — the log search and the list's add-by-name — have their own paths and were not
  found to cost anything like this in the same fuzz; they are not capped by this decision.
- Re-running the API fuzz after the change completes over all 152 callable functions with no main-process stall over
  700 ms.
