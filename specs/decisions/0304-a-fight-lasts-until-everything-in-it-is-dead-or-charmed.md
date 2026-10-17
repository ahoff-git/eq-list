# 0304: A fight lasts until everything in it is dead or charmed

## Status

Accepted

## Context

[ADR 0036](./0036-a-fight-ends-on-death-not-a-lull.md) ended a fight on a death rather than a lull,
but read "resolved" off two timestamps: the fight was resolved when the last thing to happen was *a*
kill. Fighting two mobs, killing the first resolved the fight while the second was still on you. And
an unresolved fight timed out after 60s of silence — a mez break, a kite, or a med break was long
enough to split one engagement into two.

The user's definition is plainer: if something hits you, or you hit it, the combat isn't over until
it's killed or charmed.

## Decision

**The fight scope keeps the set of creatures still standing.** Anything your side trades blows with
joins it (the same "one side is ours" rule that already names enemies,
[fight-scope.ts](../../src/shared/combat/fight-scope.ts)). It leaves when:

- it is **killed** — by anyone, since a stranger finishing your mob still finishes it;
- it is **charmed** — a new `charm` event reads "<mob> has been charmed."; its next swing after the
  charm breaks puts it straight back. "has been enthralled." is *not* read: Enthrall is a mez, and a
  mezzed mob is still up and still has to be killed;
- **you die** — everything leaves at once.

Two log shapes would otherwise sit in the set forever, so they are handled where the set is kept:
an NPC pet (`<owner> pet`) leaves with its owner, because the game despawns it with no kill line; and
a DoT tick that names no caster doesn't make the spell an opponent.

A fight is **resolved** when nothing is left standing; then the existing 10s quiet closes it.
Otherwise only two things end it: **zoning** (filed on the spot as `timeout`, stamped with the zone
it happened in), or `ABANDONED_END_MS` — **five minutes** of total silence, for the mob that fled out
of earshot or died where its kill line never reached you. A swing at yourself (Cannibalize) never
opens a fight. The end reason gains `charm`.

## Consequences

Replayed over the author's 800k-line log: the longest 1% of fights went from 28 minutes to 6, almost
all of the old tail having been NPC pets that never got a kill line. Two mobs on you is one fight
until both are down.

Chain-pulling where something is always still up is now **one fight** — one 51-minute dungeon
stretch with 68 kills files as a single entry. That is the definition taken at its word; per-mob
time-to-kill is unaffected, as it is measured between kills.

Keying by name means one "a coyote" dying stands down every coyote until the survivor's next swing,
which then opens it again. Within 10s that's harmless; a mezzed twin left for longer can let the
fight close early.
