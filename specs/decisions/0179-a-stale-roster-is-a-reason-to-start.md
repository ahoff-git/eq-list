# 0179: A stale roster is a reason to start

## Status

Accepted

Makes good on [ADR 0177](./0177-the-item-list-is-a-walk-not-a-listing.md)'s weekly walk, and adds one
reason to the tick [ADR 0176](./0176-a-room-fills-itself.md) built. Corrects 0176's roster cost, which
0177 changed underneath it.

## Context

ADR 0177 decided that a roster older than a week is walked again, and deliberately gave it no timer:

> *It needs no timer of its own — a run already starts on the button and on the room-fill tick
> (ADR 0176), so the check happens whenever one begins.*

**On the room-fill tick, one never begins.** ADR 0176 gates starting on `roomOffersMore` — does a peer
hold a shard our roster says exists and we lack? An install that has finished filling holds every page
its roster names, so there is no gap, so the answer is no, for ever. `rosterStale` is consulted inside
`start()`, and `start()` is never reached.

The result is the failure 0177 was written to end, reintroduced one level up: an install that filled
automatically and whose owner never opens the Items tab freezes on the roster it first walked. New
items are not fetched, not asked for, and not counted missing. **Nor do they arrive from peers** — a
peer holding a new item in a shard we consider complete produces no gap either, so 0177's travelling
titles never get asked for. The catalogue reports itself full and is quietly wrong, which is the exact
shape of bug 0177 called out as worth a record: *"a missing title is not an error"*.

It matters because the wiki is not finished. Items are still being added to the game, so a roster is a
photograph of a moving subject and every install that trusts one indefinitely drifts further from it.

## Decision

**The room-fill tick starts a run when our roster has expired, as well as when a peer holds something
we lack — and the room still gates both.**

- **A stale roster is a reason no coverage test can see.** `roomOffersMore` compares what the room
  holds against what we hold; roster expiry is a statement about what neither of us has heard of yet.
  They are different questions and the tick has to ask both, so `harvester.rosterExpired()` sits
  beside it as a peer reason rather than being folded into it.
- **The harvester answers it**, because the roster and its date are its own state. The alternative —
  the wiki client reading `harvest.json` for a date the harvester also reads — is two sources of truth
  for one fact.
- **No roster at all is still not "stale".** There is nothing to refresh, and a first walk happens
  because a run started for another reason. This keeps 0176's "ignorance is not emptiness" distinction
  in the one place that already made it, rather than teaching a second caller the same subtlety.
- **The room remains the gate, including for this.** Walking the category graph unprompted is exactly
  the traffic 0176's gate exists to prevent, and a stale roster is not an emergency. So a solo install
  never walks on a timer; it refreshes from the button, which — since 0177 — genuinely does what
  *Check for new items* says it does.

## Consequences

**A room's catalogue now grows with the wiki rather than freezing.** Once a week, whoever is in a room
together re-walks, and 0177's travelling titles spread what they found — so the room pays the walk
roughly once between them instead of once each, and an item added to the wiki reaches every peer that
sits in a room.

**A timer can now cause a category walk: 194 requests, about three minutes** at the default pace. This
supersedes ADR 0176's figure of "~23 requests at 500 titles a page, seconds", which was true of the
flat listing 0176 was written against and stopped being true when 0177 replaced it with the walk. It
is bounded to at most weekly per install, is gated on somebody else being there, and in a room is paid
once rather than per person. It is still the largest single thing this app does without being asked,
and it is the price of a catalogue that does not silently rot.

**A solo install's catalogue still freezes until somebody presses the button.** Deliberate, and the one
consequence here worth revisiting: the alternative is every install in the world walking eqlwiki's
category graph on a weekly timer with nobody having asked, which is worse for eqlwiki and worse for
the promise 0176 made. The button is honest now, and the Items tab says what the last walk found.

**A fruitless weekly walk feeds the backoff.** A walk that finds nothing gains no shard, so ADR 0176's
doubling reads it as a wasted wake-up and stretches the wait. That is harmless — `listedAt` is fresh
either way, so the reason does not re-fire for another week — but it means the interval between
*automatic* runs on a quiet, filled install drifts up to the six-hour cap rather than sitting at ten
minutes, which is the right direction for something with nothing to do.
