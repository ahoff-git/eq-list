# 0081: An alert can be scheduled, not just raised

## Status

Accepted

## Context

Every alert fired the instant it matched. That is exactly right for the prompt the feature was built
for — "a gnoll is casting Fear, dispel *now*" ([ADR 0035](./0035-cast-alert-overlay-window.md)) — and
wrong for a whole second class of thing the same log lines could tell you:

- You cast Mesmerize. The useful moment is not now, it's **25 seconds from now**: "recast it."
- A placeholder died. The useful moment is **8 minutes from now**: "it's back."

Both are timers, and timers are the largest feature we didn't have. The expensive way to get them is
the way every other tool did: a spawn catalog, a buff-duration table, a subsystem that owns a list of
running countdowns and a UI to show them. The cheap way is to notice that **the watch list already
says what the player cares about**, and that the only thing missing from a watch is *when*.

EQBuddy got there first and paid for two rules the hard way (`AlertDelaySeconds` and `IsCombatCue` in
`src/EQBuddy.Core/TrackedRule.cs`, see [neighbours.md](../neighbours.md)): only the alert may wait,
and a death cancels a short cue but not a long one. Both are worth borrowing rather than
rediscovering.

## Decision

**A watch carries a delay, and that is the whole feature.** `CastWatch.delay` holds what the player
typed — `25`, `25s`, `8m`; bare is seconds, because the common cue is seconds long — capped at 30
minutes. Empty or absent means fire now, which is every watch that predates the field. No timer
subsystem, no catalog, no new event kind: a cue is a watch that matched a moment ago.

**Text, not seconds, is what's stored.** The field can then be corrected mid-typing, and `8m` still
reads `8m` when the player comes back to it — a number would have to be formatted back into a syntax,
and there is no honest formatting of half-typed input. `parseDelay` is the single reader of the
syntax, exported so Settings can flag an unreadable delay *where it was typed* rather than by
refusing to save it. Unreadable text alerts immediately: a missed alert is the worse failure, which
is the same call `matchCast` already makes about an unparseable timestamp. Over the cap is **clamped**
rather than refused, because firing immediately is the one outcome nobody asking for a delay wants.

**Only the alert waits.** The meter, the HP estimate, the kill log and the ledger all take the line
the moment it is read; the queue is reached afterwards and delays nothing but the banner. An app that
held back its counters to match a cue would be lying about what it saw.

**A death cancels a short cue, not a long one.** "Recast the mez" is noise from a corpse; dying does
not move a spawn. The split is the delay's own length — `COMBAT_CUE_WITHIN_SECONDS` (60s) — rather
than a second toggle, because one field is the entire appeal of the feature and the two kinds of cue
really do differ by an order of magnitude. It is derived, documented, and said in the field's tooltip.

**The split is a pure decision and a small holder.**
[alert-schedule.ts](../../src/shared/alert-schedule.ts) is "what should fire, and when" — the syntax,
the cap, the combat-cue rule — pure and tested beside `cast-alerts.ts`, which stays about *matching*.
[alert-queue.ts](../../electron/alert-queue.ts) is the timer that carries it out and the only state
involved: what is still waiting, so a death can drop the cues it makes pointless and switching alerts
off can drop all of them. Its timers are injected, so an 8-minute cue is tested in a millisecond. An
alert with no delay creates no timer at all, so the path that existed before cues is unchanged.

**A cue in flight belongs to the moment it matched.** It keeps the payload it was scheduled with, and
editing or deleting the watch afterwards does not reach it — the same call `alertStyle` already makes
about a style ([ADR 0035](./0035-cast-alert-overlay-window.md)): an alert reports what was true when
the log said it.

## Consequences

The watch list is now a timer list, for one text field and one `setTimeout`. A recast reminder, a
respawn cue, "your buff is about to drop" and "the port lands in 30s" are all the same mechanism as
"dispel now", and every one of them inherits what a watch already has: its own colour, sound,
position, wording, and the Test button.

What the player pays: **a cue's banner looks like an immediate alert.** Nothing on screen says "this
is about something that happened eight minutes ago", so a delayed watch nearly always wants a
`message` — `RECAST MEZ`, `PH UP` — which is the field that already exists for exactly this reason
([ADR 0050](./0050-a-watch-can-read-a-whole-log-line.md)). The alternative was a marker in the
payload and a second banner style, which is more surface than the honest sentence the player writes
themselves.

The **Test alert** button stays immediate. It answers "what will this look and sound like", and
waiting eight minutes to find out is not an answer.

One ordering wart, from the watcher offering a line on `onLine` *before* it parses it
([ADR 0050](./0050-a-watch-can-read-a-whole-log-line.md)): a raw-text watch on your own death line
schedules its cue just before the death is noted, so a *short* cue there is cancelled by the very
death that raised it. A post-death reminder ("re-buff", "run back") wants a delay over a minute
anyway, and that one survives. Fixing it properly would mean threading the line's id through the
alert payload to exempt cues from the same line — more machinery than the corner deserves.

Nothing rate-limits a cue any more than it limits an immediate alert, so the open question about a
per-watch cooldown stands and now has a second reason behind it: a careless watch with a delay
queues its noise instead of merely making it.

Two neighbouring facts, recorded so they're found before someone builds on this: **many classic buffs
are permanent on Legends** (eql-alerts ships the list), so a "recast it" cue for one is pure noise;
and **plenty of spells fade silently**, for which a delay cue is the only honest tool — both in
[todo.md](../todo.md).
