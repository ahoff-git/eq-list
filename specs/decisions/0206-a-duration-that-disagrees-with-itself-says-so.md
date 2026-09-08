# 0206: A duration that disagrees with itself says so

## Status

Accepted

## Context

Replaying [ADR 0202](./0202-two-mobs-sharing-a-name-get-two-debuff-rows.md)'s learned-duration
countdown against a real captured log measured the actual spread of confirmed rise-to-fade gaps:
charm ran 4s–140s (a 35× spread) across eight samples, mesmerize 1s–167s across 161. Neither session
had anything anomalous in it — this is what ordinary play produces, because a debuff's duration isn't
close to fixed the way a respawn is: mez ends the instant its target takes damage from *anything*,
including the caster's own other spells landing on it by accident, and charm periodically re-checks
its hold and can fail the very first check.

`tightenDuration`'s "shortest wins" ratchet was reasoned correctly for the failure it was built to
resist — recasting early, a fade line lagging by a tick — but it has no way to tell that failure apart
from an early break that has nothing to do with the spell's real duration. Against real variance this
size, the *first* sample is often the outlier, and the ratchet — by design — can never recover from
it: one unlucky early break locks the countdown at a few seconds for the rest of the session, and
every ordinary cast afterwards reads as expiring moments after it lands. A prediction that's wrong
that often stops being the safe failure `tightenDuration`'s own reasoning describes; it becomes the
thing a player learns to stop trusting, which costs the next warning that actually mattered.

`spawn-timers.ts` met the identical shape for kill gaps and already carries the answer: track both
ends (`Sighting`'s shortest and `RespawnGap`'s longest), and call a figure `erratic` when they disagree
past a ratio, reporting the spread rather than averaging it away. Its own ratio (`ERRATIC_RATIO`,
1.5×) is tuned for a respawn, which is close to fixed — any real spread there means something else is
going on. It does not fit a debuff's duration, where the measured 35×–167× spreads are the *ordinary*
case.

## Decision

**`DurationEstimate` gains `spreadSeconds`, folded the same way `spawn-timers.ts` folds a kill gap's
longest end** — `tighten(..., "lower")`, alongside the existing shortest-end fold. Nothing about the
shortest figure's own ratchet changes.

**`durationErratic` gates whether the shortest figure is shown as a countdown at all.** A single
sample is never erratic — there's nothing yet for it to disagree with, and refusing to show a first
honest sample would be a worse failure than trusting it. From a second sample on, the shortest and
longest are compared against a tolerance sized for *this* domain rather than borrowed from
`spawn-timers.ts`: `5×`, chosen because the measured real spreads (35× and 167×) are unambiguously
past it while ordinary closely-clustered variance stays under it — a debuff needs a far looser
tolerance than a near-fixed respawn timer, not the same number reused.

**Erratic falls back to exactly the "never learned" state**, in `DebuffOverlay.tsx`'s
`predictedRemaining`: no invented wording, no partial figure — the row shows elapsed time only, the
same honest baseline `BuffPanel` already keeps for every ordinary buff. This needed no new UI
vocabulary because the fallback already existed for a different reason and fits this one exactly.

## Consequences

A duration that keeps disagreeing with itself stops pretending to be a countdown and says only what
it can stand behind, matching the restraint `BuffPanel`'s own header already states for the general
case. A duration that agrees with itself — the common case once a spell has settled into its usual
resist/interrupt behaviour — still counts down exactly as ADR 0202 intended.

**The persisted figures already carry what this needed.** `durationSpreadSeconds` sits beside
`durationSeconds`/`durationSamples` on the same stored row, so a spell already erratic before this
shipped simply reads that way the first time it's asked, with no migration and no re-learning.

**A systematically short-biased spell — one that is *always* broken early, every single time, by the
same cause — cannot be told apart from a spell whose real duration genuinely is short**, because both
produce a tight, agreeing cluster of short samples. This is the honest limit of learning from gaps
alone: `durationErratic` catches disagreement, not systematic bias, and nothing short of correlating
each fade against a reason (damage landed, a resist check failed) — information this module doesn't
have — could do better.
