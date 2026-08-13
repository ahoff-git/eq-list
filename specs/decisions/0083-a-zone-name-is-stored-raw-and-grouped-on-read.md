# 0083: A zone name is stored raw and grouped on read

## Status

Accepted

## Context

Zone names arrive in four vocabularies and no two agree, and the app has accumulated real machinery for
reconciling them: a fold for the differences a rule can reach ([ADR 0057](./0057-a-grade-is-not-an-identity.md)),
a resolver handed the candidate list ([ADR 0068](./0068-a-zone-name-resolves-against-what-we-know.md)),
a one-edit rule for a mapmaker's typo ([ADR 0075](./0075-a-zone-s-misspelling-is-the-same-zone.md)), and
a supplied gazetteer that says which file a zone is and which names mean it
([ADR 0076](./0076-a-supplied-gazetteer-outranks-our-guesses.md)).

All of that is *inference*. Some of it had been allowed to run **before the data was written**, and
that's the problem this records.

[ADR 0059](./0059-a-zone-s-variants-are-one-zone.md) put the fold at `keyOf` in `mob-stats.ts`,
describing the three places it applied as "all of them questions rather than storage". Two of them
were. The third wasn't: `keyOf` also keys the observations that a **retired** tally is written from
([ADR 0056](./0056-a-dropped-record-keeps-what-it-taught.md)) and that are **sent to peers**. So an
observation went to disk under a name the log never used — `zoneBaseName`, with the difficulty the
game stated stripped out. 0059's own consequences admitted the cost: *"neither can be recovered from
the observation"*.

ADR 0075 then made it materially worse. Grouping two *spellings* needs a vocabulary, and the one it
used was the batch in memory: `createZoneCanon` picked whichever spelling appeared **most often** among
the rows in front of it, ties going to the first seen. That is a written-down conclusion whose value
depends on what else happened to be in the same array — the same records could be summarised under one
name today and another tomorrow, and neither would be a name anybody chose.

Three things follow that are all worse than the duplicate rows they were avoiding:

- **A mapping-table fix can't fix history.** The whole point of a table is that a wrong entry is
  correctable. Once a conclusion is baked into a stored row, correcting the table leaves the old rows
  saying the old thing, with nothing to re-derive them from.
- **A fact the game told us is gone.** "Blackburrow 3" is the difficulty the player chose, and the
  decisions log already carries an open question that wants to read it back off history.
- **Aggregation stops being repeatable**, which makes a wrong figure impossible to reason about: you
  can't tell a bad rule from bad data if the data was written by the rule.

## Decision

**Store the in-game zone name, exactly as the log wrote it. Group on read.**

Every stored shape carries the log's own wording, verbatim: `KillRecord.zone` and `StoredFight.zone`
already did, and `MobObservation.zone` now does too — no `zoneBaseName`, no canonical spelling, no
batch-derived anything. `keyOf` in `mob-stats.ts` is the raw name, so two spellings or two difficulties
of one camp are **two stored rows**. Space is cheap; a discarded fact isn't.

Every "these are the same camp" judgement moves to `src/shared/zones/place.ts`, which is the one place
that decides it:

- `placeName(zone)` — the place a recorded name means, named the way we name it. Resolved against the
  **gazetteer's list of this server's zones** with the `typo` tier on, so a difficulty variant, an
  alias and a mapmaker's misspelling all land on one stated name.
- `placeKey(zone)` — that name, folded: the key an aggregate groups under.
- `samePlace(a, b)` — the question form, used by `killLog.kills(zone)`, `mobKnowledge.forZone(zone)`
  and the map's `zoneMatch`.

**A key comes from a table; only a filter may be fuzzy.** `placeName` refuses to cluster by
similarity, because clustering depends on what else is in the batch — the exact defect above. A group's
identity is therefore always a name someone stated in the gazetteer. `samePlace` is allowed the extra
one-edit chance for a pair no table knows at all, because a filter that says yes too often shows a row
that doesn't belong, where a key that says yes too often corrupts every rate derived from it.

**A zone no table knows keeps its own name**, folded only by rule (difficulty and ruleset off — that's
a rule about what a name *means*, not a guess about which place it is). It groups its own variants and
nothing else, which is the no-assumption answer for a Legends custom zone or a pack's own map.

The three aggregations now read through it: `mergeObservations` (the 📖 panel and every drop rate),
`combatHistory.zones()` (the camp report — which was grouping by raw string, so one camp played at two
difficulties was two rows that each looked half as good as the evening was), and the map's peer
matching.

## Consequences

**Aggregation is repeatable and fixable, and that is now a tested property.** The same stored rows give
the same answer whatever order they arrive in (`mob-stats.test.ts` asserts it against a reversed
input), and correcting the gazetteer corrects every figure ever derived from every row already on disk
— including rows written by an older build, including peers'. Nothing needs migrating, because nothing
was rewritten.

Stored data grows: an observation per zone *spelling* rather than per zone. On real data that is a
handful of extra rows per mob at worst — a camp is one wording almost always, and the peer payload cap
(2000 observations) is nowhere near it. Memory is the tighter budget, so the read side is built for it:
one resolver over ~80 names, built once at module load and memoised, rather than a fresh index per
aggregation pass.

This **supersedes the `keyOf` third of ADR 0059** and the naming half of ADR 0075. What both were for
still holds — one Steamfont is one camp, and a letter out is the same forest — but as a read-time
grouping instead of a write-time fold. 0059's other two applications (the two queries) stand unchanged,
as does its one deliberate exception: which `/loc` fix may place a kill still compares the zone
**verbatim**, because stepping between difficulties is a teleport like any other.

Two stored names are deliberately **not** the log's, and the distinction is worth stating because it is
the test for whether this rule applies: a **pin** and a **ping** carry the name of the map they were
placed on, because that is what they are a fact about — you dropped a marker on this map — and neither
is evidence about the game. Everything that *records what the game said* keeps the game's wording,
including a kill shared to a peer, which now travels tagged with the zone it was recorded in rather than
the one the sharer happened to be viewing.

`createZoneCanon` is deleted rather than left unused. The `MobObservation` rows an older build wrote
under a folded name are still read, still pooled, and still correct — they group by place like anything
else; they just can't say which difficulty they came from, and no new row will have that gap.
