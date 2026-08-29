# 0151: A timer can be built from a kill, and a blank row says why it is blank

## Status

Accepted

## Context

Reported as "after recent changes to spawn timers (or maybe zones), it no longer tracks when you
kill that mob." Nothing in the rules had broken. Replaying the reporter's own stores — 4,559 kill
records against their saved `spawn-timers.json` — `noteKill` starts a countdown correctly for a camp
that has a figure (`a slime elemental`, 444s from a sighting, due to the second). All tests passed
before any change was made.

What the same replay showed instead was three named kills — `Lord Pickclaw`, `Princess Cherista`,
`Battlelord Paluk` — producing **zero** countdowns, and **14 of 20** camps on the board sitting at
`respawn: undefined`. [ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md) is why:
a camp with no figure has nothing to count down to, so `start` returns nothing. That is correct, and
it is *silent*, which is what turns a rule into a bug report.

Three separate things kept those camps blank, and only one of them is the mob's fault:

- **Killed once.** No two kills, so no gap. The overwhelming majority.
- **Every gap thrown out by the difficulty rule.** A gap whose ends were recorded in different
  variants of a zone measures the repop, not the mob (ADR 0092), so it is discarded. Measured on the
  reporter's log: 15 of 178 plausible gaps, and for `Princess Cherista` — `The Castle of Mistmoore`
  then `The Castle of Mistmoore 2 (Adaptive)`, 2h14m apart — it was *every* gap she had.
- **Gaps the player dropped themselves.**

On screen all three read *not timed yet*, with no way to tell them apart and no hint that the second
one had happened at all.

The way out was supposed to be **Add a timer**, and it had its own fault. The name field completed
against `useLogVocabulary` — the tail of the current log file, which answers "what words has the
game said lately?" A named killed that morning has scrolled out of it, so it was neither offered nor
recognised; and an unrecognised name read as **not a mob**, filing the row as a `custom` timer.
`add` skips the `said.named = true` claim for a custom row, so `noteKill`'s named gate then dropped
every future kill of it. A timer that could never track a kill, arrived at by typing the mob's name
correctly.

Meanwhile the kill log — the thing that actually knows what you have killed, where, and when — was
already in the renderer's hands and was not being asked.

## Decision

**A timer can be built from a kill you already made.** `recentCamps` folds the kill log into camps
(mob, place, raw zone, when it last died, how many kills), newest first, and the Spawn tab's add form
opens with a picker over them. Picking one fills the name and the place and settles the mob question
outright: the log recorded you killing this, which is proof no completer can offer. The tail
vocabulary stays for a name typed by hand.

**Every kill is offered, named or not.** `provenNamed` is the right gate for tracking something
*automatically*, where a wrong guess quietly fills the board. It is the wrong gate for a list a
person is reading and choosing from: whether a mob is worth a timer is the judgement they opened the
form to make, and hiding a mob they killed twenty minutes ago is the app being certain in place of
the one who was there. A peer's kill and a kill with no zone are still refused — their clock is not
yours, and a countdown has to be somewhere.

**A countdown built from a past kill counts from that kill.** `markDead` takes an optional moment,
used only backwards. Starting from the click instead put the whole interval on the board for a mob
that died six minutes ago — wrong in the direction that matters, since the figure is an upper bound
and the camper is waiting on its near end.

**And it is refused when that clock would already be spent.** `killStillCounts` asks first, on the
same grace `spawnState` uses. Without it, timing a three-day-old kill produces a timer that is stale
before it is a second old and is pruned without a word — the same silence this change exists to end.
The figure is still set, the form says so, and the next kill starts the clock.

**A camp the kill log already produced is not re-filed as hand-added.** Only its figure is set.
`add` would mark a learned camp as removable, and removing it would take the sightings, the padding
and the dropped gaps with it while the row itself came straight back from the log.

**A blank row says which blank it is.** `learnRespawns` counts gaps lost to the difficulty rule
(`crossedDifficulty`) and `untimedReason` turns the three cases into the sentence the row owes the
reader. A count, not a listing: the gaps themselves stay out of `gaps` for the reason given there —
nobody decided to drop them, and putting them back is not on offer — but "killed once" and "the
difficulty ate your evidence" want different things from the player, and saying which costs one
integer.

## Consequences

The three kills that produced nothing now produce three countdowns, verified against the reporter's
own stores.

`RespawnLearning` gains a required field, so both other places that build one — the tracker's blank
row for a hand-added camp, and a figure arriving from a peer — state `crossedDifficulty: 0`. A peer
sends a figure, not the workings behind it; claiming otherwise would put a sentence on the row about
a night we never sat through.

The difficulty rule itself is unchanged and still right: 15 discarded gaps out of 178 is the cost of
never letting a repop pass as a respawn, against a bound that only ever falls. What changes is that
the cost is now visible to the person paying it.

The picker is ordered by recency, so a busy camp's trash sits above the named you came for. That is
the honest order — the newest kill is the one you are most likely to mean — and typing narrows it,
including by place. Ranking nameds first was rejected for the same reason they are all offered: it
would be the app deciding what is worth timing.

`recentCamps` walks the whole kill log per read. It is memoised against the same `useKills` result
the tab already holds and runs only while the add form's tab is mounted; at 4,559 records this is
not measurable next to the IPC hop that fetched them.
