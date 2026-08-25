# 0135: A countdown is an instance, and a hand-made timer is its own kind

## Status

Accepted

## Context

Spawn timers work, and three things about *getting* them working don't. All three come from the same
place: [ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md) made one identity —
`timerKey`, a mob and a place — carry every job the feature has. It is the key of what was
**learned**, the key of what the player **set**, and the identity of the **running countdown**. One
string doing three jobs is why each of the following is awkward in its own way.

**A timer you just want to run is a mob with the paperwork of a mob.** ADR 0092 let a hand-added
entry double as a custom countdown, on the elegant grounds that "a label no kill line will ever
match simply never restarts itself". The elegance holds and the ergonomics don't. Such a row is
started by a button reading **Killed it**, offers **It's up** and **Not up yet** (evidence controls
about a mob that does not exist), reads `UP` when it finishes, sits under a heading that says *What
we've learned*, and 30 minutes later goes stale and leaves the board with no way to run it again.
`add` also files a `said` entry claiming the label is a named — and `remove` doesn't withdraw it, so
a throwaway timer leaves a permanent claim behind.

**A camp with placeholders cannot be tracked at all.** Three spawn points cycling the same name in
one zone is the ordinary case this feature was built for, and `timerKey` makes them one row and one
countdown: adding the same name twice overwrites, and each kill restarts the single clock rather
than starting its own. The workaround — `PH 1`, `PH 2`, `PH 3` — buys three rows that no kill line
can ever match and three more junk `said` entries. [ideas.md](../ideas.md) has carried "a placeholder
cycle, named as one" since 0094 named `timerKey` as its seam, deferred because *deciding which names
share a spawn* is a guess. That reasoning is still right, and it turns out to have been answering a
harder question than the one a camper actually asks. They do not need the app to know which names
share a spawn point; they need **three clocks for one camp**.

**A hand-typed figure cannot exceed 30 minutes.** Both interval fields parse with `parseDelay`
([alert-schedule.ts](../../src/shared/alert-schedule.ts)), whose contract is an *alert cue*: units
`s` and `m` only, silently **clamped to `MAX_DELAY_SECONDS`**. So `4h` is refused as unreadable and
`240m` saves as 30m without a word — while `formatInterval` prints `6h 30m`, so the figure the panel
shows cannot be typed back into the field that shows it. The reuse looked free and it wasn't: this is
the very cap ADR 0092 cited as the reason a spawn timer could not live in `alert-queue.ts`, reached
by a different route.

And one thing that reaches too far. **A difficulty change drops every countdown for the place**
(0092, correctly: the world was rebuilt, so those deaths are undone) — including a hand-made timer,
which is not about a mob and has nothing to do with the repop.

## Decision

**A countdown is an instance of a camp; the camp is still what is known.** `SpawnTimer` gains an
`id` and `state.timers` may hold several with the same `key`. Everything **learned or configured**
stays keyed by the camp — the gaps, the sightings, the floor, the stated figure, the padding,
`notify`, the style, `onScreen`. Nothing about the persisted shape of that evidence changes, and no
migration is needed.

This is the seam 0094 pointed at, entered from the other end: not "which names share a spawn point"
but "how many clocks does this camp need". A placeholder cycle is then trackable **without guessing
anything** — you get three countdowns for `a froglok tad` in Lower Guk, each measuring from a death
you saw, and the figure behind all three is the one thing the log can honestly say about that name.
Which physical spawn point each clock belongs to is not modelled, and is not needed: the clocks are
anonymous and interchangeable, which is exactly what makes killing any of them start any of them.

**A camp says whether a second kill restarts its countdown or adds another**, defaulting to
restart. That is `CastWatch.retrigger`'s question, in the same words and for the same reason
([ADR 0082](./0082-an-alert-can-be-scheduled.md) already split "a re-mez restarts it" from "a second
placeholder queues another"), so the app has one idea of what a repeat match means rather than two.
Restart stays the default because it is right for a named: a fresh kill means the old due time is
about a corpse that has been and gone. `queue` is opt-in per camp because whether a name has
placeholders is knowledge only the player has — the same refusal to guess that 0094 made about
padding.

The number of concurrent countdowns is **bounded** (`MAX_CAMP_TIMERS`), like `MAX_REPEAT` and for
the same reason: a busy dungeon must not be able to fill the board, and the bound is a number rather
than trust. Past it the *oldest* is dropped, because it is the one closest to being stale anyway.

**Instances are addressed by id, and the ambiguous calls take one.** `stop`, `markUp` and `markNotUp`
now accept an optional id: with several clocks running, "it's up" means *that* one. What such a
sighting **teaches** still lands on the camp, because it is evidence about the mob's respawn and not
about a clock. Omitting the id keeps the old meaning, so nothing that addressed a camp has to change.

**A hand-made timer is its own kind, not a mob with no kills.** `added` carries `kind`, and a
`custom` timer differs from a mob in exactly the ways that were making it awkward:

- It **claims nothing about a named**. `add` writes no `said` entry for it, and removing a hand-added
  *mob* now withdraws the claim `add` made — unless the log proved it independently or another row
  still asserts it. A timer you deleted should leave nothing behind.
- It **can repeat**. Opt-in, per timer: when it comes due it re-arms from its own by-time, so a
  chain of them doesn't drift. Repeating is offered only to a custom timer — re-arming a *mob*
  would be inventing a death nobody saw.
- It **rolls forward rather than lying.** A repeating timer found overdue at startup advances to its
  next future moment silently, by the rule 0092 already set: the app does not announce the past.
- It **is a section of its own**, with its own words — Start, Restart, Stop, and `DONE` where a mob
  reads `UP`. No sighting controls, no "not a named", no evidence block: there is nothing to be
  evidence *about*, and offering the controls anyway is what made a boat timer read as a broken mob.

**A repop drops mob countdowns and leaves yours alone.** `noteZone`'s rule is unchanged for what it
was written for and now says *which* timers the rebuilt world invalidates: the ones measuring from a
death in that place. A raid lockout you happened to file in Lower Guk is not one of them.

**A duration is parsed once, and each feature states its own units and its own ceiling.**
`parseDuration` (in [duration.ts](../../src/shared/duration.ts)) owns the syntax — compound parts,
`1m30s` and `1m 30s` alike, unreadable text refused rather than guessed. `parseDelay` keeps its `s`/`m`
and its 30-minute clamp, because a cue that waits an hour is a cue nobody asked for; `parseInterval`
takes `s`/`m`/`h`/`d` up to `MAX_TIMER_SECONDS`, because a respawn is measured in hours and a lockout
in days. One syntax, two contracts, no third copy — and `formatDuration` is its exact inverse, so
what a field shows can be typed back into it.

`formatInterval` stays what it was: the *figure*, rounded to minutes, because nobody camps to the
second. The editable fields print with `formatDuration` instead — a box you can type in has to
round-trip, and a figure you read does not.

Rejected alternatives:

- **An opaque id per timer, with the camp as a field.** The clean version, and it makes every
  persisted map a migration for no gain: the camp key is a perfectly good key for camp-level facts,
  and the only thing that needed an identity of its own was the countdown.
- **Detecting a placeholder cycle from co-located kills.** Still refused, still for 0094's reason.
  What shipped here needs no such inference and does not preclude one.
- **Per-instance padding, notify, style and on-screen.** Three clocks on one camp want the same
  warning and the same banner; splitting them would be three copies of one answer and a row apiece
  to edit them on.
- **Inferring "this is just a timer" from the name.** A label not in the kill log's vocabulary looks
  like a custom timer and is equally likely to be a named you have not killed yet — which is the
  first case ADR 0092 built hand-adding *for*. The add form asks instead, and defaults its answer
  from the vocabulary, so the common case is one click and the wrong guess is never silent.
- **Repeating mob timers.** Tempting ("it popped, so it'll pop again") and false: the second pop is
  a respawn from a death, and the app has not seen one.

## Consequences

- The Timers tab now holds **two features that look alike and behave differently**, and says so with
  a section apiece. That is the honest layout — a mob's row is about evidence, a timer's row is about
  a clock — and it is one more heading on a tab that already had two.
- **A camp can have several clocks, so the running list can repeat a name.** Each carries its slot
  (`#1`, `#2`) purely so two identical rows are tellable apart; the number means nothing about which
  spawn point it is, and the panel says as much rather than implying an order.
- `queue` is a fourth per-camp setting, and the first one that changes what an *arriving kill* does
  rather than what the player is told. Worth watching: if a camp is left on `queue` after the player
  moves on, a busy zone fills its allowance — which is what the bound is for.
- **Hours and days are now typable**, which makes `MAX_RESPAWN_SECONDS` (12h) the tighter of two
  ceilings for a mob and `MAX_TIMER_SECONDS` (7d) the one a custom timer meets. Two caps for two
  kinds is one more thing to keep straight, and collapsing them would mean either refusing a lockout
  or accepting a four-day "respawn".
- A hand-added *mob* now un-claims its namedness on removal. That is a behaviour change to
  `remove`, and the guard (the log proved it, or another row asserts it) is what keeps it from
  quietly untracking a mob you have really killed.
- The placeholder entry in [ideas.md](../ideas.md) is **narrowed, not closed**: naming a cycle —
  "these three names share one point, and the named is a chance on each pop" — is still unbuilt and
  still needs evidence nobody has. What is no longer blocked on it is *camping a cycle*.
