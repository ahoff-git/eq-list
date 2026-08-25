# 0139: A difficulty can never cost you a map

## Status

Accepted

## Context

[ADR 0057](./0057-a-grade-is-not-an-identity.md) established that a zone's difficulty describes *this
copy* of the zone and folds away wherever names are matched.
[ADR 0134](./0134-a-map-reference-resolves-to-a-place.md) made every map reference go through one
translation. Both were right, and both were reasoning about the shapes we had *guessed* the game
writes: a trailing number, a `+N`, a parenthesised tag, a dashed tag. ADR 0057 said so outright — "the
zone-difficulty spellings are inferred rather than observed: no zone line in the sample log carries
one."

Then the tier list arrived, as the server publishes it:

> Difficulty 0 (D0) · Difficulty 1 – Awakened (D1) · Difficulty 2 – Adaptive (D2) ·
> Difficulty 3 – Fused (D3) · Difficulty 4 – Refined (D4)

Which is a vocabulary, and the fold had none. Crossing one zone with the shapes that list invites
produced **20 of 52 spellings that reached no map at all**:

| written | folded to | map |
|---|---|---|
| `Blackburrow 3` | `blackburrow` | ✅ |
| `Blackburrow D3` | `blackburrow d3` | ❌ |
| `Blackburrow Fused` | `blackburrow fused` | ❌ |
| `Blackburrow 3 Fused` | `blackburrow 3 fused` | ❌ |
| `Blackburrow [Fused]` | `blackburrow [fused]` | ❌ |
| `Blackburrow Difficulty 3` | `blackburrow difficulty` | ❌ |

That last row is the worst of them: the number came off and left the *word* behind, so the fold
actively manufactured a name no source had ever written.

Two further failures turned up while measuring, both of the same family — the map is right and
something quieter is wrong:

- **`Blackburrow (D3)` read as a ruleset *named* "D3"**, with no difficulty at all. The tag rule claims
  any enclosed tag starting with a letter, and `D` is one. The map folded correctly either way, so the
  only visible symptom was a title saying `D3` where it should say `D3 Fused` — and a difficulty of
  `undefined` on anything filed for analytics.
- **`findZone` matched only the pack's own labels, never the file.** The gazetteer states that
  `Greater Faydark` *is* `gfaydark`, and we ignored it. Measured against a folder whose labels name
  nothing, that hid **36 of the 83** gazetteer zones behind maps we were already holding.
- **One stray full stop hid every ornament rule at once.** They all anchor at the end of the string, so
  `Blackburrow.` found its map — the resolver's word tiers split punctuation out — and `Blackburrow 3.`
  found nothing. The zone line's own parser strips the full stop, so the live path never saw it; a name
  lifted out of **prose** does, which is a wiki page's `Zone: …`, a pasted line, or a peer's note.

## Decision

**Every shape of the tier list folds, and the vocabulary comes from the table rather than from a
guess.** `DIFFICULTY_TIERS` in `names.ts` — the supplied D0–D4 list — now does two jobs: it *names* a
difficulty read off a number, and it is the vocabulary that *recognises* one written out in words. A
supplied table outranking our guesses is the rule the gazetteer already runs on
([ADR 0076](./0076-a-supplied-gazetteer-outranks-our-guesses.md)).

**The ornaments are peeled in a loop, not by a fixed sequence of replacements.** They compose, and the
game does not commit to an order: `Cazic-Thule 3 - Solo`, `Blackburrow Difficulty 2 [Adaptive]`,
`Blackburrow (Fused) 3`. Peeling until nothing more comes off is the only version that does not need a
list of the combinations somebody thought of — which is precisely how twenty shapes went missing.

**What folds by rule is what nothing real can be confused with, and that is a measurement.** Across the
472 zone names the app ships, *nothing* ends in a bracketed tag, a `D<n>`, a `Difficulty <n>`, or a
"<digits> <word>" — and nothing ends in `. , ; : ! ?` either, so **sentence punctuation is peeled
first**, before the rules that anchor at the end of the string. Deliberately not `)` or `"`: nine
shipped names end in a parenthesis and eight in a quote (`The Void "A"`), so those are part of a name
rather than punctuation around one. All of it folds inside `zoneKey`, unguarded.

**The one exception is a bare tier word, and it is guarded by ordering.** Exactly one shipped zone name
ends in one: `Crystallos, Lair of the Awakened`. Folding that by rule would rename a real zone to
`Crystallos, Lair of the` — the same failure the gazetteer's own notes record, where `Qeynos (North)`
renamed a whole city to one of its halves. So the bare word is read only by the **resolver**, which has
the candidate list in hand and tries the name as written first. Crystallos matches itself before
anything is stripped; that ordering *is* the guard. It is a new tier, `difficulty`, sitting between
`order` and `typo`, and it is **not opt-in** — unlike `narrow` and `fuzzy` it removes a stated ornament
rather than guessing at a spelling.

**A named tier states its own number.** The table says Fused is 3, so `Blackburrow (Fused)` is
difficulty 3 rather than "some ruleset, level unknown". And an enclosed number is a number:
`(D3)`, `[D3]`, `(Difficulty 3)` all read as difficulty 3 with no ruleset.

**And the gazetteer is the last resort for a map.** After asking what this pack calls its zones,
`findZone` asks the supplied table which *file* the name is, and takes that file if the pack has it.
This can only ever add a match — it runs when the pack's own labels have found nothing — and it cannot
guess, because the mapping is stated in `eql-classic-zone-maps.json` and checked by a test rather than
trusted. The pack still wins wherever it answered, so [ADR 0061](./0061-a-map-pack-names-its-own-zones.md)
is untouched.

**The claim is tested as a property, not as examples.** `electron/tests/zone-difficulty.test.ts` crosses
every zone the app ships with every shape, ~10,000 lookups, and asserts the map never changes. It
asserts the lookup *count* too, so a refactor that stops generating shapes cannot pass by checking
nothing.

Rejected alternatives:

- **Fold a bare tier word by rule, like everything else.** One line shorter and it renames Crystallos.
- **Fold any "<word>" that trails a number.** Measurably safe against today's corpus and unbounded in
  principle: it would swallow a real zone the day one is named `… 2 Keep`. The vocabulary is the whole
  point — an unknown tier is handled by the guarded tier, where being wrong costs nothing.
- **Put the loose reading in `zoneKey`.** `zoneKey` is the identity kill records and drop rates are
  filed under. A fold that can rename a zone must not be the thing that decides two records are the
  same camp; that is ADR 0059's reasoning and it still holds.
- **Have `findZone` prefer the gazetteer's file over the pack's label.** Simpler to describe, and it
  overrules a pack about its own zones — ADR 0061 exists because pooling labels across packs put one
  folder's name on another's file.
- **Make the `difficulty` tier opt-in like `typo`.** Consistent, and it would leave the travel graph
  and the wiki lookup unable to place a name the map window can, for no stated benefit.

## Consequences

- Every one of the 52 spellings reaches its map; ~10,000 zone × shape lookups lose none. The property
  test is where the 53rd shape gets added when one turns up.
- A zone name is now reachable through the punctuation prose leaves on it, so a wiki page's
  `Zone: Blackburrow 3.` opens the same map as the log's `Blackburrow 3`.
- **`Blackburrow Difficulty 3` no longer folds to `blackburrow difficulty`.** That fold was inventing a
  name, which is worse than failing to match one — it could have collided with something.
- A difficulty is now readable from any shape, so the analytics half of ADR 0057 works on all of them:
  `zoneDifficulty` answers 3 for `(D3)`, for `Difficulty 3` and for `(Fused)` alike.
- 36 of 83 gazetteer zones stopped being hidden by a pack's labelling. Three remain unreachable *as a
  specific file* — `tox`/`toxxulia`, `steamfont`/`steamfontmts`, `nro`/`northro` — where the gazetteer
  lists the zone twice and the resolver takes the first. Both files draw the same zone, so a map loads
  either way; the underlying duplicate is [ADR 0111](./0111-one-zone-one-map-file.md)'s.
- **A bare tier word loads the map but is not named in the title.** `zoneDifficultyLabel` stays
  rule-only, so `Blackburrow Fused` draws Blackburrow and says nothing about the difficulty. Deliberate:
  a display that guessed would eventually label Crystallos as difficulty 1. The map is the goal; the
  label is a nicety, and the shapes the game is known to write all carry a number.
- A zone the gazetteer cannot place still keeps a bare tier word in its **grouping** key
  (`placeName` falls back to the rule-only fold, which is what protects Crystallos there too). So an
  unplaceable custom zone groups its numbered variants and not its worded ones. Stated rather than
  fixed: `place.ts`'s no-assumption fallback is load-bearing, and the log writes names the gazetteer
  knows.
- `ZoneMatchHow` gained `difficulty`, so a caller that reports how a name was matched can say an
  ornament had to come off.
