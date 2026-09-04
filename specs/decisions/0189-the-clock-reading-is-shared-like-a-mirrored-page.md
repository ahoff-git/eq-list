# 0189: The clock reading is shared like a mirrored page; the learned pace is never sent at all

## Status

Accepted

## Context

The game clock ([ADR 0186](./0186-the-game-clock-runs-forward-from-the-last-time-reading.md)–[0188](./0188-the-clocks-pace-calibrates-itself.md)) is single-player: it only ever learns from `/time` lines this install's own log produced. In a room where several people play together, that means each install separately re-learns the same server's pace from scratch, and the clock sits blank for anyone who hasn't personally typed `/time` yet — even though everyone in the room is looking at the same game clock.

Peer sharing (`src/shared/peer-share.ts`, [ADR 0141](./0141-the-room-is-a-meeting-place.md)) already has a shape for exactly this kind of fact: **`mirror`**, used today only by `items` — "neither made nor observed... a copy of a third party's public page... the same for everyone... applied silently on arrival" ([ADR 0160](./0160-a-room-fills-the-catalogue-once.md), [ADR 0164](./0164-the-newest-copy-in-the-room-wins.md)). A `/time` reading fits that description word for word: it says something about the server, not about the player who typed it, and there is nothing here for "off until asked" to protect.

The one thing that doesn't fit any existing shape is the **learned pace** (`rate`, [ADR 0188](./0188-the-clocks-pace-calibrates-itself.md)). Every existing family is either a pooled list of distinct events (`observation`), an ephemeral per-source view (`live`), or a single fact that's "the same for everyone once fetched" (`mirror`, replaced wholesale by whichever copy is newest). A learned rate is none of those — it's one number multiple sources have each independently estimated with different confidence, and there is no existing merge rule in this codebase for blending several such estimates into one.

## Decision

**Share the raw reading; never share the learned rate.** A new `gameTime` kind (`family: "mirror"`, `defaultOn: true`) carries exactly `{ hour, at }` — the same two fields `noteReading` already takes. On arrival, `game-clock-tracker.ts`'s new `notePeerReading(hour, atMs)` applies it through the *same* `learnRate`/`applyReading` pipeline a local `/time` line uses, with one added rule: **only if it's newer than the anchor already held** (`atMs > anchor.sampledAtMs`), mirroring ADR 0164's "the newest copy wins" exactly. `at` is optional on the wire and defaults to "just now" when absent, unreadable, or later than the receiver's own clock — the identical fallback `SharedItemPage.fetchedAt` already uses, reusing its reader (`readStamp`) rather than inventing a second one.

This sidesteps the missing "blend several rates" mechanism entirely: nothing ever computes a *peer's* rate and reconciles it against ours. Each install keeps deriving its own rate, purely from whichever stream of readings it has actually seen — its own `/time` calls interleaved with whichever of a peer's readings turned out to be newer than what it already had. Two installs in the same room converge on the same pace not because a number was compared and blended, but because they end up learning from much the same sequence of evidence.

`gameTime` needed one small carve-out from the existing rules, in `sawOffer`: automatic fetching (no person has to click) is normally `observation`-only, because *"an authored artifact fetched behind your back is a tray filling up with other people's work you never asked to see."* A `/time` reading isn't authored and isn't a tray item — it's applied straight into the clock, the same as `items` — so `sawOffer` now also auto-asks for `gameTime` specifically. `items` itself needs no such carve-out because it is never fetched through the ordinary ask/offer cycle at all — it has its own shard-addressed crawl (ADR 0160).

## Consequences

A room where at least one person occasionally types `/time` keeps everyone else's clock current without them ever running it themselves, and a late joiner's clock is seeded the moment they connect rather than starting blank. The pace each install settles on can still differ slightly between installs for a while — nothing forces them into lock-step — but they're drawing from an increasingly overlapping stream of evidence, and the debug log already added for the local learner works exactly the same whether the reading behind an update came from the log or from a peer.

The failure mode worth naming: a peer whose own clock is already substantially wrong (a bad early guess, or a genuinely different, unrelated server) can push a bad reading into an otherwise-good install, exactly as an item page from a peer who fetched it before ADR 0164's clamp existed could. The mitigation is the same one already in place — `learnRate`'s weighting means one bad reading only nudges the pace a little, never overwrites it outright, and a follow-up reading (from anyone) corrects course the same way it always would.
