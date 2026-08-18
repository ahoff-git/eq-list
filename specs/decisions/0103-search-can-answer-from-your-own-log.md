# 0103: Search can answer from your own log, and an item with no page still has one

## Status
Accepted

## Context
[ADR 0101](./0101-an-item-page-says-who-dropped-it.md) put your own evidence on an item's page —
and only reaches a player who can *get* to the page. Search is the only way in, and it asks
eqlwiki's title index and nothing else.

That index is missing a good deal of what this build drops. The case that settled it:
**`Desecrated Kejaar Totem`** has dropped many times for a real player, is in the loot ledger, is
in the kill tally with the mob and zone that produced it — and searching for it returns **zero
results**. Not a wrong rate or a missing source: the app answered *"there is no such item"* about
something in the player's bags, using its own records as no part of the answer.

Opening it was no better. `wiki.getPage` misses, and the panel had exactly one thing to say about a
title with no page — "Couldn't load" — which is true of the wiki and false of the item.

This is [ADR 0025](./0025-observation-over-the-wiki.md) reaching the search box. That decision
said the wiki seeds what we know and observation corrects it where they disagree. A missing item
isn't a disagreement about a rate; it's the wiki not knowing the thing exists, and correction there
means being able to **add**.

## Decision
**A name search reads your own records too, and a title the wiki can't serve still opens a page.**

- **The vocabulary is what you have held**, folded from the two records that know it and neither of
  which contains the other: the **loot ledger** (`lootLog.items()` — every line the log printed,
  including loot off a corpse in a zone we couldn't name) and the **pooled mob tally** (which mob
  gave it up — the part worth opening, and the part that survives a loot line ageing out of the
  20,000-line ledger). `known-items.ts` merges and ranks them.
- **Ranked by the same fuzzy scorer, at the same threshold, as the wiki's index.** A player types
  one query; a box that forgave a typo from one source and not the other reads as broken rather
  than as strict. Names fold by grade as everywhere else
  ([ADR 0057](./0057-a-grade-is-not-an-identity.md)), so three grades of a dirk are one offer.
- **Only what the wiki didn't answer.** An item the wiki knows stays a wiki result, opening the
  wiki's page with its evidence underneath (ADR 0101). Your log is offered *beneath* those results,
  under its own heading — "From your own log · not on the wiki" — because a name no reference lists
  is a different kind of claim and must not read as one of the wiki's pages.
- **Local hits need no debounce.** The vocabulary is already in the renderer, so a match appears on
  the keystroke that names it, while the wiki lookup is still in flight. One keyboard list covers
  both, since a hit is a hit whichever record found it.
- **A title with no wiki page gets a page made of what we know**: the sightings and when the last
  one was, who dropped it and where (ADR 0101's `ItemDrops`), and — the reason anyone searched —
  a **+ Add** button. Only when *neither* source knows the name does it say so, naming both:
  "eqlwiki has no page for it, and nothing in your log has named it either."
- **The wiki client stays ignorant of the log.** The merge is the panel's, not `wiki.search`'s: the
  wiki module's job is to be a good client of a MediaWiki, and a search that quietly returned
  results from a kill log would make its cache, its era flags and its title index answer for rows
  none of them had ever seen.

Rejected alternatives:

- **Teaching the wiki index our items.** It's a mirror of a remote list, refreshed on a TTL; a
  local addition would be silently dropped on the next refresh and would corrupt what "the wiki
  says" means.
- **Synthesising a `WikiPage` for an unknown item.** It would inherit the page header's
  "↗ eqlwiki" and a `wikiPath` that leads nowhere, i.e. the app claiming a source it hasn't got.
- **Shipping the whole ledger to the renderer to search there.** Up to 20,000 events; the derived
  name list is a fraction of it and is what the question actually needs.
- **Only offering items with a kill behind them.** That's the better row, but it silently loses
  everything foraged, ground-spawned or looted off a corpse in an unnamed zone — the very corners
  the wiki is also worst at.

## Consequences
- The app can now find things nothing else has ever written down, which is the strongest form of
  "observation outranks the wiki" it has made: not a corrected number, an item that exists.
- The vocabulary is read when the Search tab mounts and again on the (coalesced) kill notice, so a
  foraged item with no corpse behind it reaches the list on the next kill or the next time the tab
  is opened. Cheaper than re-deriving the ledger per loot line during a replayed gap, and stale by
  minutes at worst.
- A local result can only offer the **log's** spelling, since there is no other. If the wiki later
  adds the page, the item becomes an ordinary wiki result and stops being offered here — the fold
  by name is what makes that switch-over silent.
- Adding one puts a plain item on the list, with no `wikiPath`: nothing downstream can look it up,
  and loot matching works on the name, which is how it was always going to have to work for an item
  no reference lists.
- Opening an unknown title still costs a failed wiki fetch (and a retry on the base name), since a
  miss is not cached. Acceptable for a page a player opened deliberately; if it ever isn't, the
  cache is where to fix it, not the panel.
