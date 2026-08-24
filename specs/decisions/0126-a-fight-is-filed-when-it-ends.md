# 0126: A fight is filed when it ends, not when the next one starts

## Status
Accepted

## Context
`combat-stats.ts` closes a fight with a staleness check, and that check ran in exactly one place:
inside `record`, on the *next* event to arrive. So a fight that ended in quiet — which is how every
fight ends — was not closed by the quiet. It was closed by the next pull.

Everything downstream of `onFightEnd` inherited that delay: the fight reached
[history](../../electron/combat-history.ts) then, and its records reached the
[scoreboard](../../electron/high-scores.ts) then. A fight-level personal best — most damage in a
fight, best fight DPS, longest fight, most kills, richest fight — could only be claimed once you
pulled again.

Measured over one player's 26 MB / 315,000-line log (1,401 fights): a fight was filed a **median 32
seconds** after its own last damage, **161 seconds at the 90th percentile**, and in the worst case
**61 minutes**. Three fights in ten were filed more than a minute late.

That is invisible on an established install, where a full board and a full history sit behind the
lag. It is the *whole experience* on a **fresh install**, where nothing has been recorded yet: you
finish the best fight you have had, and the scoreboard goes on showing nothing until you pull again.
Read from the outside, that is the app tracking "until the start of a new fight rather than to the
end of an existing one" — which is precisely what it was doing.

The panel had already worked this out for itself. `DamagePanel`'s `useLiveFight` runs a wall-clock
timer so the heading flips from "This fight" to "Last fight" ten seconds after the last damage —
`LIVE_MS`, the same ten seconds as `SETTLED_END_MS`. So the app was telling the player the fight was
over at the right moment and filing it half a minute later, which is as close to a proof that the lag
was a bug rather than a policy as the code is going to offer.

Two things had to be settled to fix it, and both are the reason this is a decision rather than a
patch.

**Which clock.** The tracker deliberately has none: every span it measures comes from the log's own
timestamps, which is what makes a replayed evening land the same numbers as a watched one. Handing it
`Date.now()` would break exactly the two cases this app is built around — a
[replayed gap](./0044-the-log-position-outlives-the-app.md), whose lines are hours old, and
`scripts/replay-log.mjs --relative`, which writes an evening in seconds and whose whole purpose is
that time-measuring features read the log's gaps rather than the wall clock's.

**Over versus gone.** They read as one thing and are two. A damage meter's job between pulls is to
show you the last one; a history's job is to hold the fight as it finished. Filing a fight by
clearing its window would blank the panel ten seconds after every kill.

## Decision
**The tracker is told what time it is (`settle`), and files a fight the moment the log's own rule
says it is over — whether or not anything else has been logged since.** A filed fight stays on the
panel and takes nothing more.

## Consequences
- **`CombatTracker.settle(nowMs)`.** The tracker still decides *whether* a fight is over, by the
  same rule `record` applies — extracted into `quietBy`, so a fight cannot be filed under one reason
  and split under another. `settle` only supplies a clock. Idempotent and cheap: two comparisons
  when nothing has changed.
- **`src/shared/log-clock.ts`** is where that clock comes from: the newest log timestamp seen, plus
  however long ago it arrived. Live, that is `Date.now()` to the second; replaying, it stays anchored
  to the replay. `main.ts` feeds it from `watcher.onLine` and ticks `settle` once a second.
- **A fight is filed at most once** (`fightFiled`), so the next pull splitting the window, and a quit
  flushing it, are both no-ops on a fight already filed. `endFight` owns that guard, so there is one
  answer rather than one per caller.
- **A filed fight takes nothing more** (`openWindows`). A kill, experience, coin, a sale and a death
  recap all arrive out of band, none of them through `record`, and each has its own reason to arrive
  late — corpse coin is credited for two minutes. Once the snapshot history holds is final, a figure
  added to the window afterwards would sit on the panel describing a fight nobody will see again, so
  those go to the session alone. The evening's money is still whole; the fight's is closed.
- The lag is gone: over the same log, **median 11 seconds, 1,414 of 1,432 fights inside 15**, and the
  18 that take a minute are the *unresolved* ones the sixty-second rule exists for. The recorded
  numbers barely move — every category holds the same value bar `fight-xp`, which drops from 60.8% to
  41.8% of a level because it no longer sweeps up the experience of the pull after it.
- **`logIds` covers the fight's own lines.** Noting ran unconditionally, including for events the
  fight had *not* taken, so a range ran on to whatever last happened before the next pull — a
  median 122 raw lines against a 25-second fight, and in one measured case thirteen minutes of
  buffing and zone chat. [ADR 0021](./0021-stored-fights-keep-their-source.md) put that range on a
  stored fight so the source lines could be found and re-read, which a range full of somebody else's
  downtime cannot do.
- Not fixed here, and now the larger of the two: a **named pet's** damage is only yours once the pet
  confirms an attack order, and `pet-registry.ts` starts every launch empty
  ([ADR 0077](./0077-a-pet-is-proven-not-guessed.md)). Filing sooner makes it worse in a way worth
  stating: a fight summarized ten seconds after it ends has had ten seconds for the registry to learn
  rather than half a minute, and measured over the same log that takes the affected fights still open
  when the proof lands from **4 of 26 to 0 of 26**. Which is not an argument against filing on time —
  it is what showed that fixing it live was never going to be enough. Taken up by
  [ADR 0127](./0127-an-unknown-name-is-held-not-dropped.md).
