# 0154: Lucy's own name list is worth holding

## Status

Accepted

Narrows one refusal in [ADR 0124](./0124-lucy-is-a-second-opinion.md). That decision said of Lucy:
"**No index, no crawl, no mirror.** Lucy is far too large to mirror … There is therefore no fuzzy
search against it either: Lucy's own search is a literal substring match, so a misspelling finds
nothing — honest, for a source we can't hold a title list for." Every clause of that is still true
except the last one, and it turns out to be false for a reason nobody had checked: **Lucy publishes
the title list itself.** Everything else in ADR 0124 stands — the trust level, the politeness, the
gating on `askLucy`, and the refusal to crawl.

## Context

Lucy has no API and is a hand-written site from about 2004, so the working assumption was that
anything bulk would have to be scraped. Its `downloads.html` says otherwise. Fetched and measured:

- **`itemlist.txt.gz`** — 1.6 MB gzipped, 10.9 MB of CSV, **134,079 rows** of `id,name,lucylink`.
  The page describes it as a "Complete list of which item id matches which item name. Useful for
  matching guild loot systems to Lucy", regenerated daily. It is served straight off the filesystem,
  needing none of the session-cookie ritual the dynamic pages demand.
- It is **names only**. Lucy publishes raw *spell* data (with an explicit "welcome to use this data
  for non-commercial use, if they attribute the source") and **no equivalent for items**. There is no
  slot, no stat, no card in this file, and no advanced search anywhere on the site to ask for one.

Meanwhile the cost of not having it was being paid one request at a time. Every Lucy name search was
a round trip to someone else's twenty-year-old server, and — because that search is a literal
substring match — a misspelling reached it only to find nothing. `Dragon Dirk` finds no item on Lucy.

## Decision

**Mirror Lucy's published name list, and answer name searches from it.**

- **One download replaces an endless stream of searches.** It is a file the site offers for exactly
  this purpose, so taking it is accepting what is on the table rather than scraping around the edge
  of it. Fetched through the same polite queue, with its own longer deadline because it is megabytes
  rather than kilobytes.
- **Once held, a Lucy name search costs Lucy nothing at all.** That is *stronger* than ADR 0124's
  "a search is exactly one request", not weaker, and it is the main argument for this.
- **It makes the search fuzzy**, which is the capability ADR 0124 correctly said we could not have.
  `Dragon Dirk` now finds `Dragoon Dirk` — locally, and without asking Lucy about a spelling that
  would have found nothing there.
- **Two passes, because they cost differently.** A substring scan of 134,079 names is a few
  milliseconds and reproduces what Lucy's own search would have said; the fuzzy pass runs only when
  that came up short. The fuzzy pass is narrowed to names sharing the query's **first letter** —
  measured, that is the difference between ~1000 ms and ~45 ms of the main process, and main is where
  every window's IPC is served. The correction it gives up is a typo in the first letter, which is
  not how people mistype.
- **A cold mirror does not block anything.** The first search still goes over the wire and the
  download happens behind it; every search after that is local. Nobody waits two minutes for a 10 MB
  file to answer one query.
- **It is a name index and is described as one.** It carries no stats, so it cannot feed the Items
  tab's stat search — that is [ADR 0153](./0153-the-catalogue-is-filled-by-a-gentle-trickle.md)'s
  problem and is solved from the wiki instead.
- **A month's TTL, and it refuses to overwrite itself with nothing** — the same rule the wiki's
  mirrored indexes follow, for the same reason: a silently emptied index answers nothing, forever.

## Consequences

**Lucy is now cheaper to use than it has ever been.** The most common operation against it — "does
this name exist?" — no longer touches the network. That is worth more to a borrowed source than any
amount of throttling.

**A misspelling reaches Lucy's catalogue for the first time.** The third rung of search stops being
the one that punishes bad spelling hardest, which was backwards: it is asked precisely when the other
two failed, and a name you can't spell is a common reason they did.

**The mirror can be out of date, and quietly.** The file claims a daily rebuild; the live copy's
`Last-Modified` is about eight months old. For Classic-era ids, which were fixed twenty years ago,
this changes nothing — but a genuinely new item would be missing until the TTL, and the fallback for
a cold or stale mirror is the network search that always worked. `nameIndex()` reports the count and
the date so the app can say which it is rather than implying currency it doesn't have.

**Ten megabytes of names now live in the cache, and in memory once loaded.** That is the price of a
free search, paid once. It is held parsed rather than raw, because re-parsing 134,079 rows on every
process start to answer one query would be silly.

**It does not make Lucy more trustworthy.** These are still Live EverQuest's names, from a game this
one is not — the mirror finds `Cloak of Wishes` for a query about an item eqlwiki has and Lucy has
never heard of. Everything about where Lucy sits in the hierarchy, and about badging what comes from
it, is unchanged.
