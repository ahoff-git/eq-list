# 0027: Only your own kills count, and the log has to say whose they were

## Status

Accepted

## Context

[0023](./0023-kill-heatmap.md) and [0024](./0024-mob-knowledge.md) both assumed every recorded
kill was the player's. It isn't.

The kill log recorded every death the log reported. EQ reports the deaths it can see, not the
ones you caused, so "X has been slain by Y!" is as likely to be a stranger's kill, an NPC guard
doing its job, or a mob killing someone's pet. Replaying a real 13,000-line log through the
shipped code:

- **317 kill lines → 317 records.** 43 of them (13.6%) were killed by someone else — seven by
  one passing player alone.
- **Five records were the player's own pet dying.** `combat-stats` had always filtered those;
  the kill log never did, so "Kainos`s warder" appeared in mob knowledge as a mob farmed five
  times that drops nothing. The two trackers disagreed about what a kill was.
- **Three mobs were recorded under two names each** ("rogue cleaner" 7 times, "Rogue cleaner" 7
  times). EQ capitalizes a name at the start of a sentence, so which message form fired decided
  the spelling. `combat-stats` had a first-spelling-wins registry for exactly this; the kill log
  didn't.
- **38 kills were placed using a `/loc` from a different zone** — Kerra Isle kills plotted at
  Steamfont coordinates, because zoning doesn't invalidate the last fix.
- **`drops` counted loot lines while being defined as "kills that dropped it"** and used as the
  numerator of a per-kill rate. A corpse yielding two of an item could therefore produce a rate
  above 100%, which is not a probability.
- **Every drop attached to the newest matching corpse.** 137 of 196 loot lines had more than one
  candidate corpse, so at a camp all the loot piled onto the most recent kill and its neighbours
  recorded nothing — the two bugs were partly cancelling each other out.

Left alone, the visible symptom is drop rates that are quietly wrong in both directions and a
heatmap containing other people's business.

## Decision

**The parser reports who landed the killing blow.** `KillEvent.killer` is captured from the
line; only the reader can decide what to count, and it can't decide without knowing who swung.

**A kill record carries `killer` and `mine`.** Your own death (and your pet's) is not a kill at
all and isn't recorded — and stored records that were, are dropped the moment the player's name
becomes known, because that is the first point at which they can be recognised.

**Someone else's kill is kept, but never counted as yours.** It is still evidence the mob spawns
here, which is most of why the log exists. It is excluded from drop rates (you never had the
corpse to loot) unless you looted it anyway — the loot is proof you had it — and its position is
believed half as much, because your `/loc` is evidence about where *you* were standing.

**A position fix belongs to the zone it was taken in.** Fixes are tagged and only used to place
kills in the same zone. Zoning is a teleport: the last fix from the zone you left is not a stale
position, it's a wrong one.

**`drops` counts kills, not loot lines**, matching the definition it always had. A drop attaches
to the newest candidate corpse that isn't already holding that item, falling back to the newest
when they all are — two identical items and two corpses is far more likely one each than both
from one, and a corpse that really gave two still records both.

**One mob has one name.** The first-spelling-wins registry moves to
`src/shared/name-registry.ts` so the damage meter and the kill log share it rather than one
having it. The kill log seeds its registry from stored records, so the canonical spelling
survives a restart.

## Consequences

Drop rates are computed over kills you could actually loot, so they mean what the label says.
The same real log now yields 323 records from 332 lines, 39 marked as someone else's, no pet
records, no duplicate spellings, and no drop count exceeding its kill count. Positions dropped
from 243 to 202 — the 41 that went were placed in the wrong zone.

Records written before this carry no `killer` or `mine` and are counted at face value: the
information needed to re-judge them was never written down. Pet records are the exception and are
pruned, since the mob name alone identifies them. So a long-standing kill log stays slightly
generous about kills that weren't yours, and self-corrects as new kills replace old.

Group play is the uncomfortable case. When a group-mate lands the killing blow the log looks
exactly like a stranger's kill, and nothing distinguishes them — so those kills only count once
you loot the corpse. A group that lets one player loot will under-count the others' rates. Fixing
it properly means correlating kills against who was damaging the mob, which the kill log doesn't
see; it's a real limitation, recorded rather than papered over.

The confidence penalty for someone else's kill is a halving, chosen to match the existing
movement penalty rather than measured. A stranger's kill off a perfectly fresh fix still plots,
one rung down.
