# 0159: A refresh is not a rise

## Status

Accepted

## Context

`KnownBuff.rises` is documented as "how many times we've watched it go up — a rough *is this one you
actually maintain*". The panel shows it as `seen up N×`.

`rise()` already knew that a buff landing on a target that already has it is a **refresh**: the
instance keeps its identity and its `since`, because "how long have I had haste" is not restarted by
topping it up. The counter did not agree — it incremented on every landing sentence, refresh or not.

A bard song re-lands every few seconds. On a real log that read:

    Anthem de Arms        seen up 7,232×
    Hymn of Restoration   seen up 4,302×
    Brilliance            seen up 3,468×
    Feral Spirit          seen up 18×

The figure was not merely inflated, it was **inverted**: the buffs the player actually maintains sat
at the bottom of a list ordered by a number that mostly measured how long a bard stood next to them.

## Decision

**`rises` counts a buff going up, and a refresh is not one.**

The instance already makes the distinction — the same `existing?.up` that decides whether `since` is
kept now decides whether the count moves. One fact, read once, so the two cannot disagree about
whether this landing was a new one.

## Consequences

The same log now reads `Anthem de Arms 30×`, `Hymn of Restoration 4×`, `Feral Spirit 18×` — a figure
you can sort by and believe.

**It also stops the write.** Every pulse edited the stored row and scheduled a save; the debounce
absorbed the cost, but the churn was there and is now gone.

**A song is still a buff and still tracked.** Nothing here treats a pulsing effect as a special case
— it is counted the way everything else is, which is the point: the old number was special-casing
songs by accident.
