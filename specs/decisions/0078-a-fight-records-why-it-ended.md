# 0078: A fight records why it ended

## Status

Accepted

## Context

[ADR 0036](./0036-a-fight-ends-on-death-not-a-lull.md) already draws the distinction that matters:
a **resolved** fight — something died — closes after a short quiet, while an unresolved one, with
the enemy presumably still up and chasing, needs a much longer silence. The tracker computes which
applied on every line, uses it to pick the gap, and then throws the answer away.

So a stored fight is a duration and a damage total with no account of how it finished, and two
very different things read identically. A 90-second fight that ended in a kill is a pull; the same
90 seconds ending because the log went quiet is a mob that fled, a kite that ended, a zone-out, or
a log that lagged — and its DPS means something different, because the fight didn't finish.

There is a third case the log has no opinion about at all: a fight banked because the *app* said
so — the meter reset, the tracker flushed on close or a character switch. Folding that in with
"nothing resolved it" would be wrong; the log didn't end that fight, we did.

## Decision

**Stamp every banked fight with why it ended,** as `FightStats.endReason`:

- `kill` — the last thing to happen was something dying to you.
- `death` — the last thing to happen was your own death.
- `timeout` — nothing resolved it; the enemy was presumably still up when the log went quiet.
- `cut` — the log didn't end this fight. A reset, or a flush.

When a kill and a death both resolved the fight, the **later** one is what ended it — you killed
one and its friend killed you.

**Absent means exactly one thing: stored before this was recorded.** That's why `cut` exists as a
value rather than being left blank — [ADR 0021](./0021-stored-fights-keep-their-source.md) means old
records keep the shape they were written with, and "we don't know" has to stay tellable apart from
"nothing in the log ended it".

The History list marks the three that aren't a kill and leaves a kill undecorated: marking the
ordinary case would bury the rows that mean "this isn't what it looks like". An old record with no
reason renders as a kill, which is what the vast majority of them were.

## Consequences

- One field, set where the branch already is — no new detection, and no new way for the fight
  boundary to be decided. This ADR adds vocabulary to ADR 0036, not behaviour.
- A `timeout` fight is now visibly a different artifact, which is the point: an odd duration or a
  low DPS row can be explained rather than merely doubted.
- `cut` makes reset-heavy use legible too — a player who clears the meter mid-pull can see that's
  what the short fight was.
- Because it rides in `FightStats`, it flows through history and an eaten log alike with no extra
  plumbing, and a re-import produces the same reasons as live play did
  ([ADR 0033](./0033-eating-a-log-is-idempotent.md)).
