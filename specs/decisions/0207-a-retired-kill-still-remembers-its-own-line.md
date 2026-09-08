# 0207: A retired kill still remembers its own line

## Status

Accepted

## Context

Going after the user's suspicion of double-counted drop rates with a real 50MB log turned up two
distinct ways `kill-log.ts` could over-count, neither hypothetical.

**Identity was lost on retirement.** [ADR 0033](./0033-eating-a-log-is-idempotent.md) promises that
re-reading a log — by hand, or unattended after a release bumps a revision
([ADR 0129](./0129-a-release-can-ask-for-a-re-read.md)) — records each real event once. That promise
lived entirely on the *held* `kills` records: a kill's dedup key was indexed only while the record sat
in memory, and dropped the moment it aged past `MAX_KILLS` and retired into an aggregate
`MobObservation` (ADR 0056). A `MobObservation` has no line identity to re-derive a key from, so a log
re-read after that point recognised nothing and recorded — then re-retired — the same history a second
time. A month of real play is tens of thousands of kills; for a character with any real history, this
was most of what a re-read would ever touch, and it inflated exactly the drop-rate denominator and
numerator the user was suspicious of.

**A collision was silently treated as a duplicate.** EQ's log timestamp is one-second resolution, and
an area-effect spell can kill — or a looting player can loot — more than one same-named thing inside
one second. `killKey`/`lootKey` were built from nothing but the timestamp, the name, and who did it, so
two *genuinely different* events sharing that signature collided exactly as easily as a genuine
re-read of the same line did, and were handled identically: the second one was silently dropped,
undercounting the kill and misattributing its corpse's loot onto the survivor.

These two bugs pull in opposite directions on the same figures, which is part of why they were hard to
notice from behavior alone — but both are visible in a real log and both are real corruption, not a
matter of tuning.

Fixing the second bug the obvious way — index by `timestamp+name+who` **plus an ordinal**, "which
occurrence of this signature is this" — only works if "how many occurrences already exist" means the
same thing to a live tail and to a replay, and it doesn't. Live-watching is cursor-based and
monotonic: it never revisits a byte it has already consumed, so for it, "not yet on record" and "this
is a new occurrence" are the same fact, and trusting the next unused ordinal is exactly right — it is
what makes two live same-second same-name kills land as two rows instead of colliding. A replay
(`log-import.ts`, and the unattended re-read that calls it) can legitimately walk the identical file, in
the identical order, more than once — that is the whole feature ADR 0033 describes — so for it, "not
yet on record" proves nothing at the *start* of a second pass, because a second pass hasn't recorded
anything yet either. What a replay can trust instead is *how many times it has itself seen this
signature so far in this pass*, compared against how many were already on record before the pass
began: the Kth occurrence within the pass is new only once fewer than K were already accounted for.
Given the identical file in the identical order, that reproduces the same ordinals a second time rather
than inventing new ones on top of them.

## Decision

**Every kill/loot/coin key `kill-log.ts` has ever recorded is now kept forever**, independent of
whether the record it came from still sits in `kills` or has retired into `retired`
(`seenKillKeys`/`seenLootKeys`/`seenCoinKeys`, persisted alongside the records). Retirement — by the
`MAX_KILLS` cap, or by `clear("records")`, which retires everything on the way out — no longer forgets
a key. Only `clear("everything")`, the one time nothing is left that needs protecting, clears them.

**`killKey`/`lootKey` carry an ordinal**: which occurrence of `timestamp+name+who` this is.
`ordinalFor(base, seen, pass)` decides it — `seen` is the permanent key set, `pass` is `null` outside a
replay and a fresh per-signature counter inside one:

- **Not replaying**: always the next ordinal not yet on permanent record. A live call is by
  construction a new occurrence, so this is never refused — the AoE case gets two rows.
- **Replaying**: the Kth time this pass sees `base`, compared against how many were on permanent
  record *before the pass began* — refused (a duplicate) only while the pass hasn't yet exceeded that
  starting count.

**`KillLog` gains `startReplay()`**, called once by `log-import.ts` before it walks a file's lines
(never by live-watching). It resets the pass's per-signature counters; the permanent key set it
compares against is untouched.

**A one-time migration** seeds the permanent key sets from whatever the currently-held `kills` records
still carry, best-effort: a kill retired before this shipped has no key left to recover, so only what
happens from here on is fully protected. Records predating the `#ordinal` suffix are migrated in place
to the lowest ordinal not yet claimed, rather than assumed to be `#0`, since a signature that collided
before this fix existed could already hold more than one un-suffixed key.

## Consequences

A log re-read after a character has enough history for records to have retired past the cap no longer
re-records — and re-retires — history it already had; a real 50MB log's replay lands on the same
ordinals it did the first time, line for line. A genuine same-second, same-name collision — two AoE
kills, two identical drops off two different corpses — now gets two rows instead of one, on both the
live and the replay path.

**The permanent key sets grow without bound**, for the life of the store — a trade the cap on `kills`
itself deliberately avoids making for the records themselves. A key is a short string; even a
character with years of logs behind it is nowhere near where this would matter, and nothing here
reads them as anything but a set membership test.

**This does not touch the user's original, sharper suspicion**: a kill you did not personally loot
because someone else in earshot got there first. EQ never broadcasts another player's loot to a
non-looting bystander, so that corpse's drop is simply invisible to this log — there is no line to
double-count or misplace, and no signal in the log to detect the gap by. That is a real, structural
undercount in `record()`'s coverage, not a duplication bug, and it needs an honest caveat on the
drop-rate figures themselves rather than a fix here.
