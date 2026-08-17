# 0094: A spawn timer is a window, not an instant, and the player sizes it

## Status

Accepted

## Context

[ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md) learns a named's respawn from
the gaps between your kills, and got the arithmetic right: the estimate is the **shortest gap ever
seen**, because you cannot kill a mob before it spawns, so every gap is an upper bound and a longer
one carries no information.

What it then did with that number was wrong. It stored a single `dueAt`, counted down to it, and
said **UP** — presenting a soft measurement of a soft thing as an instant. Three things in the game
widen the gap you observe, none of them visible to any parser, and none of them a bug we can fix by
reading the log harder:

- **A named may not be what spawned.** Plenty sit on a placeholder cycle. The thing that popped on
  time was a different mob, and your next kill of the *named* is several cycles later — so the
  "respawn" you measured is really a cycle length multiplied by however many pops it took.
- **A mob walks.** It can be up exactly on time and nowhere near your camp for minutes afterwards.
- **You are not a stopwatch.** You arrive when you arrive.

All three inflate the gap and none can shorten it. That is precisely what makes the shortest-gap
rule sound — and precisely what makes a single number a lie, because it means the shortest gap we
have seen is an upper bound of *unknown looseness*. Two kills 15 minutes apart and two kills where
one was a placeholder cycle produce the same-looking figure and deserve very different confidence.

The first version threw away the evidence that could tell them apart: it kept the shortest gap and
discarded the rest.

## Decision

**Both ends of the evidence are kept, and the spread is reported.** `RespawnLearning` carries
`longestSeconds` beside `shortestSeconds`. On its own a long gap means little — it is usually just
you arriving late — but *next to* the shortest it is the only measure available of how much the
estimate is worth. Gaps that cluster mean several independent arrivals agreed; gaps that disagree
mean the shortest is probably still nowhere near the truth.

**When the gaps disagree, the range leads and the figure doesn't.** Past `ERRATIC_RATIO` (half again
— a low bar, because a fixed respawn watched by a prompt player produces gaps within seconds of each
other) the row reads `15m–45m, from 3 gaps` rather than `at most 15m`. A reader who is shown `15m`
will camp to fifteen minutes however small the print underneath is.

**The caveat names causes, not a confidence score.** "Gaps this far apart usually mean a placeholder
cycle, a mob that wanders, or arriving late — treat it as a hint, and pad it." Each cause is
**actionable** in a way a percentage is not: a placeholder means camp the cycle rather than the
named, a walker means the padding is the fix, arriving late means kill it promptly a few times and
the figure tightens itself.

**A timer runs to a window, and the player sizes it.** `SpawnTimer` gains `watchFrom` — the by-time
less a per-mob `lead` — and `SpawnState` gains `window`, meaning *it might be up*. The alert fires
when the window **opens**, since being told early is the entire point of asking for it.

**We refuse to invent the lower bound ourselves.** This is the load-bearing part. There is no
observation that could support one: nothing in the log says how early a mob *might* pop, and a
fraction-of-the-estimate rule would be a guess wearing a measurement's clothes — the same mistake
[ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md) refused when it declined to
recover a named from capitalisation. The person at the camp knows whether this one walks and whether
it has a placeholder. So padding is **theirs, per mob, and zero by default** — with no padding the
`window` state never occurs and everything behaves exactly as the point-in-time countdown did.

**Padding re-arms a countdown already running.** "This one keeps beating me to it" is a thought you
have *while waiting for the pop you want the padding for*, so applying it next time would be
ignoring the request. It is clamped to the interval itself: a window opening before the kill would
be permanently open, which says nothing at all.

**A window opened retroactively has no moment to announce.** Padding a timer whose new window would
have opened in the past is armed silently, by the same rule that keeps a replayed log gap quiet —
generalised in `arm()` so every way a timer can come into being is covered by one check rather than
three.

**`up` does not mean "in front of you".** It means the by-time has passed, so on the evidence it
should have spawned. A mob that spawned on time and walked is exactly the case, which is also why
the grace period stays generous.

Rejected alternatives:

- **Averaging the gaps, or a standard deviation.** The gaps are not samples from a distribution
  around the truth; they are the truth plus an arbitrary, always-positive delay. Their mean and
  spread describe your evening. The *minimum* is the only statistic with a meaning here, and the
  range is worth showing precisely because it is a diagnostic of the observer, not the mob.
- **Detecting placeholders automatically.** A wide spread is consistent with a placeholder cycle and
  equally consistent with a player who wandered off. Guessing between them and acting on the guess
  would put a wrong number somewhere a hand-typed one is the only cure.
- **A global padding setting.** Padding is a property of a *camp* — this one walks, that one is on a
  cycle — so one number for every mob would be wrong nearly everywhere it applied.

## Consequences

- The tab now says out loud that a spawn timer is a soft thing, which is the honest position and
  also the less impressive-looking one. A range and a caveat read as the app knowing less than a
  bare number does; it knows the same amount and is admitting it.
- **Padding is the one knob**, and it absorbs every cause we can't measure. That is deliberate
  economy — a placeholder toggle, a "wanders" flag and a warning offset would be three settings
  that all resolve to "tell me earlier".
- A **placeholder cycle** still isn't modelled. `timerKey` is the seam it would go through — the
  whole feature keys off that string rather than off the mob — so a future "these names share one
  spawn point" mapping changes what goes into it and nothing downstream. Recorded in
  [ideas.md](../ideas.md) rather than built, because deciding which names share a spawn is exactly
  the kind of guess this ADR exists to refuse.
- `SpawnState` grew from three meaningful states to four, and `due` was renamed `up` — because with
  a window in play "due" had become ambiguous between "the window is open" and "the by-time has
  passed", and an ambiguous state name in a timer is how the two get conflated later.
- The alert wording forks once: a padded warning says "due soon" and an unpadded pop keeps the
  structured banner. Only where the default would otherwise be wrong, so there is one sentence to
  keep in step rather than two banners.
