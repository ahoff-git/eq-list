# 0097: A sighting is the tightest evidence there is, and a timer is silent until asked

## Status

Accepted

## Context

[ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md) learns a respawn from the gap
between two of your kills, and [ADR 0094](./0094-a-spawn-timer-is-a-window-not-an-instant.md) admits
how loose that bound is. Both are built on the same fact: every gap you observe is `R + (some
unknown, always-positive delay)`, so the shortest is the tightest upper bound and a longer one says
nothing.

What neither noticed is that **a kill gap is the loosest evidence the app could possibly collect**.
Between the mob spawning and your second kill line sits: however long before you looked, however
long to get there, however long to kill it, and — if it's on a placeholder — however many cycles
went by first. The log can see none of that.

The player can. They are sitting at the camp looking at the mob. "It's up **now**" is a measurement
we were throwing away, and it excludes the two largest terms in that sum.

There was a second problem, and it came from 0092's own success. Every named you kill is tracked
automatically, with no setup — which is the feature. But every one of those timers also alerted, so
a busy evening promises a banner for a dozen mobs you killed in passing and are not camping. A tool
that interrupts you about things you didn't ask about gets muted wholesale, which costs you the one
alert you did want.

## Decision

**Marking a mob up is an observation, and it is used as one.** `markUp` records `R ≤ now − killedAt`
through the same ratchet as everything else: shortest wins, implausible is discarded rather than
clamped, and it can only ever tighten. It is stored in the tracker rather than derived, because
unlike a kill gap there is nothing in the log to re-derive it from — this is the one fact in the
feature that only the player can supply.

**A sighting is a distinct class of evidence and says so.** `RespawnSource` becomes
`stated | seen | killed`, and the estimate is simply the smallest bound available. A sighting
usually wins, but is **not privileged** — if a kill gap somehow came in tighter, that is a real
bound too and preferring the sighting would be discarding evidence to protect a label. The wording
follows the source: *"at most 8m, seen up 3 times"* reads differently from *"at most 22m, from 3
gaps"*, and it should, because it is worth more.

**`alive` outranks the clock in both directions.** A mob you have marked up is `alive` whatever the
countdown thinks — before its window opens (you found it early, which is exactly the observation
that proves the timer is too long) and long after a countdown would have gone stale (it is up; time
passing doesn't change that). This is the claim-versus-observation rule the whole app runs on
([ADR 0025](./0025-observation-over-the-wiki.md)) pointed at our own estimate: `up` is what we
guessed, `alive` is what you saw, and the screen must never show them the same way.

**An alive mob never alerts.** You are looking at it. A banner is pure noise.

**And you don't always have to say it: a consider or a hail counts.** Both lines mean the same
useful thing — *that mob is in front of you, alive, right now* — and both arrive from what a camper
does anyway, since you con a named before you pull it. `parseSighting` reads them and the tracker
routes them through `markUp` itself, so an automatic sighting and a clicked one can never come to
mean different things.

Two guards make it safe, and both matter because a sighting feeds a ratchet that only tightens:

- **It only ever reaches a timer already counting down.** Considering a trash mob names nothing we
  track, and a mob with no running timer has no `killedAt` to measure from. That one rule keeps the
  board free of everything a player looks at on the way to a camp.
- **The consider vocabulary is a closed set and fails closed.** EQ writes `<name> <regard> --
  <how it would go>`, and the regard is faction — one of a fixed list, not free text. Matching that
  list rather than "anything before a `--`" is what stops group chat with a dash in it reading as a
  sighting. A wording we don't know reads as nothing, which costs a player one click where a false
  positive would be permanent.

**And you can say the opposite: it's dead now.** `markDead` starts a countdown from this moment, or
restarts one already running — the hand-operated twin of a kill line, for the cases the log cannot
help with: the app wasn't watching when you killed it, you're picking up a camp someone else was
holding, or a pull went unlogged. It seeds a countdown and **teaches the estimate nothing**, because
one death measures no respawn; and it never touches the kill log, which is the log's own record of
what happened. It is also the undo for a mis-clicked "it's up", since a fresh countdown clears the
sighting off the row.

**And you can disagree with the clock: "it's not up yet".** That is the app's only **lower** bound
— `R >` the time since it died — and the only figure here that ratchets *upward*.

It looks like the thing this ADR already rejected and is not. What was rejected was reading
**silence** as a negative: not having seen a mob is no evidence it wasn't there, because it may have
been up and wandering, which is
[ADR 0094](./0094-a-spawn-timer-is-a-window-not-an-instant.md)'s problem. That still stands. This is
the player *asserting* a negative about a camp they are sitting in — a thing only they can know, and
the same judgement the rest of the feature already trusts them for when they say a mob **is** up.

It does two things, and the second is why it was worth having:

- **It sets the earliest the window may open.** 0094 refused to invent that number because "there is
  no observation that could support one". This is that observation arriving, so a measured floor now
  overrules the padding — watching earlier than a moment you have proof it was still down is
  watching for nothing. It can only move the window *later*, and never past the by-time.
- **It can prove the estimate wrong.** Where the floor reaches the by-time the evidence contradicts
  itself: the mob provably had not spawned by a moment the estimate says it must have. That is
  stronger than a wide spread, which only says a figure is *soft*.

**A contradiction is reported, never resolved.** One of the two is wrong — a mis-clicked sighting, a
placeholder cycle, or a mob that had wandered out of the camp — and which one depends on an evening
the app did not attend. Picking would mean silently discarding a real observation; saying so puts the
player one click from dropping whichever they know to be wrong, which the Evidence line already
offers.

**Every measurement can be seen, and dropped on its own.** The row shows the figure that *won*;
an **Evidence** line under it shows why — what the kill gaps said, what the sightings said, what you
typed — because a number that has gone wonky is unfixable in practice unless you can tell which
source it came from. Each line clears only itself.

**Down to the individual gap.** Opening the Evidence line lists every gap that counts, shortest
first, with the one *in force* marked — and each can be thrown out or put back. That is the finest
correction the feature has, and the one that keeps a camp's history: `relearn` draws a line under
everything measured, which is right when a whole evening was nonsense and far too blunt for the one
pull that was really the placeholder.

A gap is **derived**, so the exclusion is stored rather than the gap: `droppedGaps` holds ids, and a
gap's id is the pair of kills it spans. That keeps it stable across a re-read of the log, and an
exclusion whose pair stops being consecutive — an import put a kill between them — goes inert rather
than silently excluding some *other* gap. The kills themselves are never touched: they happened, and
the log's record of them is not ours to rewrite.

A dropped gap **stays listed**, struck through, for the same reason a dismissed mob does: an
exclusion you cannot see is one you cannot undo. Gaps that were never evidence at all — outside the
plausible bounds, spanning a difficulty change, before a cutoff — are simply absent, because they are
not decisions anybody made and nothing can be done about them.

`relearn` clears the per-gap exclusions rather than keeping them: its cutoff already excludes
everything measured, so a leftover could only re-exclude a gap measured *after* the reset.

That closed a real hole rather than adding a nicety. A sighting is **stored**, not derived, and it
ratchets: one mis-click, or a consider of the wrong thing, pinned a mob's figure for good.
`relearn` set a cutoff over the *kill log* and never touched sightings, so the only escape was to
throw away the camp's whole measured history — and for a mob that wasn't hand-added, there was no
escape at all. `relearn` now forgets both (which is what "forget what was measured" always claimed),
`forgetSightings` is the narrow undo for the common case, and anything you *typed* survives either:
it forgets measurements, not decisions.

**Every state a player can set, they can unset.** This is a rule about the whole panel rather than
one control, and it was broken in three places at once: a typed interval could only be cleared by
emptying the box and saving — which works, and which nobody discovers — while "not a named" removed
the row carrying the only control that could reverse it. So an editor with a value shows an explicit
**Clear**, a dismissal is listed under **Not tracked** with the count in the heading, and every
"tell the tracker what's true" button has an opposite within reach. A setting you cannot see how to
unset is a setting you cannot change your mind about, which for a figure the player is then asked to
rely on is worse than not offering it.

**A timer can be typed in, and a custom timer is the same thing.** `add(name, zone, seconds)` files a
row the kill log didn't produce — a named you want timed before you've killed it twice, or picked up
someone else's camp. The zone is optional and the interval is optional.

That one call also answers "custom timers", and it does so by **not** distinguishing them. A label
no kill line will ever match simply never restarts itself, so a boat, a port or a raid lockout
behaves correctly with no branch anywhere about what kind of thing a row is — while a name that
*is* a mob starts learning from the log the moment you kill it. Adding by hand also marks the name
as a named, because adding it *is* the claim that it's worth timing, which is what the flag means
here; for a label that is not a mob the flag is inert.

Only a hand-added row may be **removed**, and it is removed without ceremony: it is exactly what the
player typed, so taking it back costs nothing and needs no confirmation. A row the kill log produced
has no remove at all, because it would come straight back on the next read — a button that doesn't
work is worse than no button. What was *learned* is never deleted either way; it lives in the kill
log, so re-adding a mob you have killed brings its history with it.

**Notify is per mob and off by default.** The countdown still runs and still shows — silence is the
difference between a list and an interruption. This *is* a change from what shipped: every tracked
named used to alert. It is the right way round because tracking is automatic and camping is
deliberate, so the set of mobs you want to hear about is always much smaller than the set being
timed, and the panel is where you'd be looking anyway.

Rejected alternatives:

- **A global notify setting.** Same objection as global padding in 0094: which mob you're camping is
  the whole question, and one answer for all of them is wrong nearly everywhere it applies.
- **Inferring "it's up" from a `/who` or a target line.** The log has no such line, and guessing a
  sighting would feed the ratchet a number nothing could withdraw.
- **Inferring a lower bound from silence** ("no sighting for a minute, so `R >` that"). Unsound: not
  having seen it is not evidence it wasn't there, since the mob may have been up and out of sight the
  whole time — the wandering problem 0094 records. An *asserted* "not up yet" is a different claim
  entirely and is taken; a missing one is still read as nothing at all.
- **Letting a floor raise the estimate.** It is a bound on the *other side*: the estimate is a
  by-time and only ever falls. Where the two cross, that is information about the evidence rather
  than a new figure, and it is said rather than averaged away.

## Consequences

- The estimate improves far faster for a camped mob than the kill-gap rule alone could manage, and
  it improves **because the player told us**, which is the honest way round for a figure they then
  have to rely on.
- Timers are quiet by default, so the tab has to be worth opening on its own. That was already the
  intent — it's a board you read mid-camp — but it now carries the whole feature for anyone who
  never finds the checkbox.
- `SpawnState` reaches five states (`waiting | window | up | alive | stale`). That is the most this
  can carry before the row stops being readable at a glance, and any further nuance should go in the
  note rather than the clock.
- Considering is now load-bearing in a way the game never intended, so the regard list is a thing
  that can go stale — EQL is not classic EQ. It failing closed means the symptom is "my cons stopped
  helping", not a wrong timer.
- A sighting is only as good as the click. Marking the wrong mob up tightens a timer permanently,
  which is what `relearn` is for — and why the implausible-gap floor applies to sightings exactly as
  it does to kill gaps, so a misclick seconds after a kill teaches nothing.
- The known row now carries five controls plus a checkbox, which is the most it can hold. The next
  thing added there wants a menu rather than a sixth button.
- **How a mob gets on the list is now stated on the tab**, in one line above the rows. It reads as
  hand-holding and earns its place: "why isn't that named here?" has two answers (kill it twice, or
  add it) and neither is guessable from an empty list.
- A hand-added row and a learned one are the same row once both exist, keyed the same way — so
  adding a mob you later kill doesn't leave a duplicate, and the typed figure keeps outranking the
  measured one exactly as it does anywhere else.
- Nothing yet notices that a mob marked up has **stopped** being up without being killed (someone
  else took it). It stays `alive` until your next kill or an explicit clear, which is wrong but
  quietly so — and the alternative, expiring a fact the player asserted, is worse.
