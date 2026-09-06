# 0191: The debug comparison was reading its two sides by different conventions

## Status

Accepted

## Context

Three rounds of tuning this clock ([ADR 0187](./0187-the-clock-anchors-on-the-hours-midpoint.md), [0188](./0188-the-clocks-pace-calibrates-itself.md)) kept turning up the same complaint: the clock still felt badly wrong, by tens of minutes, over and over. Asked to review everything and explain why, the honest first step was to stop tuning and go back to real evidence: every `/time` line from the live log, replayed through the actual `learnRate`/`currentGameMinutes` functions rather than summarized or hand-computed.

That replay showed the learned pace behaving exactly as designed — oscillating gently between about 19.3 and 20.9 game-minutes-per-real-minute across 29 real readings, never drifting, never doing anything alarming. The pace was fine. But the diagnostic built to *watch* it (`offByGameMinutes`, added alongside ADR 0188 for exactly this kind of check) was printing numbers like −73, −98, −54 — nearly always negative, nearly always large — which looks exactly like "the clock is running wildly ahead of reality," the natural reading that would send anyone back for a fourth round of fixes.

The bug was in the comparison itself, not the clock: `currentGameMinutes` correctly reads its anchor's hour at the **midpoint** (`hour * 60 + 30`, ADR 0187's fix) to produce `guessed`. But the debug log's `reported` — "what `/time` just said," the other side of the same comparison — was computed as the bare floor, `hour * 60`, with no midpoint applied. Every single comparison was reading its two sides by different rules, which put a constant **−30 minute bias** into every logged figure, in the same direction every time. Replaying the same 29 readings with both sides read the same way collapsed the errors from a one-sided −16 to −98 minute spread into one centered on zero, most of it within the expected noise band, with only two real outliers explainable as ordinary short-sample variance in the learned rate.

## Decision

**One function reads a `/time` reading as a moment — `readingMinutes(hour) = hour * 60 + 30` — and both sides of every comparison call it.** `currentGameMinutes` now calls it for the anchor it extrapolates from; the tracker's debug log now calls it for the fresh reading it's comparing that extrapolation against. Neither side can drift back into disagreement by omission, because there is no second place either one hand-computes the same "hour, as a moment" idea in its own words.

## Consequences

The debug log (`offByGameMinutes`, and the `learnedRatePerMinute` beside it) now reports the model's actual error rather than the model's actual error plus a standing 30-minute penalty. This changes nothing about the clock a player sees — `view().minutes` was never wrong; the anchor reset to the correct midpoint on every reading regardless — so nobody's overlay clock jumps or changes behavior. What changes is that the tool used to *judge* whether the clock is working now agrees with reality, which is what the last several rounds of "fix the math" were actually missing: not a wrong rate, not a wrong split, but a diagnostic that had been quietly overstating the problem by a fixed 30 minutes every time anyone looked.

The lesson worth keeping: when a fix is repeatedly reported as not having worked, replay real data through the actual functions before adjusting the model again — a wrong instrument reads like a wrong system, and no amount of retuning a correct system fixes a broken gauge.
