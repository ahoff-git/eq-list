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
- **Treating a sighting as a lower bound too** ("it was *not* up a minute ago, so `R >` that").
  Tempting and unsound: not having seen it is not evidence it wasn't there, since the mob may have
  been up and out of sight the whole time — which is precisely the wandering problem 0094 records.

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
- A sighting is only as good as the click. Marking the wrong mob up tightens a timer permanently,
  which is what `relearn` is for — and why the implausible-gap floor applies to sightings exactly as
  it does to kill gaps, so a misclick seconds after a kill teaches nothing.
- Nothing yet notices that a mob marked up has **stopped** being up without being killed (someone
  else took it). It stays `alive` until your next kill or an explicit clear, which is wrong but
  quietly so — and the alternative, expiring a fact the player asserted, is worse.
