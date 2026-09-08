# 0199: A streak goal has no quantity — only a window that re-arms on every hit

## Status

Accepted

## Context

ADR 0198's goal answers "reach a quantity within one timebox" — "20 Phosphorous Powder in an hour",
"15 gnolls before I log". A different, common ask isn't shaped like that at all: "kill a gnoll every
10 seconds", or "loot a Phosphorous Powder every 2 minutes" — keep hitting the target before a short
window closes, for as long as you can, with no quantity and no fixed end. The measure of success is
the run itself, not a count reached by a deadline.

A third phrasing — "average 3 kills a minute, over 10 minutes" — reads like it wants a third mechanic,
but it doesn't: entering a rate and a window and computing `qty = round(rate × minutes)`,
`durationSec = minutes × 60` produces **exactly** an ordinary ADR 0198 goal, because that is what an
average over a fixed window *is*. Reaching the computed quantity early means you beat the pace;
running out of time short of it means you didn't. Nothing about the tracker needed to change for this
one — it's a second way to fill in `GoalsPanel`'s existing `qty`/`durationSec` fields, not a second
kind of goal, so it's UI sugar (`ChallengeMode: "average"` alongside `"total"`) rather than anything
`electron/goal-tracker.ts` or `Goal` itself knows about.

A streak is the one that's genuinely new: no quantity, a clock that resets instead of counting down,
and a different question at the deadline — not "did you reach it" but "did you keep it going".

## Decision

**`Goal` and `GoalTemplate` grow a `mode?: GoalMode` (`"target" | "streak"`) rather than becoming a
`TargetGoal | StreakGoal` union.** The two modes share every other field, and a discriminated union
would have forced `goal-tracker.ts`, both panels, the overlay, and every existing test to narrow on
`mode` before touching a field the ordinary case never stopped having a use for — for the sake of
`qty` and `announcedMilestones` being meaningless (rather than merely unused, `0`/`[]`) on a streak.
`mode` is optional and absent reads as `"target"`, so a `goals.json` written before this ADR needs no
migration to keep working — `goal-tracker.ts`'s `load()` backfills it defensively the same way
`spawn-tracker.ts` backfills a missing timer id, but nothing breaks first if it didn't.

**A streak goal reuses `obtained`/`durationSec`/`dueAt` with different meanings, plus two fields of
its own.** `obtained` is the *current* streak (hits since the last break, or since start) rather than
progress toward `qty` (which stays `0`, unused); `durationSec` is the window a hit re-arms rather than
a fixed total; `dueAt` is *next* hit's deadline, pushed out by `durationSec` on every qualifying kill
or loot line, rather than one fixed end. New: `bestStreak` (the high-water mark, kept across a reset)
and `autoRestart` (what a break does — see below). `goalState` gains one clause: a `"target"` goal's
completion check (`obtained >= qty`) is skipped for `"streak"`, so a streak only ever reaches
`"running"` or `"expired"` — there is nothing sized enough to complete.

**Crediting a streak hit and finding it broken are their own functions in `goal-tracker.ts`**
(`creditStreak`, `breakStreak`) rather than new branches threaded through `announceProgress` and
`stillRunning` — those two exist entirely to talk about milestones and a fixed quantity, neither of
which a streak has, and forcing it through them would mean more branches guarding fields that don't
apply than logic that does. `creditStreak` guards the same live race `stillRunning` was added to close
(commit `48be09b`): a replayed batch of log lines can walk a streak's deadline into the past before
the 1-second sweep gets a chance to notice, so a hit checks `at >= dueAt` itself before extending the
streak — and if the window had already lapsed, resolves the break first. An `autoRestart` goal then
treats that very hit as the first of its next run; a goal that just finished does not.

**What a break does is the caller's choice, saved as `autoRestart`, not a fixed rule.** Two real
players want two different things from the same broken streak: one wants it filed as a result, the
way an ordinary goal's `expired` is — moved to Finished, showing the best run reached, done. The other
is drilling and wants the counter back to 0 with the clock already running again, no second click. So
both ship: `autoRestart: false` (the default — a `GoalsPanel` checkbox next to the interval field)
finishes the goal exactly like an ordinary expiry (`resultAnnounced = true`); `true` resets `obtained`
to `0`, pushes `dueAt` out by another window, and leaves `resultAnnounced` false so the goal never
stops running on its own. Either way `breakStreak` **always** raises a `streak-broken` alert first —
the break is the one thing a streak challenge exists to tell you about, whichever way it's configured
to continue afterward.

**`streak-broken` is its own `GoalAlertPayload` kind, not a repurposed `"expired"`.** An expired
target goal reports `qty`/`obtained`; a broken streak has neither, only `streak`/`bestStreak` — kept
separate so a reader switching on `kind` is never handed `undefined` where it expected a count.
`CastAlerts.tsx`'s `goalBanner` and icon selection both treat it the same way `"expired"` is worded
(⌛), since to the player a streak ending unmet is the same kind of news a clock running out is.

**Nothing is ever bannered about a break that happened while the app was shut**, the same ADR-0198
rule applied to both outcomes: a non-`autoRestart` streak found already lapsed at load is marked
`resultAnnounced` silently, same as an ordinary expired goal; an `autoRestart` one is silently reset
(`obtained = 0`, `dueAt` pushed out) with no banner, since it has no "finished" to reach and the only
honest silent answer is to pick the streak back up where the sweep would have left it running.

**`GoalTracker` gains `startStreak`/`saveStreakTemplate` rather than widening `start`/`saveTemplate`'s
signatures.** A streak has no `qty` to pass, so the alternative was an optional-parameter overload
that reads as "sometimes ignored" at every call site; two named methods say what each one needs and
nothing else, mirroring the split at the IPC layer (`goals:startStreak`, `goals:saveStreakTemplate`)
and in `GoalsPanel`'s own `start()`, which branches on its `ChallengeMode` once and calls one or the
other.

**`GoalsPanel`'s creation form gets a second segmented control, `Total | Average | Streak`,** rather
than nesting an entry-style toggle inside "Total": three buttons naming the three phrasings from
Context directly is a shorter path from the words a player thinks in to the fields they fill in than
a toggle-inside-a-toggle would have been, at the cost of one more row in an already-multi-row form.
`kind` (Item / Mob kills) is unchanged and orthogonal — it says *what* the streak counts, exactly as
it already said for a target goal.

Rejected alternatives:

- **A `TargetGoal | StreakGoal` discriminated union.** The type-safe choice, and rejected in the
  Decision above for the blast radius it would have opened on every existing reader and test for
  fields a flat shape can simply leave unused.
- **Reusing `"expired"` for a broken streak**, distinguishing it only by checking `qty === 0`.
  Rejected: a payload's kind should say what it is without a reader having to infer it from an
  unrelated field's absence, and `qty`/`obtained` would still read as present-but-meaningless on it.
- **A true rolling average** for the third phrasing — a live rate over a trailing window that can dip
  below pace without ending the goal outright. Rejected for now: it would need the tracker to keep a
  timestamped ledger of hits per goal rather than a single running count, for a mode that the fixed-
  window math in Context already answers exactly for the common case ("beat the average by the end").
- **Always finishing on a break**, no `autoRestart` option. Simpler, and wrong for a drilling session:
  forcing a fresh "Start" click after every miss is exactly the friction that would make players stop
  using the mode for the use case it's most suited to.

## Consequences

- `Goal`/`GoalTemplate` now carry three fields (`mode`, `bestStreak`, `autoRestart`) that are
  meaningful on one mode and unused noise on the other — the cost of the flat-shape decision above,
  paid once rather than paid as a union's narrowing at every call site.
- The Goals tab's creation form is now three rows deep at its narrowest (kind, challenge, fields)
  rather than one, following `.goals-add`'s existing wrap behavior rather than new layout.
- A streak goal's progress bar reads backwards from a target goal's: it drains toward the next
  deadline instead of filling toward a quantity, reusing the same `.gr-bar`/`.gr-fill` markup with a
  different fraction rather than new CSS.
- `bestStreak` is the only trace of a broken `autoRestart` run once it resets to `0` — there is no
  history of individual runs, only the current one and the best one.

## See also

[0198](./0198-a-goal-is-a-timeboxed-target.md) ·
[0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)
