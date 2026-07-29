# 0018: Maximum hit points inferred from the log, stored softly

## Status
Accepted

## Context
Damage taken only means something against the health you had. "855 damage in 15 seconds"
is either a scratch or a near-death, and the log never says which — EQ states no health
numbers anywhere. [ADR 0017](./0017-camp-efficiency-and-asking-the-player.md) deferred
this to OCR, and OCR was then ruled out (fragile, needs per-layout calibration, may
capture nothing at all in fullscreen).

But the log does state every hit you take, every heal you receive **including the part
that was wasted**, and when you die. That is enough to squeeze the answer from both sides
without reading the screen.

## Decision
Maximum hit points are **bounded, not measured** (`electron/hp-estimate.ts`):

- **Floor — "at least".** Damage absorbed in one stretch with no healing. You
  demonstrably lived through it, so your maximum is above it. No assumptions needed.
- **Ceiling — "at most".** Damage that killed you starting from *known full* health. Full
  health is knowable two ways: an **overheal** on you (`healed Kainos for 8 (20) hit
  points` — the surplus had nowhere to go, so you finished exactly full), or a respawn
  after death. The respawn case is an assumption about the game's rules, documented as one.

A window only counts if nothing invalidated it, and every guard below exists because
ignoring it produces a confidently wrong number:

- **A heal on you** ends a floor window — healing lets you absorb more than you have.
- **A lull** (10s with no incoming damage) ends it too: health regenerates, so an evening
  of sitting would otherwise read as one enormous window.
- **A buff fading or a level-up** changes the maximum itself, so observations are dropped
  and collection restarts. A *pet's* buff fading is parsed but ignored — it cannot move
  your total.
- **The killing blow is never counted as survived.** Overkill is the trap: a 900-point hit
  on a 100-point character would otherwise claim a 900 floor. Only the damage before the
  fatal hit was demonstrably absorbed.
- **Heals between full and death** are subtracted, so the ceiling tracks *net* damage.

The result is deliberately **soft**: persisted in its own small file, refined as more play
arrives, and overridable — a figure the player states outright wins until they level. The
UI shows it as a range with its evidence on hover (`AskValue` provides both the override
and the explanation), because a number of this provenance should never look authoritative.

If the floor ever rises above the ceiling, the **ceiling is dropped**: the contradiction
means an unannounced buff was in play, and what you survived is the more trustworthy of
the two facts.

Rejected alternatives:
- **OCR the health bar** — see ADR 0017; ruled out by the user. This gets most of the
  value from data already in hand.
- **Asking outright and nothing else** — works, but must be re-asked every level and every
  gear change, and gives nothing if the player doesn't know their own total.
- **Simulating current health** (a running total of damage and heals) — drifts without
  bound: regeneration, ticks we never see, and any missed line accumulate forever. Bounds
  on the *maximum* are stable facts; a simulated current value is not.

## Consequences
- A death recap can say "855 taken — 95% of your health", and close calls become visible.
- The estimate is **level-scoped**: levelling discards it and it re-learns over the next
  few fights. Correct (your maximum genuinely changed), but briefly blank after a level.
- Buffs the log never announces are the main source of error. Verified against a real log:
  a pre-release session showed an 815 floor that a later level-up correctly discarded.
- Accuracy depends on being hit hard *without* heals — a well-healed character in a group
  will have a loose floor and may never earn a ceiling. The override exists for them.
- The same evidence would yield **other people's** totals (damage on everyone is parsed),
  but only your own is tracked; nothing needs theirs yet.
