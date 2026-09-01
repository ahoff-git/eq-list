# 0171: A shared kind states what a row is

## Status

Accepted

## Context

[ADR 0141](./0141-the-room-is-a-meeting-place.md) made the room a meeting place: a peer broadcasts a
small catalogue, and the data travels peer-to-peer on request. `SHARE_KINDS` has been the table every
rule is driven off since — label, family, cap, and a `read` per kind, so a kind with no reader cannot
be received and a new one fails closed.

That table said what a row must survive to be *received*. It said nothing about what a row **is**, or
what leaves. Both existed anyway, written by hand somewhere else, and the three consequences had
started to add up.

**A `give` could only ever be the whole kind.** `ask` names the revision the asker holds, and the
answer is either "unchanged" or every row. One tally moving out of five thousand means five thousand
tallies on the wire; a room of five sitting together for an evening exchanges the same unchanged
observations over and over. `items` escaped this, but only by being cut into shards
([ADR 0160](./0160-a-room-fills-the-catalogue-once.md)) — the right answer, built once as a special
case because there was no vocabulary for it to be the general one.

**Change detection cost a full re-derivation.** With no way to ask a store whether anything had
happened, the hub materialised every shared kind on a timer and `JSON.stringify`'d the result to
compare its length. For `kills` that is a scan of five thousand records, a projection, and a
serialisation — to keep a number. The minute tick was slow *because* of it, which is a rate limit
standing in for a question nobody could ask.

**And the projections had drifted out of the table.** The kill projection lived in `shareSources`,
the buff one was a special case inside the hub's `outbound`, and the respawn reduction was inline
beside them — three rules about what a kind is when it travels, none of them next to the reader that
checks the same kind coming the other way. The plottability test underneath the kill rule was written
out longhand in the map window too, where the same threshold decides what to draw.

Worth stating plainly, because it shaped what follows: **there was no duplication of *knowledge*
here.** The identity rules, the merges and the trust families were each already stated once and
argued for. What was missing was a way to *say* them in the one place a hub could read them from.

## Decision

**A shared kind states what a row is, and what leaves.** `ShareKindSpec` gains `rowKey` and
`project` beside `read`, and the hub exchanges deltas over them.

- **`rowKey`** is the row's identity, as a string that means the same on two installs. Content-derived
  throughout, because every `authored` kind has its ids regenerated on arrival and several kinds drop
  fields on the way out — an id would name nothing on the far side. `watches` declares none: a rule
  has no name and no surviving id, so its identity is its whole content, which is the digest the hub
  already falls back to.
- **`project`** is what leaves, run before anything is keyed or digested — so a change to a field
  that never travels does not make a row look changed to anybody.
- **A revision is a sequence.** Each row remembers the revision it last changed at and each departure
  leaves a tombstone, so "everything since `n`" is answerable from the hub's own state without
  keeping a copy per peer.
- **An `epoch` stamps the run.** A revision counter that restarts is a counter that lies, and this is
  what makes that detectable rather than silently wrong. Per-run and never persisted — a restart
  already cost one whole exchange, so nothing is made worse, and what deltas save is the *evening*.
- **A store may volunteer a `version`**, and where one does the read is skipped while it holds still.
  Optional by design: a store that says nothing behaves exactly as before, which is what keeps ADR
  0141's "nothing has to be wired" true.

**A delta is a saving on the wire and nothing else.** It is folded into what we hold from that peer
and the *whole* set is handed onwards, so `contributions.ts`'s five rules, the tray, and every
panel's merge receive precisely what they always received. No store learned what a delta is.

**It is refused whenever it cannot be trusted**, and every refusal falls back to the whole exchange:
a mismatched epoch, a `since` older than our tombstones reach, or nothing held for that peer.

**The fallback is the *old* exchange, not no exchange**, and that distinction is the whole of the
compatibility story. Epochs are compared, never required — two absent ones **match**, which is the
case of a peer too old to have them. Such a peer is asked the way it has always been asked (`since`,
no epoch) and answers "unchanged" to it; it is never sent a delta, and it never notices any of this
happened. Getting that wrong is not a broken room but a quietly expensive one: requiring an epoch on
the asking side cost an old peer the cheap answer and re-fetched their entire catalogue every time it
moved. It is pinned by a test in both directions.

## Consequences

A room sitting together exchanges what moved rather than what it holds. The kill log is read when a
mob has died rather than once a minute. `outOfDate` can now come out *equal* for observations — they
never reached the tray, so the held revision was always `undefined` and every pooled kind was
re-fetched in full every minute; that was a bug, and this is what fixes it.

The kill projection and the plottability test each have one home, and the map window imports the
latter rather than restating it.

**Two costs, both accepted.** This is a deployed wire protocol, so every new field is optional and
both directions degrade to the old exchange — which means the old whole-kind path stays, and stays
tested, rather than being replaced. And `since` is new untrusted input: it is bounded by the
tombstone floor and can only ever cause us to send *more*, never to read something we would not
otherwise read.

Deltas are per-run. A restart costs one whole exchange, exactly as it always did. Making them survive
a restart would mean a sequence number on disk in every shared store, which is
[the thing this decision deliberately does not do](./0132-a-contribution-is-keyed-by-who-made-it.md) —
the saving is in the evening, not in the launch.

`timers`, `buffs` and `scores` volunteer no version, and must not: they are views over a clock, so
their rows differ from one second to the next while nothing has been written, and a version that said
"unchanged" about them would be the one failure mode that loses data rather than costing a read.

## See also

[peers](../peers/README.md) · [ADR 0141](./0141-the-room-is-a-meeting-place.md) ·
[ADR 0132](./0132-a-contribution-is-keyed-by-who-made-it.md) ·
[ADR 0145](./0145-a-room-checks-itself-and-needs-no-game.md) ·
[ADR 0160](./0160-a-room-fills-the-catalogue-once.md)
