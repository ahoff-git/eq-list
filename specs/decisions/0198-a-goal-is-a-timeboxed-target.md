# 0198: A goal is a timeboxed target, tracked on its own and focusable from the List and Hunt tabs

## Status

Accepted

## Context

A camper's evening is full of *bounded* asks that nothing in the app answers: "in the next hour I'd
like to farm 20 Phosphorous Powder", or "kill 15 gnolls before I log". The shopping list answers a
related but different question — `ShoppingListEntry.obtained` is a **lifetime** count with no clock
on it, so it can say you have 12 of 20 but never how many you got *this session* or whether you're on
pace. The Timers tab is the app's other board of "what's running out", but a spawn timer's whole
identity is a camp's evidence — gaps, sightings, a floor — that a farming session carries none of; a
timer is armed by a kill, not started by the player choosing a target and a clock.

Two closer analogues, and why neither is quite it:

- **The shopping list's 🔔 loot alert** ([ADR 0105](./0105-a-tracked-item-says-so-when-it-drops.md))
  is the right shape for "say so when it drops" and the wrong shape for "say so when I'm on pace, and
  stop me when I've run out of time" — it has no clock and no milestone, because it never needed one.
- **A spawn timer's `custom` kind** ([ADR 0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md))
  is the nearest thing to "a clock the player started by hand, claiming nothing about a mob" — but it
  is one clock with no *quantity* attached, and folding a farming target into it would mean growing
  `qty`/`obtained`/milestones onto a file whose entire other half is respawn evidence that a goal has
  no use for.

So a goal wants its own tracker. What it should let you set a goal *on* also turned out to be wider
than the item example suggests: a kill quota ("15 gnolls") is exactly as timeboxable as a loot count,
and needs the same clock, the same milestones and the same two kinds of "it's over" (met, or ran out
of time) — so both kinds of target are worth building together rather than adding the second later as
a special case of the first.

## Decision

**A `Goal` is `{ target: {kind: "item"|"mob", name}, qty, obtained, startedAt, durationSec, dueAt }`**,
held by its own `electron/goal-tracker.ts`, mirroring `spawn-tracker.ts`'s shape (a persisted due
time, a 1-second sweep, an injectable clock) without inheriting anything about camps: no gaps, no
sightings, no floor, because a goal has none of those. Progress is applied **the instant a matching
line lands** (`noteLoot`/`noteKill`), not on the sweep — a milestone is about *count*, which only ever
changes on an event; the sweep's only job is the one thing that moves on its own, **time**, catching a
goal that ran out with nothing else happening. An item goal matches loot lines the same fuzzy way
`store.ts`'s own matching does; a mob goal matches kills already gated by `combat.countsKill` — the
same "was this actually yours" rule the kill-streak high score uses, so a goal's kill count and the
streak's never disagree about whose kill it was.

**Several goals may run at once**, unlike a spawn timer's one-per-camp default: starting a new goal
never replaces a running one. A farming session is deliberately started, so there is no "arm this
automatically" question to answer the way a camp's alert arms itself — every goal you start is
watched, no opt-in per goal required.

**Progress is bannered at fixed milestones (25/50/75%) as well as at completion and expiration**,
raised directly through the alert funnel the way a `record`/`loot` alert is (`electron/goal-tracker.ts`
calls `raise()` itself; there is no watch to match and nothing to queue — "the tracker decided this
was worth hearing"). A single big loot stack that crosses two thresholds at once still announces both,
in order (`nextMilestone`, called in a loop). **Nothing is ever bannered about the past**: a goal
already terminal when the tracker loads — most often, one whose time ran out while the app was
shut — is marked spoken-for silently, the identical rule `spawn-tracker.ts` applies to an overdue
timer at startup. One shipped look (`built-in:goal`), no per-goal style editor — the **Loot**
precedent (ADR 0105), not the Spawn timer's per-instance one, since a goal update reads as "something
you're farming happened" rather than "a named camp popped".

**The progress floater is on by default, with no per-goal toggle** — the one place this departs from
ADR 0099's spawn-timer precedent, and deliberately: a spawn timer runs on *every* named you kill, most
of which you are not camping, so pinning one is an opt-in decision; a goal exists only because you
started it on purpose for exactly this session, so there is no "most of these you don't care about"
to filter past. `GoalsOverlay` rides the existing `/alert` window, same as `SpawnOverlay`.

**A want can be saved for reuse** (`GoalTemplate: {target, qty, durationSec, label?}`), independent of
any goal started from it — saving one doesn't start it, deleting one doesn't touch a goal already
running, and starting one is a plain copy of its fields into a fresh `Goal`. Templates persist beside
goals in `goals.json`.

**The List and Hunt tabs can focus on the running goals**, because the two questions a goal answers —
"what do I still need for it" and "where do I kill for it" — are exactly what those two tabs already
show, buried among everything else on the list. One persisted toggle (`STORAGE_KEYS.goalFocus`) for
both tabs, since it is a single standing decision ("I'm heads-down on my goals right now") rather than
a per-tab filter the two could disagree about:

- **On, emphasizing**: a matching row on either tab is outlined; everything else is dimmed, not
  removed — you can still see your whole list, just not have to hunt for the part you're farming.
- **On, and also hiding** (a second, narrower toggle, off by default): non-matching rows are dropped
  from the view outright — an empty group or zone disappears with them. Because this can make real
  work vanish from the screen, it draws its own warning banner (`GoalFocusBanner`, shared by both
  tabs) naming how much is hidden, with a **Show all** button that is exactly `setHiding(false)` — the
  quickest undo available, one click from the exact place the hiding happened.

An item-focus match reuses `goalWantsItem` (the shopping list's own fuzzy either-contains-the-other
rule); a mob-focus match on the Hunt tab counts **either** a direct mob-kill goal **or** an item goal
for something that mob drops — "kill this" and "kill this for that" are the same trip.

Rejected alternatives:

- **One active goal at a time.** Simpler, and wrong for the shape of a real evening: a player farming
  crafting mats often also wants a kill quota running alongside it, and forcing a choice between them
  would make starting the second one silently cancel the first.
- **Folding a goal into `ShoppingListEntry`** (an `obtained` reset plus a `dueAt` on the row). Rejected
  in Context above — it would teach a lifetime counter a second, timeboxed idea of "how many", and the
  two would have to be told apart everywhere `obtained` is already read.
- **Folding a goal into `spawn-tracker.ts`** as a `custom` timer with a quantity bolted on. Rejected for
  the same reason from the other side: the file's whole other half is respawn evidence a goal has no
  use for, and a kind with no evidence sitting in a evidence-shaped table is exactly what ADR 0135 built
  a separate `custom` kind to stop happening.
- **A per-goal on-screen toggle**, matching the spawn timer's `onScreen`. Rejected above: there is no
  "most goals you don't care about" population for a goal, unlike a spawn timer's every-named-you-kill
  default.
- **Hiding as the only focus mode**, with no separate emphasize-only step. Rejected because hiding is
  the stronger claim — it can make real, unfinished work disappear from the screen — and a reader
  should be able to try focus without first accepting that risk.

## Consequences

- A third "what's running out" board (after Timers and Buffs) on the tab strip, placed beside Timers —
  the same log-driven, mid-fight-relevant grouping — which is one more tab `TabBar`'s » menu may have
  to fold at the app's default width.
- Goal progress and the shopping list's own counts can **look inconsistent on purpose**: farming 20
  Phosphorous Powder for a goal and having 12 of 20 on your list are two different tallies answering
  two different questions, and a reader who expects them to be the same number will have to learn
  they aren't.
- The List and Hunt tabs each gained a cross-cutting concern (goal focus) that neither owns — both
  read `useGoalFocus()` and the shared matching helpers in `goal-progress.ts` rather than each growing
  its own idea of what a goal wants, which is what keeps "focused" meaning the same thing on both.
- A finished goal is invisible to the overlay the instant it stops running, but stays listed on the
  Goals tab until **Clear finished** — so the floater never clutters with old results, and the tab
  still has a place to read them.

## See also

[0105](./0105-a-tracked-item-says-so-when-it-drops.md) ·
[0099](./0099-a-countdown-can-stay-on-screen.md) ·
[0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md) ·
[0027](./0027-only-your-kills-count.md)
