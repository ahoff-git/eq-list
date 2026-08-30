# 0161: A public page is shared by default, and carries its own age

## Status

Accepted

Follows [ADR 0160](./0160-a-room-fills-the-catalogue-once.md), which let a room divide the work of
filling the item catalogue. Narrows one rule from
[ADR 0141](./0141-the-room-is-a-meeting-place.md) — that every share kind is off until somebody
switches it on — for exactly one kind, and states the freshness rule the sharing made necessary.

## Context

ADR 0160 shipped the sharing behind a toggle, off by default, because that is what every other share
kind does. In use that is the wrong resting position, for a reason specific to this kind.

**A room only divides the work if the room is sharing.** The whole saving — 11,136 requests instead
of 55,680 for five people — requires everyone to have found a checkbox in the Peers tab *before*
pressing Fill. A co-operative scheme that most people never switch on is a co-operative scheme that
does not exist, and the one it costs is eqlwiki, which has no say in the matter.

And the reason the other kinds are off does not apply here. `watches`, `styles`, `lists` and `pins`
are things you *made*. `mobs`, `kills` and `respawns` are things you *saw*. `timers`, `buffs` and
`scores` are true about *your machine right now*. An item page is none of these: it is a copy of a
public eqlwiki page, byte-identical on every install, containing nothing about you at all — not what
you killed, not what you want, not where you were. There is nothing for "off by default" to protect.

Sharing also created a freshness problem that a fixed TTL was the wrong shape for. ADR 0160 had the
receiver stamp `fetchedAt` at the moment of arrival, to stop a peer pinning a page in somebody's
cache. That is safe against a liar and wrong about time: A shares to B on day 13, B to C on day 26,
and a page nobody has re-checked since it was first fetched stays permanently "fresh". A cache a room
fills in an afternoon could then sit unchecked against the wiki indefinitely.

## Decision

**Item pages share by default; a page carries its age with it; and any page can be refreshed by hand.**

- **The default lives in the kind table** (`ShareKindSpec.defaultOn`), so it is a property of the kind
  rather than a special case in the code that reads it — and it is `true` for `items` and nothing
  else. An **explicit** answer always wins in both directions: turning it off stays off, which is the
  entire point of having a toggle. Only the absence of one falls through to the default.
- **`fetchedAt` travels with the page, clamped to no later than the receiver's own clock.** The clamp
  is the safety — a peer claiming next year is refused and the page is treated as arriving now — and
  keeping the real age is what stops the relay from resetting the clock. A stamp in the *past* is
  taken at face value, because a page older than it claims only ever costs a re-fetch.
- **A page already past its TTL is not accepted at all.** Writing one would mean caching something
  immediately due for re-fetch, which is worse than not having it: the harvest would go and fetch it
  anyway, having already paid for the message.
- **Only pages inside their TTL are offered.** A stale page is not somebody else's problem to receive.
- **The TTL is a setting, defaulting to 14 days.** It was a fixed week. It becomes visible because
  the sharing makes it matter: eleven thousand pages filled in an afternoon and then relayed between
  people is a lot of data whose age nobody was previously in a position to think about. **One TTL for
  every kind of page**, not one per kind — two answers to "how old may a wiki page be" would be two
  things to keep in step for no gain. It is read per freshness check rather than captured, so
  changing it takes effect at once, including for a harvest already running.
- **A ↻ on every page header re-fetches that one page now**, whatever its age, and says how old the
  current copy is beside it. Per-page and not global: a button that re-fetched everything would be a
  three-hour job wearing the icon of a small one. The age is shown because it is the fact that makes
  somebody reach for the button, and knowing a page was fetched an hour ago is what stops it being
  pressed out of superstition.

## Consequences

**The room's saving becomes the default outcome rather than an expert setting.** Two people who both
open the Items tab and press Fill now split the work without either of them knowing the feature
exists. That is the behaviour the previous ADR described and did not, in practice, deliver.

**Something now leaves the machine without an explicit yes**, and that deserves saying plainly: it is
a copy of a public wiki page, it is offered only to peers already in the room (which still requires
`connectPeers`, still off by default), the toggle to stop it is in the same place as every other, and
the Peers tab names the family as *"Pages you've already fetched"* so what it is is legible. If that
trade ever looks wrong, the change is one field in one table.

**A page is now guaranteed to be re-checked against the wiki within its TTL**, however many peers it
passed through. The cost is that a heavily-relayed page can arrive with most of its life already
spent — which is correct, and which the fill simply re-fetches.

**Two weeks is longer than the week it replaces**, for mob, zone, quest and spell pages as well as
items. That is a deliberate simplification rather than an oversight: the wiki is edited slowly, the
old value was a constant nobody could see, and the ↻ now covers the case where a specific page is
known to have changed.

**A refreshed page is indistinguishable from any other.** It goes through the same parser, the same
cache write and the same era flag — so the escape hatch cannot become a second, subtly different
fetch path.
