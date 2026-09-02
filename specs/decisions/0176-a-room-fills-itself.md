# 0176: A room fills itself

## Status

Accepted

Completes [ADR 0160](./0160-a-room-fills-the-catalogue-once.md), which built every part of this
except the thing that starts it. Narrows [ADR 0153](./0153-the-catalogue-is-filled-by-a-gentle-trickle.md)'s
"nothing starts unless asked": a room with something to give is now an ask.

## Context

ADR 0160 divided the item catalogue into shards, put a coverage bitmap in the minute-tick offer, and
made `items` the one share family applied silently on arrival. All of it works. Answering an ask is
automatic and always has been — the hub serves a shard out of the cache with nobody involved.

**Nothing ever asks.** The only caller of `planShardStep` is the harvest run loop, and a run only
ever begins because somebody pressed a button — stated as a rule at the IPC boundary: *"Only ever
starts because a window asked it to — there is no 'warm this on launch'."*

So two people running the app, connected, each holding half the catalogue, sit there broadcasting
coverage bitmaps at each other every minute and neither one asks for anything. The saving ADR 0160
exists to produce is available, already paid for, and unreachable without a click on a panel most
people have no reason to open. "Joining a room is now worth something immediately" was the promise;
it was only true if you knew to go and start a fill.

Underneath that sat a second refusal, and it bit the exact install that had most to gain. `present` —
which shards the roster touches — is built only from the roster a previous run saved, because
`ensureShardIndex` deliberately does not fetch one: *"a tick that quietly listed a wiki category
would be exactly the 'nothing fetches unasked' rule broken by a background timer."* A fresh install
has no roster, so `present` is empty, every gap test answers "no gaps", and it advertises nothing and
wants nothing. A newcomer to a full room was the one client structurally incapable of catching up.

## Decision

**A peer holding pages we lack is reason enough to start filling, and the minute tick is where that
is noticed.**

- **The trigger is a comparison, not a reaction.** It runs in the hub's `reconcile()`, beside the
  same question asked of every other kind ([ADR 0145](./0145-a-room-checks-itself-and-needs-no-game.md)).
  Reacting to an offer *arriving* would only ever fire for whoever joined second; asking "do they
  hold something we lack?" on a tick is true for both sides of a connection and needs no event to
  have been seen.
- **The hub nudges; the catalogue decides.** The hub knows who is in the room and what they offer,
  and knows nothing about what a fill costs. So `items.fill()` is a nudge with no argument, and every
  gate — is a run already going, is it too soon, does the room actually hold anything we want — is
  the wiki client's.
- **"Is it worth waking up" is a different question from "what next", and needs its own answer.**
  `roomOffersMore` is not `planShardStep(...).action === "ask"`, because the planner needs a roster
  to answer at all. With a roster the test is exact: does any peer hold a shard `present` says exists
  and `mine` says we lack. **Without one it is "does any peer hold anything"** — an empty `present`
  on a fresh install is ignorance, not the absence of gaps, and reading it as gaplessness is what
  made a newcomer unwakeable.
- **A run started this way is an ordinary run.** It asks peers first and falls through to the wiki,
  exactly as a clicked one does, because a room can only ever hold what the room has fetched and the
  gap has to be closable by somebody. There is no peer-only mode: a second schedule would be a second
  set of bugs, and the planner already prefers a peer over the wiki at every step.
- **The roster is fetched, and that is the rule this changes.** `harvest.start()` lists
  `Category:Items` when it has no roster — ~23 requests at 500 titles a page, seconds — and that is
  now something a timer can cause. It is bounded, it happens once per install, and it is the price of
  a fresh install being able to receive anything at all. It is *not* the 11,136-page crawl, which
  still only ever runs because the room could not supply a shard.
- **The existing toggle gates it, and no new control appears.** *Item pages* already means "this
  family may cross between us" ([ADR 0161](./0161-a-public-page-is-shared-by-default.md)); it now
  gates asking as well as answering. Turning it off would otherwise still leave the room filling your
  cache. One home, one control ([ADR 0146](./0146-one-home-for-the-peer-network.md)).
- **A ten-minute floor between automatic starts, doubling to six hours when they achieve nothing.**
  The floor is because starting a run costs a pass over everything we hold — cheap once, wasteful
  sixty times an hour. The backoff is for a subtler failure that only exists once runs start
  themselves: **a room can look permanently ahead of us.** eqlwiki lists pages in `Category:Items`
  that 404; a shard holding one can never be completed; `exhausted` is per-run, so every fresh run
  retries it. A peer who also lacks that page still offers coverage we can never match, so the gap
  test says "yes, start" for ever — a fruitless eleven requests every ten minutes, indefinitely. A
  wake-up that gains no shard therefore doubles the wait and one that gains a shard resets it, judged
  off `mine` moving, which is the same self-assessment everything else here runs on. **A room that
  gains a peer resets it too**, because a long wait earned against an unfillable shard is plainly the
  wrong answer to somebody new arriving with a full catalogue.

## Consequences

**Two connected peers now converge with nobody pressing anything**, which is what ADR 0160 said
joining a room would buy and did not deliver. A newcomer to a room that has done the work catches up
in minutes, from the room, without ever visiting the Peers tab.

**A timer can now cause wiki requests, which was previously impossible.** Two kinds, and they are
worth separating. The roster listing (~23 requests) is caused directly by the tick. The page crawl is
not: it happens only once the room has been asked for every shard it holds, so an automatic run on a
machine whose peers are well stocked makes no page requests at all. The rule ADR 0153 wrote is
genuinely weakened, and the honest statement of the new one is *nothing fetches unless somebody is
there with something to give*.

**A peer can leave mid-run and the run continues into the wiki.** The room is the gate on *starting*,
not a leash while running: having decided the catalogue is worth filling, finishing it from the
source is the same crawl a person would have started by hand, at the same gentle pace, stoppable from
the same button. This is the accepted cost of not building a peer-only mode, and it is the one
consequence here somebody might reasonably want to revisit.

**A backed-off install can be up to six hours behind a peer's new pages**, in the worst case where
the room gained nothing for several rounds and no new peer arrived. The button is unaffected and
still fills immediately, which is the escape hatch; the alternative — retrying an unfillable shard
every ten minutes for ever — is worse traffic for worse reasons.

**A solo install is unaffected.** An empty room is a shut gate, so nothing about launching alone
changes — and that refusal is pinned by a test, because it is the property most likely to be broken
by a later well-meaning tidy-up.

**The catalogue owner's `fill()` is a nudge that may do nothing**, which makes it cheap to call and
impossible to call wrongly. That is deliberate: the alternative is the hub holding a copy of the
harvester's state and deciding on its behalf, which is the coupling ADR 0160 avoided by making
coverage the only thing that crosses.
