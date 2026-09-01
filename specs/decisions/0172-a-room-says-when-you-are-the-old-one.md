# 0172: A room says when you are the old one

## Status

Accepted

## Context

[ADR 0171](./0171-a-shared-kind-states-what-a-row-is.md) moved the wire for the first time since the
room became a meeting place, and did it the careful way: every new field optional, both directions
degrading to the whole-kind exchange, a peer too old to send an epoch never sent one. Nothing breaks.

But "nothing breaks" is not the same as "nobody is worse off". An old client in a room of new ones
falls back to the whole exchange every time anything moves — correct, and quietly more expensive than
it needs to be — and it has **no way of knowing**. The room looks the same from the inside. The next
time the wire moves it may not be so gentle, and the failure will look identical: sharing that works
a bit worse, or eventually not at all, with nothing on screen to say why.

There is a hard limit on what can be done about this, and it is worth stating plainly because it
shapes the whole decision: **a client too old to understand a message is also too old to contain the
code that would notice.** Nothing shipped now can make an already-released build say anything. Every
install currently in the wild will stay silent for ever.

The app already tells people about new builds — `update-check.ts` polls the rolling release and
`UpdateBanner` offers a download ([ADR 0034](./0034-update-notification.md)). That answers a
different question from a different source, on its own schedule, and it may not have polled yet or
may have been dismissed.

## Decision

**The catalogue carries a protocol number, and a client that meets a newer one says so.**

- **`SHARE_PROTOCOL` is bumped by hand**, and only when the wire moves in a way an older peer is
  worse off for not understanding. Explicitly **not** the app version, for the reason
  [`data-provenance.ts`](../../src/shared/data-provenance.ts) already argues at length about its own
  revisions: CI stamps a build number into every push ([ADR 0064](./0064-every-build-has-a-number.md)),
  so comparing app versions would tell everybody they were incompatible with everybody, permanently,
  which trains a person to ignore the one notice that matters.
- **It rides on the offer envelope**, not on a catalogue line: it describes the client rather than a
  kind, and the catalogue already goes out every minute — so it self-heals for a peer who missed one,
  on the same argument [ADR 0145](./0145-a-room-checks-itself-and-needs-no-game.md) makes for the
  name beside it. A peer that names none is speaking protocol 1, which is every build before this.
- **The notice is only ever about us.** A peer on an *older* build raises nothing: it is not
  something the reader can act on, which is exactly [ADR 0143](./0143-a-notice-may-point-at-where-to-answer-it.md)'s
  second narrowing. A peer on a *newer* one means this install is the one falling back, and that is a
  thing a person can fix.
- **Once a session, coalesced.** Being behind is one fact about this install rather than one per
  peer, and catalogues arrive one per peer within seconds of joining — so it waits out the same
  debounce the offer notice uses, names everyone who is ahead, and never speaks again. Meeting a
  third protocol later does not re-raise it: you are behind either way and the thing to do has not
  changed.
- **It is not the only place it is said.** The Peers tab marks any row whose build differs from ours,
  in both directions, because `toasts.ts`'s standing invariant is that a notice that has faded is a
  notice nobody can go back to — and "why is sharing with Bran slow again?" is a question asked on a
  later evening.
- **It is not the update banner.** That one says a release exists and offers a download; this one
  says sharing with these specific people is degraded right now, and — per `toasts.ts` — its single
  action is navigation and nothing else.

## Consequences

This does nothing for anybody today. Its whole value is in the next wire change: from this build on,
a client that finds itself behind the room can say so, and the people left behind get told instead of
wondering. That is the deal being accepted — a feature that is inert on arrival by construction, paid
for now because it cannot be paid for later.

`SHARE_PROTOCOL` becomes a thing to remember to bump, and the cost of forgetting is silence rather
than breakage: peers keep working, and nobody is told they are behind. That is the safe direction to
fail in, and it is why the number is only about *saying*, never about deciding what to send —
compatibility is still negotiated field by field, exactly as ADR 0171 leaves it.

A room where everybody is current shows nothing at all, which is the intended resting state.

## See also

[peers](../peers/README.md) · [ADR 0171](./0171-a-shared-kind-states-what-a-row-is.md) ·
[ADR 0143](./0143-a-notice-may-point-at-where-to-answer-it.md) ·
[ADR 0145](./0145-a-room-checks-itself-and-needs-no-game.md) ·
[ADR 0034](./0034-update-notification.md)
