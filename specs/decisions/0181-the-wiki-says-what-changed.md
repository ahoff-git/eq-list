# 0181: The wiki says what changed

## Status

Accepted

Narrows [ADR 0161](./0161-a-public-page-is-shared-by-default.md)'s TTL, which stops being the thing
that decides freshness and becomes the backstop for when this isn't working. Takes over most of
[ADR 0177](./0177-the-item-list-is-a-walk-not-a-listing.md)'s weekly walk, and gives
[ADR 0179](./0179-a-stale-roster-is-a-reason-to-start.md)'s extra runs something cheap to do.

Numbered 0181 rather than 0180 because 0180 was already cited by work in progress elsewhere in the
tree; a gap is cheaper than two records under one number.

## Context

Every refresh this app performs is a **poll on a clock**, and both of them are guesses standing in
for a fact.

A cached page expires after `wikiPageTtlDays` and is fetched again whether or not a soul has touched
it. With the roster at 19,790 pages ([ADR 0178](./0178-a-mob-page-is-worth-its-own-fetch.md)) and a
fortnight's TTL, that is **19,790 re-fetches every two weeks** to discover that almost nothing moved.
And the roster is re-walked weekly — 228 listing requests — whether or not a page has been created.

The clock is also *bad at the job it is doing*. A page edited the day after we cached it stays wrong
for the rest of the fortnight; a page nobody has touched in two years is re-fetched twenty-six times
a year. The TTL is simultaneously too slow for the pages that change and far too eager for the pages
that don't, which is what a guess looks like when the real answer is available and unasked for.

MediaWiki has the other shape, and `everquest-legends-mcp` uses it where we don't
(`src/mediawiki.ts`, [neighbours](../neighbours.md)). Measured against eqlwiki:

| | polling | asking |
|---|---|---|
| Keeping 19,790 pages fresh for a fortnight | 19,790 re-fetches | **1,362**, found in **9** requests |
| Finding pages that did not exist, weekly | 228 listing requests | **6** (77 new, 15 not already known) |

**93% fewer page fetches, and the pages are fresher.** `$wgRCMaxAge` on eqlwiki is ~90 days, so the
window is wide enough that an install has to be away a very long time to fall out of it.

## Decision

**Ask the wiki what it changed, and let the answer decide what is stale — with the clock kept as the
backstop for when we have not asked.**

- **An edit invalidates a page; it does not fetch one.** The catch-up marks a held copy superseded,
  which makes `holds()` false, which makes its shard incomplete, which is *already* how the planner
  finds work ([ADR 0160](./0160-a-room-fills-the-catalogue-once.md)). No second fetch path, no
  priority queue, no new concept — the existing crawl simply has more to do and finds it the way it
  finds everything else.
- **Staleness is judged against the copy's own pull date, never against the cursor.** A page may have
  been fetched *after* it was edited — somebody opened it by hand, or a peer sent a newer copy under
  [ADR 0164](./0164-the-newest-copy-in-the-room-wins.md) — and re-fetching that is pure waste. The
  same comparison is what clears the flag on write, so a peer handing us a copy *older* than the edit
  does not quietly mark us up to date.
- **A new title is judged by the categories the walk reached.** The walk is what defines what counts
  as ours, so the incremental path applies that same set rather than a second rule free to drift from
  it — a page created straight into `Category:Fingers` is an item for exactly the reason the walk
  would have found it there. The categories ride in the harvest checkpoint. It costs one batched
  `prop=categories` lookup for the handful of unknown titles.
- **It runs at the start of every run, and has no timer of its own.** The roster walk runs only when
  the roster has expired; an edit is news at any time. Keeping it inside a run preserves
  [ADR 0153](./0153-the-catalogue-is-filled-by-a-gentle-trickle.md)'s rule as ADR 0176 left it —
  this fetches because a run is starting, and a run starts because somebody asked or because the room
  has something.
- **A failed catch-up is never fatal.** Nine requests is a cheap optimisation and must not become a
  single point of failure for a crawl that has a roster, a cache and plenty to do without it.
- **Silence only counts as evidence when we were listening.** This is the whole safety of the change.
  With a cursor inside retention, "the wiki has not mentioned this page" really is evidence it has not
  moved, and the ceiling is the full setting — whose **default rises from 14 days to 90**. With no
  cursor, or one older than the wiki itself remembers, that silence means nothing, and the ceiling
  drops back to a fortnight and the clock does the work alone exactly as before. A fresh install, an
  offline install and an install whose owner never starts a run all get today's behaviour rather than
  a ninety-day cache justified by news they never received.
- **`wikiPageTtlDays` keeps its meaning**, which is why only the default moved: it is the ceiling on
  how old a page may be, and change-tracking makes pages *younger* than the ceiling rather than older.
  Somebody who sets it to one day still gets a one-day refresh.

## Consequences

**A room's steady-state traffic falls by about 93%**, and this compounds with
[ADR 0160](./0160-a-room-fills-the-catalogue-once.md): the room already fetched each page once
between everyone, and now it re-fetches only the ones that moved. The heavy cost is the first fill,
which is unchanged.

**Pages get fresher, which is the part worth caring about.** An edit is picked up on the next run
rather than up to a fortnight later. A wiki correction to a drop rate now reaches the Hunt tab in
hours instead of weeks.

**A new page can reach the roster without a walk.** Most of what the weekly walk was for is now done
by nine requests, and the walk becomes the thing that catches what `recentchanges` cannot: pages
older than retention, re-categorisations, and anything the incremental path got wrong. It is
therefore still needed, and its week is unchanged.

**There is a new file and a new piece of state** — `changes.json`, holding the cursor and the
invalidation list. It is an optimisation record, not data: deleting it costs one wide catch-up and
a fortnight of clock-based expiry, and nothing else.

**A page can now be kept for ninety days**, which is a real loosening for anyone whose install
tracks changes but whose changes we somehow miss. The failure is bounded by the walk and by the
per-page ↻, and it is the accepted price of not re-fetching twenty thousand pages a fortnight to
catch the fifteen hundred that moved.

**Peers are unaffected in mechanism and better off in fact.** A shared page still carries its pull
date and the newest copy still wins (ADR 0164); what changes is that a copy nobody has invalidated is
now trusted for longer, so the room stops re-pulling pages it has no reason to doubt.
