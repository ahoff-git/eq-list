# 0164: The newest copy in the room wins

## Status

Accepted

Completes the freshness half of
[ADR 0161](./0161-a-public-page-is-shared-by-default.md), which made a page carry its own pull date,
and narrows one rule from [ADR 0160](./0160-a-room-fills-the-catalogue-once.md): that a page we
already hold is skipped on arrival.

## Context

ADR 0161 got a page's **age** to travel with it, so relaying between peers could no longer reset the
clock and make a room's cache immortal. What it did not fix is the other direction.

`acceptItems` skipped anything we already held. That was the obvious rule and it quietly wasted the
sharing: a peer who re-pulled a page from eqlwiki this morning **could not give it** to somebody
holding a copy from a fortnight ago. Every install expired its own copy independently and went back
to the wiki for the same page — which is exactly the duplicated fetching the room exists to prevent,
displaced from the first pull to every re-pull after it.

The TTL made this worse rather than better as time passed. A room that filled the catalogue together
on day one has, by day fifteen, N installs all re-fetching the same 12,900 pages within a few days of
each other.

## Decision

**A page from a peer is kept when it was pulled more recently than ours, and its pull date becomes
ours.**

- **Strictly newer.** An equal stamp is left alone — the common case is two peers holding the same
  page at the same age, and rewriting it would be a disk write per shard for no change.
- **The date is what is compared, not the content.** We have no way to tell which of two copies is
  *better*, and no business guessing: the one fetched later is the one closer to what eqlwiki says
  now, and that is the whole of the claim.
- **Their pull date becomes our expiry clock.** This is the point rather than a side effect: one
  person's re-pull refreshes the room, and everyone's TTL then runs from the freshest fetch anybody
  actually made rather than from whenever they happened to fetch it themselves.
- **A copy already past our own TTL is still refused**, as before. Caching something immediately due
  for re-fetch is worse than not having it — `holds` would say no and the harvest would go and get it
  anyway, having already paid for the message.
- **The clamp stays.** A stamp from the future is discarded by `readSharedPage` before any of this,
  so "newest wins" cannot be gamed into "mine wins for ever".

The **refresh path itself needs nothing new**, and that is worth stating because it looks like it
should. When a page expires here, its shard becomes incomplete, the planner sees a gap, and the gap
is filled the way every gap is: ask a peer who has it, and only fetch from eqlwiki if nobody does. So
expiry already routes a re-pull through the room first. This decision is what makes the answer that
comes back *useful* — carrying its real age, and replacing a staler copy rather than being dropped.

## Consequences

**Re-fetching stops scaling with the number of people, the same way first fetching already did.** A
room of five re-pulls each page roughly once between them per TTL rather than five times.

**A page can be newer than anything you fetched yourself**, which is the intended outcome and is
visible: the ↻ control shows the copy's age, and that age is now the room's best rather than yours.

**A stale-but-valid copy still doesn't get refreshed proactively.** The planner only asks for shards
we *lack*, so a fresher copy reaches us when our own expires, not the moment somebody else pulls one.
That is deliberate — chasing every refresh would mean re-asking for shards we already hold, which is
traffic for a page that is not yet wrong. Expiry is the trigger, and expiry is what the TTL is for.

**A peer who lies about a date now gets more than they did**: claiming "pulled a second ago" replaces
everyone's copy rather than merely being ignored. The bound is unchanged — the content is still read
through `readSharedPage`, still confined to catalogue page kinds, and still expires on our clock —
but the window in which a bad page sits in front of somebody is now up to a full TTL rather than
however long their own copy had left. It remains self-healing, and the ↻ remains the manual answer.
