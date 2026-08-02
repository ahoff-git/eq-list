# 0029: Three measurements corrected by replaying the whole log

## Status

Accepted

## Context

The player's log is now 20,647 lines. Re-parsing all of it and inspecting what *didn't* match —
the method that found every earlier grammar gap — turned up three figures that were confidently
wrong rather than merely missing. All three had passed their unit tests, because each test used
the wording the code already handled.

- **Every dodge, parry and block was thrown away.** EQ words an active defence differently from
  a whiff: "…but misses!" versus "…but YOU dodge!" / "…but a wild tiger parries!". Only the
  first was parsed, so 226 swings that never landed weren't counted as misses — 8.9% of the
  real total, and the log's own numbers put 111 dodges, 64 blocks and 51 parries out of view.
  Every hit rate in the damage meter read high, and your own defensive performance was invisible.

- **Area spells were counted as free casts.** A free cast (Spell Blade's doing) is inferred from
  a spell landing with no cast in flight. One cast of an area spell lands on each target
  separately and only the first of those finds the cast still pending — so every extra target
  read as a free cast. In the real log that was **61 of 65** "free casts", from two spells, and
  because they were filed under whichever invocation happened to be up, the table said
  *recovery* granted the most free casts (38) and ranked *spellblade* — the invocation that
  actually grants them — fourth, with 4. The one number the player asked for by name was noise.

- **A capital letter manufactured a wiki disagreement.** `reconcileDrops` matched the wiki's
  item names against the log's literally, so "Bone Chips" and "bone chips" became two rows with
  opposite, both-false verdicts: **undocumented** (the wiki has never heard of it) *and*
  **unseen** (all those kills produced none, flagged suspicious). Undocumented drops are the
  headline claim of [ADR 0025](./0025-observation-over-the-wiki.md) — "something the game does
  that no reference knows" — so this could invent a discovery out of punctuation.

## Decision

**A defence is a miss.** The miss grammar accepts both wordings, and records *how* it was
avoided (`MissEvent.avoidance`: dodge / parry / block / riposte) since those are different
defensive stats and the log distinguishes them for free.

**Two landings of one spell in the same log second are one cast.** EQ stamps to the second and a
genuine recast takes seconds, so simultaneity is a reliable signal for "same area spell". This
misses a free cast of the very spell you just landed inside the same second — far rarer than the
area spells it stops miscounting.

**Item names are reconciled through the same normalisation the shopping list uses**
(`normalizeItemName`), and the wiki's spelling is the one displayed, since that is what its page
and the list are keyed by.

## Consequences

The damage meter's hit rates are right, and after the proc fix the free-cast table reads the way
the mechanic works: spellblade 3 of 5, everything else at or near zero. Those are small numbers
from a thin sample, which is honest — the previous 61 were not.

The remaining 2 procs outside spellblade are most likely area landings that straddled a second
boundary. The heuristic is a heuristic; it is documented at the code rather than presented as
exact.

Coin is still unparsed: 248 lines of "You receive 3 silver and 2 copper from the corpse." go
nowhere, so the camp report can't answer "what is this camp worth per hour" in money. That's a
gap, not a wrong number, and it's on the todo rather than fixed here.
