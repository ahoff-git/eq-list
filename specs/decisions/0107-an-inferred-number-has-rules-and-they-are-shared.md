# 0107: An inferred number has rules, and they are shared

## Status

Accepted

## Context

Almost nothing this app knows is a fact the game states. A drop rate is a handful of kills, a
maximum hit-point total is what you happened to survive, a respawn is the gap between two deaths.
Every one is a **guess with a shape**, and the shape keeps turning out to be the same one.

Three features arrived at it independently, none of them looking at the others:

- **Maximum hit points** ([ADR 0018](./0018-inferred-max-hit-points.md),
  [ADR 0031](./0031-an-inferred-bound-must-be-able-to-fall.md)) — `atLeast` from damage you
  survived, `atMost` from what killed you, a `stated` figure that outranks both, a sample count, and
  **levelling** throwing the observations away.
- **Spawn timers** (ADRs 0092–0099) — an upper bound from kill gaps and sightings, a lower bound
  from "it's not up yet", a typed figure that outranks both, a sample count, and a **difficulty
  change** throwing the observations away.
- **Drop rates** ([ADR 0024](./0024-mob-knowledge.md),
  [ADR 0025](./0025-observation-over-the-wiki.md)) — a figure that may only lead once the sample is
  big enough, and that says which source is speaking either way.

Two bounds, an override, a sample count, and an event that invalidates the evidence — written three
times, in three vocabularies, with the reasoning re-derived each time. The spawn-timer work then
found bugs in its own copy that the others are equally exposed to: an implausible observation
*clamped* rather than discarded is permanent against a ratchet, and a bound with no way back is a
figure nobody can correct.

## Decision

**The rules live in [estimates.ts](../../src/shared/estimates.ts), named, with the reasoning
attached.** Five of them, each a *decision* rather than arithmetic — which is why each is a function
with a paragraph rather than an inline expression somebody later "simplifies":

1. **A bound only moves one way** (`tighten`). Evidence tightens it; nothing loosens it.
2. **So an implausible observation is discarded, never clamped** (`plausible`). Against a figure
   that only moves one way, a clamped value is a wrong answer you can never take back, where a
   discarded one costs nothing but itself. The two functions are deliberately separate so a caller
   cannot ratchet on a value it never vetted.
3. **What the player said outranks what we worked out, and never destroys it** (`settle`). It takes
   the inference as an argument rather than replacing it, which is what lets clearing an override
   restore the inference instead of leaving a blank
   ([ADR 0056](./0056-a-dropped-record-keeps-what-it-taught.md)).
4. **Sample size is part of the figure** (`confidenceOf`). "1 for 1" and "40 of 120" are not the
   same claim, and a display that shows them identically is lying by omission.
5. **Sources that disagree are reported, not resolved** (`contradicts`, `disagrees`). Crossing bounds
   mean one side is *wrong*; a wide spread means the figure is *soft*. Neither is resolved here,
   because which side is wrong is usually a fact about an evening the app did not attend.

`tightestOf` carries the sixth, smaller rule that kept being needed with them: when several sources
claim the same quantity, the tightest wins **and says which source it was** — "seen up three times"
and "from three kill gaps" are worth different amounts to a reader.

**Everything works on plain numbers.** This is the load-bearing choice. Each caller already stores
its evidence in the shape its own domain wants — `atLeast`/`atMost` as bare fields, a sighting as
`{seconds, count}` — and a shared *record* type would have forced every one of them to migrate what
is on disk in order to gain rules they can have for free. The rules are the reusable part; the
bookkeeping around them is nobody else's business. It also makes the module unit-agnostic: hit
points, seconds and copper are all just numbers.

**Spawn timers are converted, and are the proof.** An abstraction with no user is a guess about what
would have been useful. `spawn-timers.ts` now gets its ratchet, its plausibility check, its override,
its contradiction and its source-picking from here, and its whole test suite passed the conversion
unchanged — which is the only evidence worth having that the shapes really were the same.

**The other two are deliberately *not* converted.** `hp-estimate.ts` and `drop-truth.ts` are pinned
black boxes with their own tests and, in drop-truth's case, a corpus tally behind its thresholds.
Rewriting working, tested inference to adopt a module written this week would be paying a real risk
for a tidiness nobody asked for. What they gain is the *option*: the next change to either can take
the rules instead of re-deriving them, and the reasoning is now somewhere findable rather than
distributed across three files' comments.

Rejected alternatives:

- **A generic `Estimate<T>` class or record type.** It would own the storage, which is exactly the
  part every caller already has an opinion about and a file on disk shaped by. Three migrations to
  share five functions is the wrong trade.
- **Converting all three now.** The risk is real and the benefit is symmetry. Converting one proves
  the API; converting the rest can happen when each is being changed for its own reasons.
- **Leaving it in `spawn-timers.ts` for others to import.** The rules are not about respawns, and a
  module named for one domain is one nobody in another domain goes looking in.

## Consequences

- There is now a **named place** for the question "how do we handle a number we aren't sure about?",
  which is the point. The next inference — a fight's true duration, a placeholder cycle, coin per
  kill — starts from five documented rules instead of somebody's memory of how the last one went.
- `estimates.ts` has **one caller today**, and that is a fair criticism of any abstraction. Its
  defence is that it was extracted from a third implementation of the same shape rather than
  imagined ahead of one, and the other two are named above with what they would gain.
- The rules being separate functions means a caller can take **some** of them. That is deliberate:
  drop-truth wants `confidenceOf` and has no bounds at all, while hp-estimate wants `tighten` and
  `contradicts` and has no spread.
- A shared `plausible`/`tighten` pair makes the "discard, don't clamp" rule *checkable* — it is now
  visible when a caller ratchets without vetting, where before it was a comment three files could
  each forget in their own way.
