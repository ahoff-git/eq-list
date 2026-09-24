# 0275: A shared swing proves the same fight

## Status
Superseded by [0276](./0276-overlapping-fights-are-pooled-not-only-proven.md) — supersedes [0274](./0274-a-fight-is-compared-live-with-your-party.md)

## Context
[ADR 0274](./0274-a-fight-is-compared-live-with-your-party.md) shipped fight comparison as a guess:
restrict candidates to your own party roster, then treat a party-mate's shared fight as "the one
you're in" when their zone matches and their last report is recent. It said outright that nothing
could do better, since the log names no fight id.

That was wrong, and the fix was pointed out directly: **the log already gives two installs a way to
agree.** `combat-parser.ts`'s own header says it plainly — EQ logs every swing *in earshot*, not only
the swings that are yours. Two players standing near the same fight see the same line, stamped to the
same second: "Kainos pierces a gnoll for 20 points of damage." isn't a fact about Kainos's screen, it's
a fact about that swing, and it's written identically into anyone's log who was close enough to read
it. A (attacker, target, amount, moment) tuple is therefore not a guess about which fight two peers
share — it's proof, the same log line both installs independently produced.

The one thing 0274 got right and this keeps: comparison stays self-reported and unmerged, the same
terms `PeerScores` already sets for a shared high score.

## Decision
**A `fight` row now carries a handful of recent hits, and an overlapping one is what proves a match —
not zone, not recency, not party membership.**

- `CombatStats` gains `recentHits: FightHit[]` — the current fight's most recent landed hits (`{attacker,
  target, amount, at}`), capped at `MAX_RECENT_HITS` (20, `combat-stats.ts`) and rolling: the oldest
  hit is dropped the moment a new one lands, which is also what lets a match go stale on its own once
  two peers are no longer actually near each other. Recorded in `apply()`'s `"damage"` case, right
  beside the cell it's also recorded into — the same event, kept a little longer and a little more
  loosely, for a different question.
- `FightShare` (the wire row) gains `recentHits` too. `shareableHits` resolves your own `SELF` ("You")
  into your real name before it leaves — exactly the reasoning `shareableBuffs` already applies to a
  buff's `ON_YOU`: only the sender knows who "You" is, and a receiver who sees "You" hit something has
  no name to match it against. A pet's name (`Kainos\`s warder`) is already absolute and needs no
  resolving.
- `matchingHits(mine, theirs)` counts overlapping tuples — same attacker, same target, same amount,
  within `HIT_MATCH_TOLERANCE_MS` (1.5s, generous slack over the log's one-second resolution).
  `matchedFights` keeps only peers clearing `MIN_MATCHING_HITS` (2): one overlap could be an unlucky
  coincidence on a common small hit against a generic mob name; two independent ones essentially
  can't be, and a named player can't collide at all (character names are unique, so once "You" is
  resolved, an attacker or target naming a specific person is already a near-certain match on its
  own).
- **Party scoping is gone.** Nothing here checks `useParty()` any more — the deleted field is
  `CombatStats.party`, added by 0274 and used nowhere else (`CombatTracker.party()` itself predates
  both ADRs and is untouched; it still backs the party-scoping the rest of the Combat tab uses,
  [ADR 0067](./0067-the-meter-counts-your-party-s-fights.md)). `matchedFights` runs over *every* peer
  offering `fight`, not just ones your log recognizes as your group — proof needs no roster, which is
  exactly what makes checking the whole room safe.
- `PeerFightCompare` is simplified along with it: no zone, no "elsewhere" bucket for an unmatched
  party-mate (there's no party list to be unmatched against any more), no freshness constant of its
  own (the rolling buffer already expires a match by construction). It renders nothing until you've
  landed a hit this fight — nothing to prove anything against yet — and otherwise shows either a
  confirmed comparison table or an empty state naming what a match needs (both sides sharing, and
  logs that actually overlap).

## Consequences
- A match is now provable rather than reported, and that's what let the whole room become fair game
  instead of only your own roster — closing the "more than one room" workaround 0274 leaned on, more
  thoroughly than party-scoping ever could have: this doesn't need a smaller room, it needs an actual
  overlapping observation, which is the honest version of "these specific people" that a room-scoping
  feature would only have approximated anyway. `decisions/README.md`'s open question is updated to
  reflect that this ADR no longer stands as a workaround waiting on it.
- The one real gap: this only works when logs actually overlap. EQ's earshot radius is about
  proximity, not group membership, so a backline healer who never logged the puller's opening swings
  has nothing to match against — and, unlike 0274, there is no fallback for that case any more. That
  was a deliberate choice, not an oversight: a hybrid was considered and rejected in favor of keeping
  exactly one mechanism, proven or silent, rather than two paths of different confidence that the UI
  would then have to distinguish.
- A small new payload rides the `fight` kind — up to 20 short records — capped on both ends
  (`MAX_RECENT_HITS` on the way out, `MAX_SHARED_HITS` reading a peer's `give` on the way in), the
  same forgiving-but-bounded shape every other kind in `SHARE_KINDS` already uses.
- `electron/tests/peer-share.test.ts` and `electron/tests/combat-stats.test.ts` carry the two
  properties that matter: `shareableHits` resolves `SELF` correctly on the way out, and
  `matchingHits`/`matchedFights` require real overlap (a lone coincidental hit, or a same-amount hit
  from a different attacker, proves nothing).
