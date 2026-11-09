# 0377: A cached page is read back tidy

## Status

Accepted

## Context

A sweep of the running app over a copy of the real page cache (24,000 pages) found four defects that none of the unit
tests could: each lives in the *joins* between the wiki's pages and what the app builds from them, and each needed real
pages to show.

- **A spell appeared twice.** Asking for "Circle of Karana" fetched the page whose own title is "Circle of North
  Karana" and cached it under both names. The item catalogue folds such aliases to one row; the spell catalogue never
  did, so the Spells grid — which keys a row by its title — got two rows with one key, and React warned of rows
  "duplicated and/or omitted" on every visit. Nine spell pages were held under two names.
- **Kael's roster held 168 item cards among 508 "NPCs"** (`A Giant's BroomA Giant's Broom LORE ITEM NO DROP Slot: …`):
  the loot the zone page lists beside its mobs, read as more rows of the same table. Cached under three names, so 504
  bogus entries, each a "mob" on the zone page, in the named-spawn pins' candidates, and a level the walk tried to read.
- **The Spells catalogue failed to load at startup** ("This statement is busy executing a query"): the page store's walk
  yields to the event loop between chunks with its row iterator still open on one prepared statement, so a second walk
  started then — the Items tab, the Spells tab, the share hub and the shard index all ask for the same catalogue — tried
  to open a second iterator on it, and SQLite refused.
- **Item cards that spell a stat out were read as nothing.** `Charisma: +4` on Scalp of the Ghoul Lord (an item a real
  player wears) matched no alias, because only `CHA` did; `SV POISION` is the wiki's own typo on Paebala Fetish.

## Decision

- **One row per spell, however many files hold it** — folded by title (case-insensitive) when the walk ends, newest copy
  winning: the fold items already have, for the same reason.
- **A zone roster holds only NPCs.** `isRosterNpc` (`src/shared/zones/zone-roster.ts`) tells a card from a mob by what
  only a card says (`LORE ITEM`, `NO DROP`, `WT: 0.4`, `Size: TINY`, `Atk Delay: 40`), and is applied where a page is
  **parsed**, where a stored page is **read back** (so a page already cached is clean without being fetched again — a
  zone floor raise would have dropped every zone page, and with them most items' levels, until re-fetched) and where a
  peer's page is **received**.
- **The store's walks queue.** `each` runs one iterator at a time; a walk that throws does not wedge the ones behind it.
- **A stat is read under its full name as well as its abbreviation,** and under the wiki's one known typo.

## Consequences

- Kael's page is 340 NPCs and no cards, live, with no re-fetch; the Spells tab logs no errors where it logged 13.
- The roster test is a content test, not a structural one, because the wiki's markup isn't visible in what is cached.
  A mob whose *name* sounds like a card ("Magic Item Merchant") stays: the flags are matched as written, in capitals.
- Pages cached under an alias are still held twice on disk; the fold is on read. Cheap, and the same trade items made.
- `Attack:` and `Accuracy:` (three cached items between them) are still read as nothing: they are not stats the app
  models, which is a feature, not a spelling.
