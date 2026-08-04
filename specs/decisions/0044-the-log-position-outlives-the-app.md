# 0044: The read position outlives the app — a gap is news, not history

## Status

Accepted

## Context

[ADR 0030](./0030-history-is-not-news.md) pinned every log already on disk at its current length,
because reading one from the top replays a whole history as if it were happening now — 120 phantom
kills, re-counted experience, re-matched loot, and a cast alert for every spell that character was
ever hit with. [ADR 0043](./0043-state-is-not-news-either.md) then recovered the two lines that
describe the present (zone and last `/loc`) so a mid-session start knew *where* you were.

That left everything else still keyed to launch order. Anything logged while the app wasn't running
was skipped permanently: kills missing from the heatmap, drops missing from the loot feed and from
the shopping list's counts, experience gains never applied to "into level", survived hits never
considered by the health bounds. Quit and reopen and the app disagreed with itself. Two identical
installs watching the same character disagreed too, purely by when each was launched.

The flaw was in what "the past" meant. Position was remembered *in memory* — ADR 0030 said so
explicitly ("remembered offsets live in memory, so they last a session") — so on every start the app
could distinguish nothing finer than "before now". But there are three regions in a log, not two:
what we have already read, what was written while we weren't looking, and what comes next. Only the
first is history. The middle is news that is merely late, and every one of its events really happened
to this character.

## Decision

**Remember the read position on disk** (`electron/log-cursor.ts` → `log-cursors.json` in userData:
byte offsets keyed by resolved, lower-cased path). On `start`, a log we have read before resumes from
where we stopped; a log we have **never** read is still pinned at its end, because there we genuinely
cannot tell news from history — and on a first run there is no state to preserve anyway. Eating an
old log deliberately is still a separate, explicit action
([ADR 0033](./0033-eating-a-log-is-idempotent.md)).

**The gap is replayed through the ordinary live path.** No second pipeline: the watcher simply reads
those bytes and emits the same events, so kills, loot, experience, level-ups, combat and health all
land exactly as they would have. This is the whole reason the app's state stops depending on when it
was launched, and it needs no per-sink work.

**Exactly once, not at-least-once.** The position advances only after a batch's lines have been
emitted, and it is written through immediately rather than debounced — that ordering is what makes a
crash cost a repeated batch at worst, and the sinks that can't tolerate one (the shopping list's
counts) are the reason it isn't deferred. Kills and drops are keyed by their line anyway
([ADR 0033](./0033-eating-a-log-is-idempotent.md)), so they dedup even then.

**Alerts stay guarded, not suppressed.** `matchCast`/`matchFade` already refuse anything older than
`LIVE_WITHIN_MS` (30s), so a replayed gap raises no alarms without the replay having to know that
alerts exist. ADR 0030 called that guard belt-and-braces against "any future path that feeds old
lines in"; this is that path, and the guard is what makes it safe.

**The live meter is the one thing a gap can't simply extend**, because its totals mean "this
sitting". `isSameSitting` (5 minutes) decides: restart mid-camp and the meter carries on, which is
what "unchanged across a restart" has to mean; come back the next evening and it resets, with the
gap's fights already filed in history by `onFightEnd`. The threshold is deliberately loose — longer
than any restart, shorter than any break you'd call "later" — and it changes no stored number either
way.

**Announce the log before reading it.** The character's name comes from the filename and decides
which rows are yours; `start` now sets the watcher status *before* the first poll, or a whole
replayed session would be filed under the previous character.

**Switching characters resumes too**, which reverses ADR 0030's closing caveat that a log written
while it wasn't the active one is "skipped, not queued". It is now queued. Those events are real and
land once; nothing about that is the replay ADR 0030 was defending against.

## Consequences

The state is now a function of the log rather than of the launch, which is the property that was
wanted: restart mid-session and the app looks the same afterwards, close it for a night's play and it
catches up when it reopens.

Replay cost is a non-issue. Measured on a real 5.04MB log: 61,018 lines parsed in **87ms** (58MB/s),
so even an unusually long unattended stretch is well under a second and needs no chunking or progress
reporting. If that ever changes, the seam is one poll pass.

A crash still has a window — the batch between "emitted" and "recorded" — and the honest cost is a
shopping-list count that could tick twice for one drop. Writing through on every advance keeps that
window at one poll (500ms) rather than a debounce interval.

`log-cursors.json` is now load-bearing for correctness: lose it and the next start behaves like a
first run (anchor at EOF, miss the gap), which is the safe direction to fail in. Corrupt or
unreadable is treated the same way, and `clear()` makes "behave like a first run" deliberate.

Two consequences fall out of resuming a log we haven't been watching. A gap could contain a
`/loc` for a zone you have since left — [ADR 0043](./0043-state-is-not-news-either.md)'s rule that a
zone line clears any earlier position handles it, because the gap is read in order. And two
characters logged in at once would now genuinely interleave as the watcher follows whichever log was
written last, rather than one of them being silently dropped.
