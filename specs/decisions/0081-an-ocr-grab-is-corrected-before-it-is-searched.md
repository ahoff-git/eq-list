# 0081: An OCR grab is corrected before it is searched

## Status

Accepted

## Context

The screengrab lookup ends with `cleanText` in `electron/lookup.ts`: strip the characters OCR
invents, collapse whitespace, stop. Whatever survives goes to the Search box, where
[fuzzy.ts](../../src/shared/fuzzy.ts) has to absorb the damage as if it were a typo.

It isn't a typo. A typo is a letter off; an OCR slip is a **specific, repeatable misreading of EQ's
small font**, and the commonest one is not a letter at all — `rn` read as `m`, turning "Morning
Star" into "Moming Star". That is a *deletion spread across a letter boundary*, and it is exactly
the shape fuzzy ranking is worst at: the tokens `moming` and `morning` share a prefix of three, so
the name that is on screen scores below names that merely start the same way. The player sees the
right item in the tooltip, the app searches for it, and finds something else.

We are not the first to hit this. eql-tooltip does the same job for a different player and has the
tally, in `OcrVariants()` (`EqWikiOverlay/Wiki/EqlWikiProvider.cs`, see
[neighbours.md](../neighbours.md)): `rn`→`m` well ahead, then `q`→`g` and `0`→`o`. That list is
**empirical** — it is what their users' grabs actually came back as — which is the kind of knowledge
worth borrowing rather than rediscovering a year later.

Tuning the scorer instead was rejected for the reason [ADR 0075](./0075-a-zone-s-misspelling-is-the-same-zone.md)
gives about zone names: a similarity threshold loose enough to reach this failure is loose enough to
merge things EverQuest deliberately names alike. The damage is known and specific, so the fix should
be too.

## Decision

An OCR grab is **corrected before it is searched**, in two pure steps that `src/shared/ocr-variants.ts`
owns and `lookup.ts` merely orders.

**`ocrReadings(text)` — the raw text, then the corrections, in order and deduped.** The confusion
table is the module's tested surface: each entry says what OCR *wrote* and what may really have been
there. Corrections are offered **one letter at a time first**, because a grab is usually wrong in
exactly one place ("Moming Star" needs the second `m` fixed and the first left alone), then the same
confusion everywhere at once, then everything at once. Capped at twelve readings, the cap falling on
the later, rarer confusions rather than the likely ones.

**`bestReading(readings, known)` — the one that matches a name we know.** Judged with the existing
`fuzzyScore` against the wiki title index the search box already ranks against, with three rules
that all fail the same way:

- **Raw wins ties, and wins outright at 0.95.** A clean grab must never be "corrected" into a
  different real item, and the early exit means the ordinary case scores the index once rather than
  a dozen times.
- **A correction must clear a floor (0.6) as well as beat raw.** When nothing matches — an item with
  no page, a bad grab, an index still warming up — the player gets what OCR actually read, to edit
  for themselves. A guess would be worse than the noise it replaced.
- **Nothing is invented.** The candidates are the table's corrections and nothing else, so the worst
  a useless variant can cost is the scoring.

**The judging is injected, not imported.** `createLookup` takes a `PickReading`, defaulting to
believing OCR; `main.ts` hands it `wiki.bestKnownReading`, which is the only new method — three
lines over the mirrored index it already keeps warm. So the lookup keeps knowing nothing about the
wiki, and the rule itself is testable without either.

## Consequences

"Moming Star" finds Morning Star. So does any other misreading in the table, on any item the wiki
has a page for, and adding the next one found in the field is one entry in one list plus one test —
nothing else moves, which is the whole point of the table being the surface.

**The cost is paid by grabs that were going to fail anyway.** A clean grab scores the index once and
stops at the 0.95 exit; a damaged one scores it once per reading, up to twelve times, after an OCR
that already took seconds. `o`→`0` fires on nearly every English word and will usually be the reason
a reading list is long — it is last in the table because a digit in an item name is rare, and it is
in the table because the neighbour's tally has it.

**A cold index changes nothing.** `bestKnownReading` never waits on the network, so the first grab
after a fresh install behaves exactly as it did before this ADR, and improves silently once the
mirror lands.

The corrections are judged against **item** titles (a grade dropped first, per
[ADR 0057](./0057-a-grade-is-not-an-identity.md)), because that is what a tooltip grab is. A grab of
something else — a zone name, a mob — gets its raw reading unless a correction happens to match an
item page, which is the same answer the search box would have given it.
