# 0181: A new install asks before it crawls

## Status

Accepted

Narrows one refusal in [ADR 0177](./0177-the-item-list-is-a-walk-not-a-listing.md) — *an install with
no roster learns nothing* — and completes what [ADR 0176](./0176-a-room-fills-itself.md) started, since
the install that gains most from a room was the one that used the room last.

## Context

ADR 0176 made a room fill itself, and said the biggest thing it buys is that *"a newcomer to a room
that has done the work catches up in minutes rather than hours"*. That is true of the **pages**. It
was never true of the **roster**.

A first run has nothing saved, so `start()` walks the category graph before it can ask anybody for
anything: 194 requests, and about three minutes before the first page. Every one of those requests
re-derives a list the room is already holding, title for title. Five installs joining a room over a
month pay it five times over to arrive at the same answer.

ADR 0177 could have fixed that and deliberately did not. It made a peer's shard titles travel, but
refused to let them seed an empty roster:

> *An install with no roster learns nothing. A roster invented out of a peer's message would make
> `hasRoster` true on an install that has never listed anything, and ADR 0176 depends on being able to
> tell that ignorance apart from emptiness.*

That reasoning is sound and stays. What it protects against is a roster appearing **by accident** —
a stray title arriving before anything has been walked, quietly turning "we know nothing" into "we
know one thing", which ADR 0176's gate would then read as a real answer.

The gap is that it also forbids doing the same thing **on purpose**.

## Decision

**A run that has no roster and can see a peer holding shards takes its roster from the room instead of
walking, and the walk still happens afterwards.**

- **The gate is somebody there *with something*.** A peer offering no coverage is another new
  install, not a source — so two fresh clients meeting each other both walk, rather than each waiting
  for the other. Alone, nothing about this changes: an empty room is crawled exactly as before.
- **`present` comes from the room while bootstrapping.** Our own roster is empty and would say there
  is nothing to do, so what *exists* is the union of what peers claim to hold (`roomShards`). It is
  re-read every pass, so a peer arriving mid-run adds its shards to the work.
- **The roster arrives as a side effect of the fill.** A shard `give` already names that shard's
  titles (ADR 0177), so asking for pages and asking for the roster are the same message. Nothing new
  crosses the wire and `SHARE_PROTOCOL` does not move.
- **A bootstrap is ADR 0177's refusal done deliberately**, and the flag is what distinguishes them.
  `learnRoster` still refuses to seed an empty roster in every other circumstance; it yields only
  inside a run that knows it has none, is asking for one, and has said so.
- **`listedAt` is left unset, so the roster reads as never walked.** This is what stops the room
  becoming a substitute for the wiki: ADR 0179's `rosterExpired` is immediately true, so the
  room-fill tick brings us back to walk it properly. A room that holds 60% of the shards gives a
  60% roster in minutes and the walk fills in the rest — rather than capping the catalogue at
  whatever the room happened to know.
- **If the room turns out to have nothing to give, we walk in the same run.** Peers too old to send
  titles (protocol 2), or that drop mid-run, would otherwise leave a bootstrap ending with an empty
  roster and a new install with no catalogue. Asking first is the point; asking *only* is not.
- **A walk clears the exhaustion verdicts.** "This shard cannot be completed" is a statement about
  the titles a shard held when it was judged, and a walk has just replaced them. It matters most
  here, where every shard was judged against an empty roster and would otherwise stay excluded from
  fetching for the rest of the run — but it was loose before this too, since the set outlived a run.

## Consequences

**Joining a room is now worth something from the first minute rather than the fourth.** A new install
with a well-stocked peer never lists a category at all before it starts receiving pages, and the
three-minute walk it used to open with is deferred until after the room has given what it can.

**eqlwiki stops paying for each new user's roster.** This is the same argument as ADR 0160's for
pages, applied to the list itself: the room re-derives it once between them rather than once each. It
is a smaller saving than the page crawl — 194 requests against 11,847 — but it is the part that used
to happen *first*, and therefore the part a newcomer felt.

**A bootstrapped roster is only as complete as the room.** Shards nobody in the room holds are not in
`present`, so they are neither asked for nor fetched during that run. The unset `listedAt` is what
makes this safe rather than permanent, and it is why that detail is load-bearing rather than
bookkeeping: without it, a new install could inherit a partial view of the wiki and never find out.

**A hostile peer can shape a newcomer's first roster**, since a bootstrapping install has nothing to
check it against. The exposure is bounded and brief: titles are only ever *added*, a bad one costs a
404 and lands in `failed`, and the walk that follows within the same session replaces the lot with
the wiki's own answer. It is a wider surface than ADR 0177's title-sharing, because there the roster
being extended was one we had walked ourselves.

**Two new installs meeting each other still both walk.** Correct, and worth stating because it looks
like a missed optimisation: neither has anything to give, and a rule that let them wait for each
other would have them wait for ever.
