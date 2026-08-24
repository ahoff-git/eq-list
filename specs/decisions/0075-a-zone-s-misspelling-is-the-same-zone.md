# 0075: A zone's misspelling is the same zone

## Status
Accepted

`sameZoneOrMisspelling` as a **filter** stands. `createZoneCanon`'s frequency keying is superseded by
[0083](./0083-a-zone-name-is-stored-raw-and-grouped-on-read.md) — a key comes from the gazetteer, not
from what a batch happened to contain.

## Context

Four sources name EverQuest's zones and no two agree, which
[ADR 0068](./0068-a-zone-name-resolves-against-what-we-know.md) answered for every difference a
*rule* can reach: case, a leading "the", spacing, EQ's backtick apostrophe, a difficulty suffix, word
order, a sub-zone finding its parent. What none of that reaches is a **typo**, and the corpus is full
of them, because a map pack's zone names are hand-typed exit labels: one pack writes `Toxulia Forest`
where the game's own maps and the log write `Toxxulia Forest`.

One letter, and the two names are strangers. What that cost, all from the same missing `x`:

- **The picker offered the zone twice.** `zonesFromFiles` keeps names unique by exact string, so a
  curated `Toxxulia Forest` and a solved `Toxulia Forest` are two rows for one place — and the same
  hole let a **borrowed** zone ([ADR 0063](./0063-a-zone-the-pack-lacks-is-borrowed.md)) in beside the
  pack's own copy of it. One of the two draws the map; picking the other is a dead end.
- **`findZone` found nothing.** The log's zone name has to resolve to a map *file*, so a pack whose
  label is a letter out meant no map at all for a zone the folder demonstrably has.
- **The kills went missing.** Both `killLog.kills(zone)` and mob knowledge's `forZone` filter with
  `sameZone`, and the name they're asked with is usually the map's rather than the log's — so an
  evening's kills sat in the log, invisible, while the map that should have drawn them was on screen.
- **Pooling split in half.** Peers share kills and observations stamped with *their* zone name, which
  is *their* pack's label. A peer using a differently-spelled pack didn't sharpen your rate for the
  camp you were both standing in; they started a second camp beside it, each with a sample too thin to
  believe ([ADR 0025](./0025-observation-over-the-wiki.md)'s bar).

The obvious tool is the wrong shape. `fuzzyScore` — the search box's scorer — gives `East
Commonlands` and `West Commonlands` **0.75**, and they are two of EverQuest's most distinct places;
[ADR 0059](./0059-a-zone-s-variants-are-one-zone.md) exists partly to keep their kills apart. A
similarity threshold that catches one missing letter also catches the compass points EverQuest names
half its world with.

## Decision

A zone name is the same zone as another when their **spellings** are within **one edit**, their
**last characters agree**, and both are at least five characters long. `src/shared/zones/spelling.ts`
owns the rule; a spelling is `zoneKey` with punctuation and spacing closed up, so `Erud's Crossing`
and `Eruds Crossing` are already one before any editing is counted.

**It is measured, not tuned.** Across all 361 zone names the app ships — the fetched fandom expansion
table plus the curated list — exactly one pair sits within one edit: `Plane of Time A` / `Plane of
Time B`. That pair is what the last-character clause is for: a trailing letter is how the game numbers
siblings, not how a mapmaker slips. At **two** edits the same corpus offers twelve pairs and every one
is a real distinction (East/West Karana, North/South Qeynos, Ashengate East/West, Gyrospire
Beza/Zeka), which is why one edit is the ceiling rather than a starting point. The corpus check is a
test, so regenerating the expansion table can't quietly invalidate it.

**`sameZone` does not change.** It stays the strict fold that *keys* a kill record (ADR 0059);
`sameZoneOrMisspelling` is a superset of it, and the distinction is the same one ADR 0068 drew: use it
to **ask**, never to key. Four callers ask:

- `resolveZone` gains a **`typo` tier**, above `narrower` and `fuzzy` because — unlike them — it
  cannot name a different zone. Like every other tier it is opt-in and fails closed: two candidates a
  keystroke from the query is refused, not guessed between (`Estkarana` is one edit from both Karanas).
  `findZone` takes it, which is a strictness the map has otherwise refused, on the strength of the
  corpus measurement above.
- `zonesFromFiles` and `zonesFromSources` judge **name uniqueness** by it, so the second spelling of a
  place loses and its file keeps its short name (`Tox`) — honest, still selectable, and no longer
  claiming to be a forest.
- `killLog.kills(zone)` and `mob-knowledge`'s `forZone` **answer** with it.
- The map's `zoneMatch`, which decides whether a peer's kills, pins and pings are in the zone you're
  looking at.

**Keying gets the vocabulary instead of the rule.** A fold takes one string and must be right about a
name it has never seen, so it cannot know which of two spellings is the real one. `createZoneCanon` is
handed the whole batch — every kill's zone, or every observation's — and settles it by **frequency**:
the spelling seen most often wins, ties going to the one seen first. `observeMobs`,
`sumObservations` and `mergeObservations` key through it, with yours listed before peers' so a tie
falls to the spelling your own log uses. Two spellings of a camp are therefore **one tally** rather
than two rows that merely both appear.

## Consequences

A pack that misspells a zone costs nothing: one entry in the picker, the map drawn from whichever file
has it, your kills and your peers' pooled into one sample under the spelling you actually see. The
`Toxxulia`/`Toxulia` duplicate that prompted this is gone, and so is the class it belongs to.

The rule is **pairwise loose in a way the corpus doesn't expose**: a name can sit one edit from two
zones that are two edits from each other. Every consumer handles that by refusing — the resolver via
`sole`, the naming rules by keeping the first claim — but a *filter* has no such option, so
`kills("Estkarana")` would answer with both Karanas' kills. That is a name no source produces, and the
failure direction is a list with too much in it rather than a map drawn in the wrong place.

Clustering is **per batch**, so the canonical spelling is a property of the data in front of you
rather than something stored. It follows that a zone's displayed name can change as the batch does —
kill enough in a misspelled zone with the log spelling it that way and the tally renames itself. That
is the honest answer for a name we only ever inferred, and nothing is keyed to it on disk: records keep
the log's verbatim wording, as they do for difficulty.

Five characters is a floor, not a finding: nothing in the shipped table is short enough for it to
matter (`Guk` is three, and shares a spelling with nothing). It's there so a future three-letter zone
can't be merged into a neighbour by one keystroke.
