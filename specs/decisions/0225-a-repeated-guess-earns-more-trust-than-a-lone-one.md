# 0225: A repeated guess earns more trust than a lone one

## Status

Accepted

## Context

Every `FactionCause` this ledger attaches is, by ADR 0219 and ADR 0220, a guess from timing rather
than a fact the game states — and the dialogue variant carries a real limit neither `countsKill` nor
anything else here can close: nothing distinguishes an NPC's reply from a nearby player's `says` or a
private `tells you` (the module header of `faction-cause.ts`). The user's own framing of that limit,
after it had been raised repeatedly, was that a narrow window already makes a false match need several
independent rarities to coincide — "if the window is narrow enough, it shouldn't matter often enough
to worry about" — and then went further: "Log all of your guesses and if enough of them stack up, then
we can trust the guess."

That count already exists, as a side effect of unrelated work. `electron/faction-log.ts`'s `foldCause`
keeps a running `hits` tally on every `FactionCauseTally` — every faction hit ever correlated to a
given (kind, source) pair, folded forward across the feed's cap the same way a standing's `net` is
(ADR 0056). Nobody had read that count as evidence of anything; it was bookkeeping for the "top 3, +N
more" summary line. But it answers the user's question directly: if "Vira" keeps showing up as the
guessed cause of the same faction changing, across several *independent* hits, the coincidence story
(an unrelated player, a name collision) would have to repeat itself to keep producing that row — which
is a materially rarer event than producing it once. A kill's cause needs this far less (ADR 0027
already excludes a bystander's kill), but the same reasoning still applies to it for free.

This is not a new problem. `estimates.ts` already names the shape three other features converged on
independently — a hit-point bound, a respawn interval, a drop rate — all trusting a figure more as its
sample size grows, via one shared `confidenceOf(samples, scale)` ladder (`"thin"`/`"fair"`/`"solid"`).
Building a second version of that ladder for faction causes would be exactly the duplicated knowledge
`estimates.ts`'s own header was written to prevent.

## Decision

- **`src/shared/faction-cause.ts`**: `FACTION_CAUSE_SAMPLES: SampleScale = { fair: 2, solid: 4 }` — set
  far lower than drop-truth's 15/50 or spawn-timers' 3/8, because the reasoning is different: those
  scales ask "is this rate/interval precise yet", this one asks "would a coincidence have to repeat
  itself to produce this", and two repeats already says something. `causeConfidence(tally)` reads
  `FactionCauseTally.hits` through `estimates.ts`'s `confidenceOf` — no new ladder, the same one a
  respawn or a drop rate already uses. `causeConfidenceWhy(tally)` is the tooltip wording, naming the
  raw hit count behind every tier so "solid" never reads as proof, only as a repeated pattern.
- **UI**: `FactionPanel.tsx`'s `CauseGroup` (the Standings tab's per-faction breakdown) colors each
  cause's hit count by `causeConfidence` — a single hit stays the same dim `.muted` it always was;
  `"fair"` and `"solid"` step up to `--accent`, the same color (and the same `.md-rate` convention)
  the mob panel's own drop-rate confidence already uses. The Hits table is unaffected: a single hit has
  nothing to repeat yet, so there is nothing for this ADR to say about it.
- Deliberately **derived at render time from the existing `hits` count**, never a new stored field —
  the same "never store what render can compute" rule `ratePerHour` and `respawnConfidence` already
  follow. Nothing about when or how a `FactionCause` is attached changes; this only grades the
  *pattern* across every hit on record, never the lone guess.

## Consequences

- A faction whose likely-cause breakdown shows the same NPC across several hits now visibly reads as
  more trustworthy than a faction with a single, isolated dialogue guess — without claiming anything
  the ledger doesn't actually know, and without touching ADR 0220 or ADR 0221's own accepted text.
- `FACTION_CAUSE_SAMPLES` is, like the two time windows and `DIALOGUE_MATCH_MIN_SCORE` before it, an
  unverified starting guess rather than a measurement — nothing has yet checked how often two
  independent hits *actually* share a name by pure coincidence on a real log. Worth revisiting the
  moment one does.
- This does not, and cannot, distinguish which *specific* hit in a repeated pattern was the coincidence
  (if any were) — it only says the pattern as a whole is less likely to be entirely coincidental. A
  standing with exactly one dialogue-caused hit stays exactly as uncertain as ADR 0220 always said it
  was; this adds information only once there is more than one to compare.
