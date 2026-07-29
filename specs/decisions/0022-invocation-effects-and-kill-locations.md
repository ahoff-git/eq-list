# 0022: Invocation side-effects, and placing kills honestly

## Status
Accepted

## Context
Three things the log implies but never states, each needed for a number already on screen to
mean what it claims.

**Divine's healing.** The divine invocation heals you off your own spell damage, which is why
damage-per-mana looked terrible under it: the mana bought health as well as damage and only
the damage was counted. It *is* in the log — as a self-heal with **no spell named**, right
after one of your spells lands:

```
You hit a coyote for 12 points of cold damage by Blast of Cold.
A coyote's skin goes numb.
You healed Kainos for 8 hit points.        ← no "by <spell>": the invocation's doing
```

Every heal we *can* attribute names its spell, so the absence is the signal.

**Spell Blade's free casts.** The invocation grants occasional free casts and the log has **no
message for them** — a whole log was searched. The only signature is a spell landing with no
cast in flight, which the tracker already distinguishes (it's why such a landing can't be
timed).

**Kill locations.** EQ logs a position only when the player types `/loc`, so a heatmap's
accuracy is bounded by how often they do. It can only ever be as accurate as the player is.

## Decision
**Divine's healing is credited to the spell that triggered it**, under a deliberately tight
rule: no spell named, you are both healer and target, and your own spell landed within 3
seconds. It is kept in `invocationHealed`, *separate* from `healed` — mixing them would make
a nuke look like a cure — and `Per mana` now counts damage **plus** that healing, since
that's what the mana actually bought.

The rule doesn't require the divine invocation by name. The guard is behavioural, and the
per-invocation split records which invocation was up anyway, so if another one turns out to
do the same thing the data shows it instead of silently missing it.

**A free cast is a landing with no cast in flight, from a spell you actually cast.** That
last clause is the whole trick: the first version counted **damage shields and buff procs**
as free casts, because they are castless by nature — on a real log it claimed 21 procs, 15 of
them a pet's damage shield, while the invocation that grants free casts showed zero. Requiring
the spell to be in your observed *repertoire* (you've been seen casting it) cut the false
positives to 5. Rate is procs ÷ **swings**, since the proc triggers off attacks.

**Kills are recorded with their evidence, not just a position** (`kill-log.ts`): the fix used
and its age, the previous fix, the distance/time/speed between them, a dead-reckoned guess
when there's a course to extend, and a confidence score. Confidence is exact while the fix is
fresh, slides to nothing by a minute, and is **halved when the player was demonstrably
moving** — a parked player with an older fix is more credible than a running one with a newer
one, which is exactly the camp case a heatmap is for. Nothing is discarded: a kill with no fix
at all is still recorded, with confidence 0.

Rejected alternatives:
- **Requiring the invocation to be named "divine"** — asked for, and narrower than the
  behavioural guard for no benefit. See above.
- **Treating every castless landing as a free cast** — measured, and wrong: mostly damage
  shields.
- **Only recording kills we can place confidently** — throws away the raw material for a
  better guess later. The visualization can filter; the log shouldn't.
- **Interpolating silently** — a dead-reckoned position that looks like a measured one is
  worse than no position. It's stored in separate fields (`guessedY`/`guessedX`) so it can
  never be mistaken for the fix.

## Consequences
- Damage-per-mana is finally meaningful under divine, and the spell table footnotes what each
  invocation did beyond scaling numbers (healing granted, free casts and their rate).
- The free-cast rate is **inferred, and stated as inferred**. A second landing from one cast
  (an area spell) would look identical; on the log to hand, five landings across two
  invocations remain unexplained — probably casts that began before the watcher attached.
- Spell Blade's proc rate is **still unvalidated against a real proc**: in the log available
  the invocation was up for only 35 swings and nothing fired.
- Kill records are generous by design (~15 fields each, capped at 5000 kills). The heatmap can
  be built and rebuilt without re-collecting anything.
- `isMine` in the tracker now also matches your bare character name. It previously matched
  only "You" and pets, so any message naming you directly — which is how heals on you are
  written — wasn't recognized as yours. Found by the divine-healing test.
