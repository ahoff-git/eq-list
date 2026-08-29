# 0152: A camp arms its own alert, and a gap stops teaching after three hours

## Status

Accepted

## Context

Three complaints about the same feature, from the person camping with it.

**"It's the same zone, just a different difficulty — all of the mobs and spawns are the same."**
True, and already the rule everywhere it can be
([ADR 0059](./0059-a-zone-s-variants-are-one-zone.md)): one camp, one row, one pooled sample, one
map. The confusion was that the *one* place variants are told apart — a gap spanning a difficulty
change — did so **silently**, so a camp could sit at "not timed yet" with four kills behind it and
nothing on screen to say why.

Asked directly, the same player settled the underlying game fact: *"Each difficulty is its own
instance of the world. Mobs that die in one difficulty will be alive in another. Spawn timers should
be the same though. Kill mob1, switch difficulty, kill mob1 again — this should NOT be used as
evidence."* Their own log agrees, and quantitatively. At `kerran tiger spahi`: 52 same-difficulty
gaps with a shortest of **4m12s**, against 10 cross-difficulty gaps with a shortest of **1m** and a
median of **3m** — and every one of those ten was **the first thing killed after arriving** in the
new difficulty. Two distributions that would be identical if a difficulty change did not repop, and
plainly are not. So [ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md)'s rule
stands, unchanged, on evidence rather than assumption.

**"Super old kills should be used for location and 'last seen' but not for weighting spawn timers —
otherwise if I went to sleep and came back to kill it in the morning it'd assume it just spawned."**
The ceiling was twelve hours, chosen generously so a long placeholder cycle still taught something.
That is far past where a gap stops describing the mob and starts describing the player: you logged
off, you went to bed, you went to another camp, and none of it is in the log.

Followed by the caveat that stops this being a simple tightening: *"it is possible to have super
long spawn times but those usually rely on very special conditions and the user will need to set
those up manually or pull them from EQLwiki or something."*

**"Timers should show and try to make themselves as accurate as possible but not alert until manually
toggled or it becomes obvious that the player is camping it."** The first half was already true —
`notify` is off by default, and stays so. The second half did not exist: a player sitting at a camp
killing the same named all evening still had to go and find a checkbox for the thing they were
visibly already doing.

## Decision

**One ceiling becomes two, because they answer two questions.** `MAX_LEARNED_GAP_SECONDS` (3h)
bounds what a **gap between two kills** may teach. `MAX_RESPAWN_SECONDS` (12h) stays as the ceiling
on what a **deliberate observation** may record — marking a mob *up*, or *not up yet*, five hours
after it died is something a person did on purpose about a mob they already know is slow, and it is
the only evidence a long camp can gather. A hand-typed figure is bounded by neither and never was.

This is the direct answer to the caveat above: a long timer stays perfectly reachable — you type it,
or take it off the wiki, and nothing may overwrite it — while the app is forbidden from *inventing*
one out of a night's sleep.

Measured on the reporting player's 4,559-kill log, three hours costs **3 samples of 163**, leaves
every camp that had a figure with a figure, and moves no camp's shortest gap.

**A camp arms its own alert once you have killed it twice in one sitting** (`CAMPING_KILLS`). Two,
and *in one sitting*, is the player's own choice from three offered. The tally is in memory and dies
with the sitting — a fact about this evening, not about the world, which is the distinction the
whole tracker is built on — so `noteSitting()` clears it at a login line
([ADR 0054](./0054-a-sitting-is-a-login.md)) and a restart starts it again.

**Off is an answer, not an absence.** `notify(key, false)` now *stores* false where it used to delete
the entry, and only an entry that is **absent** — never asked — may be armed automatically. A camp
you switched off is never armed again, however long you go on camping it. That single property is
what makes an alert turning itself on acceptable at all.

**And it says so.** `armed` rides on the row (`· camping`, with the reason in the title) for exactly
as long as the app is the one answering. The moment the player touches the checkbox — either way —
it clears, because from then on the answer is theirs and there is nothing left to explain. An alert
that turns itself on without accounting for itself is a banner out of nowhere, which is worse than
the silence it was meant to fix.

## Consequences

The flow test that pinned *"silent until asked"* now pins the opposite for two kills in a sitting,
and a new one keeps the other half honest: a named killed **once** on the way past stays silent,
which is what `notify` being off by default has always been for.

**A camp previously switched off will arm itself once.** The old code deleted the key rather than
storing `false`, so an existing `spawn-timers.json` cannot distinguish "turned off" from "never
asked". Those camps read as never-asked on the first launch after this, and one of them arming is
the cost; turning it off again sticks for good. Not worth a migration, since the file has no record
to migrate from.

The difficulty rule is **unchanged**. What changed is that it is no longer silent: `crossedDifficulty`
counts what it cost and `untimedReason` says so on the row
([ADR 0151](./0151-a-timer-can-be-built-from-a-kill.md)), which is what the complaint was actually
about. `Princess Cherista` stays blank, and correctly — but now blank *with a reason*, and with a
figure one click away.

Three hours is a judgement, not a measurement, and it is the kind that wants revisiting against a
log from a server with genuinely slow nameds on ordinary conditions. If one turns up, this is the
constant to move — and `MAX_RESPAWN_SECONDS` above it is deliberately the one that need not move
with it.
