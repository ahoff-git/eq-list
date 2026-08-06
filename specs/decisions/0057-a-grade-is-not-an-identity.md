# 0057: A grade is not an identity, and neither is a difficulty

## Status

Accepted

## Context

EQL decorates two kinds of name with a number, and in both cases the number describes *this copy*
of the thing rather than which thing it is:

- an item can be **graded** — the log's own `--You have looted a Crushbone Belt +2 …--`, and the
  upgrade line that turns it into a `Crushbone Belt +5`;
- a zone can be made **harder**, which appends a number to the zone you entered.

The app matched both literally, and each of the places a name gets matched broke differently:

- **The wiki has no graded pages.** `Dragoon Dirk +2` isn't a page; `Dragoon Dirk` is. So hovering
  a graded drop showed no stat card, clicking it opened nothing, and a name read off a tooltip by
  the screengrab lookup found no page — the fuzzy search's own tokenizer turned the `+2` into a
  token matching nothing, which is enough to drag a good match under the threshold.
- **A graded drop looked like a discovery.** [ADR 0025](./0025-observation-over-the-wiki.md) made
  "undocumented" the headline claim of the Hunt tab, and cited a real reconciliation whose first
  row was `Minotaur Battle Axe +1 — undocumented`. The wiki fixture for that very mob
  (`fixtures/wiki/mob-minotaur-slaver.html`) **lists Minotaur Battle Axe**. The discovery was the
  `+1`. This is the same failure [ADR 0029](./0029-measurements-corrected-against-the-log.md)
  fixed for capitalisation, arriving by a different route: it invents a find *and* reports the
  wiki's own item as never having dropped.
- **A harder zone lost its map.** `findZone` compared normalized names for equality, so a zone
  with a difficulty on it matched nothing — no map, and no "follow me as I travel", exactly when
  you're somewhere out of the ordinary.
- **The shopping list wasn't credited.** A quest wanting a `Crushbone Belt` isn't satisfied by the
  `Crushbone Belt +2` sitting in your bags.

Meanwhile the number is *worth having*. The grade is most of the point of a loot line, and the
difficulty is the point of comparing two camps — a mob's drop rate and what it pays are not the
same question at difficulty 1 and difficulty 3.

## Decision

**A name is folded to its base wherever names are matched, and kept whole wherever the log is
shown or recorded.** `src/shared/names.ts` owns both numbers (`itemBaseName` / `itemGrade`,
`zoneBaseName` / `zoneDifficulty`) so the shapes they come in are stated once.

The fold happens at the existing matching points rather than at any new one:

- `normalizeItemName` (the one fold behind the loot-line-to-list match, the log-to-wiki
  reconciliation, and an item's total across groups) drops a grade.
- `normalizeZone` drops a difficulty, and `findZone` now uses that shared fold instead of its own
  near-copy of it — so the map and the wiki agree about what counts as the same zone.
- The wiki client folds the *query* too, and `getPage` retries the base name when the asked-for
  title has no page. The exact title is tried first, so a build whose wiki does carry a grade
  still gets its own page.

**Grades pool into one drop, and the row is named after the base item.** Several spellings now
land on one key in `reconcileDrops`, so observed counts are added rather than overwritten — a
`+2` and a `+5` are one drop with a second roll on it, and folding must not throw kills away.

**Difficulty is preserved by not folding anything else.** The current zone, kill records, per-zone
reports and pooled mob observations all keep the log's wording, so a mob's rates at difficulty 3
are a separate sample from the same mob at difficulty 1, and "Blackburrow 3" is what the status
bar, the kill list and the camp history say.

The zone's plain trailing number is what the game writes; the parenthesised and `+N` forms are
accepted as well rather than betting on one spelling, and a separator is required so a name that
merely ends in a digit survives intact.

Rejected alternatives:

- **Stripping the number when the line is parsed.** Cheapest, and it destroys the two things the
  numbers are for: which belt you actually looted, and how hard the camp was.
- **Carrying the number as its own field through events, records and the peer payload.** The
  honest data model, and a change to stored shapes and the observation payload for something every
  consumer either ignores or wants spelled out in the name anyway. The helpers make the number
  available to any consumer that later wants it separately.
- **Treating each grade as its own item.** Defensible for a drop rate ("how often is it a +5?"),
  but it multiplies every wiki lookup by the grades in circulation and makes a rate unreadable
  from a session's sample. Items-per-kill is already an open question on the todo; this would be
  the same trade at a worse place.
- **Folding only for the wiki, not for the list.** Leaves the loot match asking a question no
  player would: you have the belt.

## Consequences

- ADR 0025's example re-reads as one undocumented drop of two rather than two of two. The claim
  stands and the standard for making it is now stricter, which is the point of making it at all.
- A graded drop gets its stat card, its page and its list credit, and the screengrab lookup works
  on a tooltip that shows the grade.
- Pooled observations split by difficulty, so a sample takes longer to become believable in a zone
  you play at more than one difficulty. That's the honest split — the alternative pools rates from
  mobs that don't hit the same.
- The zone-difficulty spellings are inferred rather than observed: no zone line in the sample log
  carries one. The tolerant regex covers the plausible forms, and `names.test.ts` is where a real
  line goes when one turns up.
- Nothing in the app yet *shows* the difficulty as a distinct figure — it rides along inside the
  zone name. `zoneDifficulty` exists for the moment a camp comparison wants to sort or group by it.
