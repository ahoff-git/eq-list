# 0153: The catalogue is filled by a gentle trickle

## Status

Accepted

Revises one consequence of [ADR 0152](./0152-an-item-search-is-a-filter-with-your-own-yardstick.md),
which accepted a catalogue of whatever you had happened to open and said that a full index, if ever
wanted, "should arrive as a *supplied* data file that is checked rather than trusted … not as a
crawl". That was the right instinct and the wrong conclusion: **there is no supplied file to be had**,
and the measurements below make the fetch far smaller than the word "crawl" implied. Everything else
in ADR 0152 stands, and [ADR 0003](./0003-eqlwiki-runtime-data-source.md)'s "fetched at runtime, never
baked at build" is unchanged — this decides *when* the fetching happens, not where the data lives.

## Context

The Items tab searches items by their stats over the pages already cached. In practice that was
**290 of the wiki's 11,136 items** — about 2.5%. "The best ring I could wear" and "the best ring
among the two hundred pages I happened to click on" are different questions, and only one of them is
worth sorting by value. A stat search over 2.5% of the corpus does not fail loudly; it quietly
answers the wrong question, which is worse.

Three sources were checked for a way out, and two of them closed:

- **A supplied file, as ADR 0152 hoped.** eqlwiki is stock MediaWiki with no structured item data and
  no dump. There is no file to be supplied.
- **Lucy.** It really does have every item — 147,607 by its own statistics — and it really does
  publish a bulk download. But the download is `itemlist.txt.gz`: `id,name,lucylink`, and **nothing
  else**. Lucy publishes stat dumps for *spells* and none for items, and has no advanced search to
  ask for stats either: the only item control anywhere on the site is a single `searchtext` box.
  It also describes a different game — `Cloak of Wisdom`, in our own cache, is not in Lucy's list at
  all — so its names are not even the right roster for this wiki. (What that list *is* good for is
  [ADR 0154](./0154-lucy-s-own-name-list-is-worth-holding.md).)
- **eqlgs.net**, which used to offer an item search, is returning `HTTP 502`.

That leaves fetching the wiki's own item pages. Measured against the live wiki rather than guessed:

- `Category:Items` has **11,136 pages**, and the category listing costs 23 API calls (~9 seconds).
- One `action=parse` is **~90 ms of the wiki's time and about 3 KB**.

So the whole corpus is roughly 33 MB and about seventeen minutes of server time. At one request per
second that is a **~10% duty cycle sustained for about three hours** — less load than one person
browsing, and against this app's *primary* source rather than a borrowed one.

## Decision

**The catalogue is fillable, by an explicit, resumable, rate-limited trickle over
`Category:Items` — and it never runs unless someone presses the button.**

- **The roster is the wiki's own `Category:Items`**, not a name list from elsewhere. It is this
  game's items, it is exactly the set with pages to fetch, and it corrects itself as the wiki grows.
- **One request at a time, with a gap, defaulting to one second.** The pace is offered in hours
  ("Gentle — ~3h"), not milliseconds, because that is the unit the choice is actually about. It is
  adjustable within bounds, because how gentle to be with someone's server is a judgement the person
  running it may hold more strongly than a default can.
- **Nothing starts on its own.** No warm-on-launch, no "while you're idle". The button is the
  consent, and it is the only path in.
- **It resumes.** The place is checkpointed to disk after every fetched page, so stopping, closing
  the app or losing the network costs the page in flight and nothing else. `stop` is honoured between
  pages — never by abandoning a request mid-flight, which would leave a fetch we paid for unused.
- **A page we already hold costs no request and no gap.** Re-running over a filled catalogue takes
  seconds, which is what makes "check for new items next month" a reasonable thing to do rather than
  a second three-hour penance.
- **A failure is a row, not an end.** A page that 404s or won't parse is recorded by name and the run
  carries on. A dozen broken pages must not cost the other eleven thousand.
- **It reuses `getPage`.** The trickle is not a second fetch path: it goes through the same caching,
  the same `CACHE_VERSION` check and the same era flagging, so a harvested page is indistinguishable
  from one you opened by hand.
- **The schedule is a tested black box.** `electron/wiki/harvest.ts` takes its roster, its cache
  test, its fetch, its clock and its sleep as injected dependencies, so waiting, skipping, resuming
  and stopping are all pinned without a network or a three-hour test.

## Consequences

**The Items tab can answer its question honestly.** Filled, it searches all 11,136 items rather than
2.5% of them, and the strip above it says which of those two it is currently doing.

**Three hours is a real cost, and it is the user's to spend.** The panel says how long the chosen
pace will take before it starts, shows what it is fetching while it runs, and can be stopped at any
point without losing the work. Nobody discovers this having already happened.

**The wiki sees a new traffic shape, once per user.** A sustained hour-or-three of one request per
second is more than this app has ever produced. It is bounded, it identifies itself in the
User-Agent, and it is dwarfed by what the same 11,136 pages would cost if someone browsed them —
but it is worth stating plainly rather than discovering in a log. If eqlwiki ever asks us to stop,
the pace bound and the single entry point are what make that a one-line change.

**A filled catalogue goes stale slowly.** The pages carry the existing week-long TTL, so a second run
re-fetches what has expired and skips what hasn't. The wiki is edited rarely enough that this is a
monthly gesture, not a daily one.

**The corpus is now big enough to change the panel's own arithmetic.** Eleven thousand rows is
forty times what the table was built against; the row cap and the per-keystroke filter both hold at
that size, but the facet dropdowns (zones especially) get long enough that their filter box stops
being a nicety.

**It is still not every item in the game** — only every item eqlwiki has a page for. The wiki is
missing things this build drops ([ADR 0103](./0103-search-can-answer-from-your-own-log.md) exists
because of it), and no amount of fetching fixes that.
