# 0180: The wiki has a shape, and it moves

## Status

Accepted

Answers the open question left by [ADR 0177](./0177-the-item-list-is-a-walk-not-a-listing.md) and
narrowed by [ADR 0178](./0178-a-mob-page-is-worth-its-own-fetch.md) — *how do we reach an item the
wiki never filed as one?* Adds a fourth thing to the `items` share of
[ADR 0160](./0160-a-room-fills-the-catalogue-once.md), moving `SHARE_PROTOCOL` to 4.

## Context

ADR 0177 made the roster a walk down the category graph and gave it a weekly expiry, so the catalogue
now grows as the wiki does. But a walk can only find what the wiki has **filed**, and the closure
edge is where the wiki stops asserting that a page is an item. Measured: **3,744 ns-0 pages sit
outside every closure**, and a few hundred of them are genuinely items nobody categorised. From the
category graph they do not exist, and no amount of re-walking will ever reach them.

ADR 0177 named the obvious remedy and refused it. Hopping *sideways* from an item into the zone and
era categories it also sits in reaches 10,947 further pages, overwhelmingly mobs, and the two cheap
ways to tell an item from a mob before fetching both failed measurement: category membership is
precisely what is missing, and `Template:Itempage` appears on 47 of 60 mob pages because a mob
transcludes an item tooltip per line of loot. It closed by saying a third idea would be a new
decision.

Here is the third idea. **Those pages are not invisible — they are linked.** A zone page names what
is in the zone; a quest page names what the quest involves. We already fetch both kinds, for levels
(ADR 0163). Their links are a curated guess at *what exists*, they cost no request of their own, and
they point at exactly the pages a category walk cannot see.

## Decision

**Zone and quest pages carry their outbound links, and what those links point at is checked once,
by whoever gets there first, and the answer is shared.**

- **Two kinds carry a shape, not all of them.** Zones and quests, because they are curated lists of
  what exists and we fetch them anyway. Items and mobs are the *targets* of the discovery, and giving
  them links would raise their parse version too — 11,847 pages re-read instead of ~1,700, for links
  nothing would read. `MIN_PARSE_VERSION` is per-kind precisely so this choice is available, and it
  is the difference between a free upgrade and a very expensive one.
- **A link is a candidate, never a claim.** Nothing about a link says its target is an item; only
  fetching and parsing it says that. So the output is a *candidate set* — link set minus the roster
  minus everything already checked — and the module that computes it decides nothing else.
- **The expensive knowledge is the refusal.** For the overwhelming majority of candidates the answer
  is "not an item", and that answer costs a fetch to obtain and is the same for everybody. So a
  verdict is written down, kept on disk, and invalidated by `CACHE_VERSION` like a page — a parser
  that classifies differently invalidates what it classified.
- **Discoveries go through the roster's one door.** A candidate that parses as an item is handed to
  the same `learn` a peer's titles arrive by (ADR 0177), so it shards, travels, expires and is
  re-fetched exactly like any other title, and nothing downstream is taught where it came from. It
  counts into `found`, which already means "an item we had no record of".
- **A candidate that is not an item never enters the roster.** This is the one that would have been
  easy to get wrong. The roster drives `present`, and `mine` only sets a shard bit when every roster
  title in it is held — so admitting ~3,400 junk titles to find a few hundred items would leave
  shards permanently incomplete, `mine` permanently under-reporting, and the coverage ADR 0160
  coordinates on quietly decaying. Candidates live in their own book and only items graduate.
- **Exploring happens last.** A guess at what might exist is worth less than a page the roster says
  is missing, so the probe only runs once `planShardStep` reports `done`, at the same pace as every
  other request. It is not a way round the rate limit.
- **Refusals travel between peers**, on the shard `give` beside ADR 0177's titles. Without it every
  install in a room independently pays for the same few thousand dead ends, which is precisely the
  once-per-person waste ADR 0160 exists to end. A refusal is read exactly as a title is — same cap,
  same de-dupe, items-only — and it can only ever cause a fetch **not** to happen. It never removes
  anything, never contradicts a page we hold, and never over-writes a first-hand verdict of our own.
- **Peers spread out with no negotiation**, as they do for shards: the candidate list is sorted so
  everybody agrees what it is, and each peer starts at its own offset and wraps. That needs no
  message and no second hash — `shardOf` is already a well-mixed function of a string and is used
  here for nothing protocol-shaped.

## Consequences

**The catalogue can now reach items the wiki never filed**, which is the question that has been open
since ADR 0177 and the last structural gap in how the roster is built. How many is not yet known
beyond the measured ceiling — the honest claim is that a few hundred of the 3,744 are items and this
is the first mechanism that can find any of them.

**A one-off re-read of about 1,700 pages** — every zone and quest — to gain the `links` field. Roughly
half an hour at the default pace, paid once per install and once per *room* in practice, since pages
travel. Item and mob pages are untouched.

**`SHARE_PROTOCOL` moves to 4.** A peer speaking 3 sends titles without refusals: everything works and
they simply teach us nothing about the dead ends they have already checked, so we pay for our own as
before. A real degradation, and therefore a number (ADR 0172).

**A hostile peer can suppress discoveries.** Sending a refusal for a title that *is* an item stops us
checking it. The damage is bounded and one-directional: it can only prevent a discovery we might
otherwise have made, never remove a page, corrupt the catalogue, or affect anything already held —
which leaves us exactly where every install was before this existed. It expires with the verdict book
on the next parser version. This is a wider trust surface than ADR 0160's and it is documented here
rather than being folded in quietly.

**The verdict book grows without bound within a parser version.** A few thousand titles is a small
file, and it is cleared by any `CACHE_VERSION` bump. If the candidate set ever turned out to be an
order larger than measured, the cap in `wiki-shape.ts` would stop it becoming a slow way to discover
that something upstream is wrong.

**A page that becomes an item later is not noticed until the verdict book clears.** The wiki could
turn a red link into an item page next month and we would keep skipping it. The TTL that refreshes
pages does not refresh verdicts. That is the deliberate cost of not re-probing thousands of dead ends
every week, and giving a verdict its own expiry is the obvious thing to do if it ever bites.
