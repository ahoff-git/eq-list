# 0292: A GM-event item is never in era

## Status

Accepted

## Context

The app judges whether an item is in era from eqlwiki's era categories, plus whether any zone it
comes from is open. Some items were only ever handed out by GMs at live events. Their pages say so in
prose ("Obtained during a GM event.", "Given out in a GM event.", "GM Event Item."), but carry no era
category. Oakwynd's are `Non-P99_Content, Lore_Items, Items`. With no sources and no era tag, such an
item counted as in era, though nothing on the server can produce it.

The page parser doesn't keep an item's notes. Teaching it to would raise the item parse version and
re-fetch every cached item page, about 20,000 of them, for a fact that applies to about a dozen.

## Decision

**A GM-event item is out of era, whatever its categories say.** The list is generated static data,
the same shape as the named-mob list (ADR 0265). `scripts/fetch-gm-event-items.mjs` full-text searches
eqlwiki for "GM event" and keeps an item when either:

- its own page states it outright, in any of the wordings above, or
- another page tags it, as Firestrike's `{{:Blade of Shadowed Flame}} (GM Event Item)` or Gate's
  `(GM Event Only)` do.

A hedged line ("Possibly a GM Event item?") doesn't count, and neither does a page that isn't an item.
The result is `src/shared/items/gm-event-items.generated.ts`.

`gm-event-items.ts` is the lookup, and **every era flag applies it on top of the categories**:
`eraCorpus` (the Items tab), the search-result flag (`flagOutOfEra`), and pages on their way out of
`getPage`/`refreshPage` (and the web build's equivalents). Names fold through `normalizeItemName`,
so a graded copy is the same item.

## Consequences

- A GM-event item reads "out of era" on its page, in search results and in the Items tab, and the
  era toggle hides it.
- The flag is laid over pages as they're served and never cached, so the cache keeps exactly what
  the wiki said, and regenerating the list takes effect without re-fetching anything.
- An item the wiki newly marks as a GM-event item is only picked up by rerunning the script.
- Seasonal event *quests* ("GM Event:" on a quest card) are not covered, and nor are their rewards.
  Those events may recur on this server, so the rule is kept to items said outright to come from one.
