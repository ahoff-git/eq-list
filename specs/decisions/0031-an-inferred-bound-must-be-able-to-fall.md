# 0031: An inferred bound has to be able to come back down

## Status

Accepted

## Context

[ADR 0018](./0018-inferred-max-hit-points.md) squeezes maximum hit points from both sides: a
floor from damage you lived through, a ceiling from damage that killed you when you were known
to be full. Replaying the player's whole log put the floor at **815 for a level 2 character**,
while deaths at that same level put the ceiling at **198**. The estimate held both at once.

Two separate faults produced that.

**The floor could only ever rise.** `observeSurvived` returns early unless the new figure beats
the stored one, so a single bad reading is permanent — nothing in the module could ever lower
it again. It survived until the next level-up wiped everything, which meant the level-up wipe
was quietly load-bearing in a way nobody designed.

**The bad reading itself came from a fight the game kept the player alive through.** The log
shows 855 damage across 66 hits in fifteen seconds, from a scripted swarm of named minotaurs,
with no heal on the player and a death at the end. Banking "survived at least 813" from it is
sound arithmetic on an unsound premise: the reasoning assumes nothing but the log restored your
health, and a scripted set-piece breaks that. The log gives no way to tell.

A related weakness turned up alongside: an "unhealed stretch" is damage with gaps under ten
seconds, which at a camp chains pull after pull into a run lasting minutes — and you regenerate
throughout. Summing that claims you absorbed the lot on one health bar.

## Decision

**A measured ceiling below the floor discards the floor.** The two halves are not equally
trustworthy: a ceiling runs from a known-full anchor to a death, both of which the log states
outright, while a floor only assumes nothing healed you. When they contradict, the assumption is
what gives way, and collection starts again. (The reverse rule already existed and preferred the
floor; it was backwards.)

**A stretch longer than `MAX_UNHEALED_SPAN_MS` is discarded rather than banked**, unless the
player has stated a regeneration rate that can actually be subtracted. One minute: long enough
for a real fight, short enough that ten ticks of regeneration can't dominate.

## Consequences

The estimate can now correct itself instead of locking in its worst reading, which is what an
inference from noisy evidence needs to be able to do. On the real log the final figure is 150 at
level 9 — the same as before, but now for the right reason rather than because a level-up
happened to wipe the bad one.

Two things were considered and deliberately not done. **Carrying the floor across a level-up** is
valid in principle — you don't lose hit points by levelling — and it would stop a levelling
character's estimate restarting from nothing eight times in nine levels. It is not done here
because carrying a floor forward also carries a bad floor forward for good, and the floor is the
half most exposed to healing the log never mentions. **Refusing to bank a floor from a
death-terminated window** would have killed the 815 directly, but it also throws away sound
reasoning — surviving damage really does prove your maximum exceeds it — so the self-correcting
rule was preferred over the blunt one.

The 815 is still recorded at level 1 and still corrected only when a ceiling arrives or the
player levels. That is the honest position: the log cannot distinguish a scripted mauling from a
genuinely tough character, and the estimate remains what ADR 0018 called it — soft.
