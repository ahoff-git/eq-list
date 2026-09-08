# 0205: A recast only means a new mob once not proven otherwise

## Status

Accepted

## Context

Replaying the shipped [ADR 0202](./0202-two-mobs-sharing-a-name-get-two-debuff-rows.md)/
[ADR 0201](./0201-a-detrimental-spells-landing-is-indexed-too.md) changes against a real captured log
— the thing that had only been exercised against hand-written fixtures until now — surfaced a shape
neither ADR anticipated: a single cast of a detrimental spell landing on **more than one** same-named
target at once. One "You begin casting Mesmerization." followed, in the same log second, by three
separate "a [mob name] has been mesmerized." lines naming three different real mobs of the same name.
Measured on that log: 245 distinct (spell, moment, target-name) triples where the same name's landing
sentence repeated inside one second — not a rare shape, a routine part of how that character's own
crowd control actually played out.

`enemySlot`'s rule — reuse a lapsed sibling, else always open a new one — was reasoned from
single-target crowd control, where a recast while something is still up almost never means "the same
target again." An area spell breaks that reasoning outright: its recast usually **re-lands on the
same crowd it hit last time**, because that's what "area effect" means. Applied unmodified, every
recast of such a spell while its earlier targets were still up opened a fresh phantom slot per
landing — the same three real mobs read as three more on the very next cast, and kept climbing.

The wrinkle that makes this solvable at all rather than merely "more ambiguous": **two landings for
the same name inside one cast cannot both be the same target refreshed** — a single instant can't hit
one mob twice. So the log itself proves, on the occasions it happens, that a spell is capable of
landing on several targets at once. Nothing has to be assumed or configured; it only has to be
recognised when it occurs.

## Decision

**A spell earns its area-effect treatment from evidence, and only from evidence — `KnownBuff.aoe`,
set once and never guessed at.** Two landings inside one cast that both require opening a slot never
seen before (not a lapsed reuse — that proves nothing) is the proof; the moment it happens,
`electron/buff-tracker.ts`'s `enemyLandingSlot` marks the row and the change takes effect on the
*next* cast.

**Unproven, nothing changes**: `enemySlotForLanding` (`src/shared/buff-tracking.ts`) is `enemySlot`
verbatim — a recast opens a new slot unless one is lapsed. This is `enemySlot`'s entire original
reasoning, untouched, and it's what keeps ADR 0202's core scenario (two distinct single-target mobs)
exactly as correct as it always was.

**Proven, a cast's landings are matched against what was already up when the cast began — oldest
first — before anything new is opened.** The first landing refreshes the oldest sibling, the second
the next-oldest, and so on; only once the cast has produced more landings than there were siblings to
refresh does the extra one open a genuinely new slot. That is exactly the shape "the same three
re-hit, plus one that just joined" takes in a real log, and it degrades safely: an episode that turns
out to hit the same or fewer targets than before simply refreshes and opens nothing.

**A refresh here is always a fresh application, not a continuation.** `rise()` used to preserve
`since` when a target was already up, on the reasoning a self-buff's "how long have I had this" isn't
restarted by topping it up. That reasoning was never true for a debuff, and mattered only once this
change made an `onEnemy` "refresh" possible at all: an area spell re-landing on something already
mezzed is a real, fresh application, and the learned-duration prediction
([ADR 0202](./0202-two-mobs-sharing-a-name-get-two-debuff-rows.md)) needs the timer to actually
restart or it reads short. `since` is now unconditionally `at` for every `onEnemy` rise.

**The episode itself is identified for free.** `pending`'s own cast-attribution moment — already read
by `castRecently` to decide whether a landing belongs to *you* at all — is the same value that tells
one cast's landings apart from the next one's, so nothing new has to be tracked about *when* a cast
happened, only what its landings did once they're known to share one.

## Consequences

A real chain-mez session now reads as what it is — the same handful of mobs held under an area
effect, occasionally joined by one more — instead of a phantom count that grows every cast. `aoe` is
persisted beside `permanent`/`durationSeconds` as one more fact learned about the spell, so a session
that proved it once doesn't have to re-learn it after a restart.

**The false-positive path is narrow and accepted.** Two people casting the identical spell in the
identical logged second — a coincidence, not this player's own area effect — would be read as proof;
this is the same category of ambiguity `matchCast`/`castRecently` already live with for any shared
zone-visible emote, not a new kind of guess. **The false-negative path costs nothing**: a genuine area
spell simply keeps opening new slots, exactly as it did before this change, until it happens to land
twice at once — which for a spell that really is one, is a matter of casts, not sessions.

`matchingInstances`' fade-closing rule (oldest up sibling breaks first) is unchanged — a fade still
only ever names the mob, never which slot, and area-effect-ness doesn't make that guess any better or
worse than it already was.
