# 0006: Fuzzy search over a cached title index

## Status
Accepted

## Context
EQ item names are long and easy to misspell, so search has to tolerate typos.
The wiki's `opensearch` is title-**prefix** only, and its full-text search is the
default MediaWiki matcher (no meaningful fuzziness) — both need near-correct
spelling. Doing typo-tolerant matching server-side isn't possible without control
of the wiki. That leaves matching locally, which needs the set of candidate names
on the client.

## Decision
Mirror every content-namespace page title into a local index
(`fetchAllTitles` → `userData/wiki-cache/title-index.json`, 7-day TTL, refreshed in
the background) and rank the query against it with a dependency-free fuzzy matcher
(`src/shared/fuzzy.ts`: token-wise prefix/substring/Levenshtein scoring). The
server search remains only as a fallback while the index is warming up or for a
page too new to be mirrored. The matcher is a pure, unit-tested black box.

## Consequences
- Misspellings, transpositions, partial and out-of-order words all find the item.
- Search is instant and offline after the first index fetch; no request per keystroke.
- One extra crawl (`list=allpages`, paginated) per refresh; the index is a few
  thousand short strings — trivial to hold in memory and scan on a debounced keystroke.
- No new dependency (chose a hand-rolled matcher over Fuse.js), keeping with the
  project's "ask before adding dependencies" rule and its black-box testing style.
- The index can lag the wiki by up to its TTL; the server fallback covers brand-new
  pages in the meantime.
