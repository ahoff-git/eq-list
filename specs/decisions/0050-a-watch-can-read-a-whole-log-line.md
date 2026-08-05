# 0050: A watch can read a whole log line, not just a spell

## Status

Accepted

## Context

Alerts could only be raised for things the parsers model — a spell beginning to cast
([ADR 0035](./0035-cast-alert-overlay-window.md)) or one fading. But the log says a great deal more
that a player wants to be told about while the chat window is buried under a fight. The prompting
case: "BunnySlayer invites you to a party." Nothing parses that line, so nothing could alert on it.

The obvious fix — a `parseInvite`, an `InviteEvent`, a fan-out channel, an `onInvite` toggle on a
watch — buys exactly one message and asks for the whole chain again for the next one (a tell, a
trade, a faction hit). It also invents structure the alert never uses: an invite alert has nothing
to say beyond the sentence the game already wrote.

## Decision

**A watch may be pointed at raw log lines.** `CastWatch.onLine` matches the watch's text — the same
case-insensitive substring rule spells get — against the whole log line with its timestamp removed
(`matchLine`). A party invite is then a watch whose text is "invites you", carrying the same
enable/style/position machinery every other watch has, and the Settings "Suggested" chips offer it
(and a tell) by label, since the wording is the part nobody can quote from memory.

**The watcher offers every line, parsed or not.** `splitLine` already ran before the matchers, so
`log-watcher` emits the split `LogLine` on an `onLine` channel and then fans the typed event out as
before — no extra parse. Lines that *did* become an event come through too: a watch here is the
player saying "tell me when the game says this", and which sentences the parsers happen to model is
not their business.

**The line matcher keeps the liveness rule and skips the caster rules.** A line from last night is
not something to react to, so `LIVE_WITHIN_MS` applies as it does to casts and fades. `includeSelf`
and `includePlayers` do not: a line names no caster we can classify. `watchesLines` lets the main
process skip the match entirely when no watch is looking at lines, which is the common case and
runs per line.

**A line alert draws a different banner** — 💬, the log's own sentence, and no call to action —
because unlike "dispel!" and "re-cast!" there is nothing to prompt: the message *is* the content.

## Consequences

Anything the game prints is now alertable without touching the parser, and one mechanism serves the
next request instead of a new event kind per message. The player pays for that in aim: a careless
watch ("hit") matches thousands of lines a night, and nothing throttles it beyond the overlay's cap
of four banners on screen. The suggestions steer toward phrases that are rare by construction, and
a bad watch is one tick to turn off; a per-watch cooldown is the fix if it turns out to be needed in
practice.

Matching is a substring of the line, so it cannot tell *who* sent a tell from *what* they said, and
a watch for "invites you" fires whatever the tail of the sentence is — which is the point: EQ words
the invite differently across servers, and the short phrase survives both.
