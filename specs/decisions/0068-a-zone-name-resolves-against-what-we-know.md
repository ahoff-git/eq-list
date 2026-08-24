# 0068: A zone name resolves against what we know

## Status

Accepted

## Context

Four sources name EverQuest's zones and no two agree. The log writes "The Castle of Mistmoore", the
map packs label their exits "Mistmoore Castle", fandom's expansion tables say "Castle Mistmoore", and
a player types whatever they call it.

Until now the app met this with one tool: `zoneKey` (`src/shared/names.ts`), a **fold** that strips
case, a leading "the", spacing, EverQuest's backtick apostrophe and a difficulty suffix
([ADR 0057](./0057-a-grade-is-not-an-identity.md)), then applies a hand-curated alias table. That
fold is also the *identity* of a zone: kill records, drop rates, mob knowledge and hunt grouping all
key on it, and [ADR 0059](./0059-a-zone-s-variants-are-one-zone.md) settled that identity is exact
after folding and never by containment, because "commonlands" sits inside "east commonlands".

A fold cannot reach word order, and hand-listing every rephrasing doesn't scale. The cost was already
being paid: of the 31 zones stated in `CURATED_ZONES`, **16 fail to resolve against the shipped
expansion table** — every one of them looked up as "a zone we've never heard of". The disagreements
come in four shapes:

| shape | example |
| --- | --- |
| word order and filler | `Castle Mistmoore` / `Mistmoore Castle` / `The Castle of Mistmoore` |
| a sub-zone against its parent | `North Qeynos` → `Qeynos`, `Neriak Commons` → `Neriak` |
| a qualifier one side doesn't use | `Clan Crushbone` → `Crushbone`, `RunnyEye Citadel` → `Clan Runnyeye` |
| genuinely absent | `Kerra Ridge`, `Butcherblock Mountains` — a gap in the table, not a name problem |

The tempting fix — loosen `zoneKey` — is the wrong one, and ADR 0059 already says why: a looser fold
is looser *everywhere*, including where zone identity keys a stored record, and would merge East and
West Commonlands' kills.

## Decision

**Looseness belongs to a resolver, not to the fold.** `zoneKey` stays exactly as strict as it was.
A new black box, `src/shared/zones/resolve.ts`, matches a name against **a list of candidates the
caller supplies**.

That's the move that makes the rest safe. A fold takes a string and returns a string, so it has to be
right about a name it has never seen. A resolver is handed the vocabulary, so it can be loose *and*
fail closed: it answers only when exactly one candidate wins, and says nothing when two do.

Four tiers, each reached only when the one above found nothing:

- **`exact`** — `zoneKey` equality, curated aliases included. What every call site did before.
- **`order`** — the same identifying words in any order, ignoring "the"/"of"/"a"/"an". This is the
  todo's Mistmoore case, and it is still a fold — it just sorts the words.
- **`narrower`** — the name says everything a candidate says and more, by whole words:
  "North Qeynos" ⊃ "Qeynos". Whole-word subset, *not* substring containment — "commonlands" is a
  word-subset of "east commonlands" too, which is why this tier is opt-in rather than universal.
  Where several candidates fit, the most specific wins; where two tie, none does.
- **`fuzzy`** — spelling alone via the existing `fuzzyScore` (`src/shared/fuzzy.ts`, reused rather
  than reinvented), gated on **both** a score floor (0.7) and a clear margin over the best rival
  (0.08).

**How loose a call site goes is set by what a wrong answer costs there**, and the three sites differ:

| call site | tiers | why |
| --- | --- | --- |
| `zoneExpansion` (`zones/expansions.ts`) | all four | The result is a badge and an availability check that already fails open ([ADR 0065](./0065-a-zone-belongs-to-an-expansion.md)). A wrong match mislabels; it doesn't mis-draw. |
| `zoneFileFor` (`travel/types.ts`) | `exact`, `order` | A route to the wrong end of the Commonlands is a wrong answer that reads like a right one. |
| `findZone` (`map/zones.ts`) | `exact`, `order` | A wrong file is the one naming mistake that doesn't fail closed: it draws a different zone under the right name and puts every position you plot somewhere else entirely. Better no map than the wrong map. |

`order` is safe everywhere because rephrasing cannot pick a *different* zone — only a differently
worded same one.

The curated alias table survives, with a narrower job: pairs **no rule can reach**. `RunnyEye
Citadel` → `Clan Runnyeye` is the proof it's still needed — scored against the whole table, the right
answer (0.32) ranks *below* a wrong one (`Estate of Unrest`, 0.38), so no threshold could have
rescued it. Two entries were added on that basis (`clan runnyeye`, `north ro`).

## Consequences

**The 16 broken expansion lookups are fixed** — 14 by rule, 2 by the new aliases. The rest
(`Kerra Ridge`, `Butcherblock Mountains`, `EverQuest Legends Tutorial`, `New Sebilis Expedition`)
correctly stay unknown: they are zones the table lacks, and inventing a match for them is exactly
what the margin rule exists to prevent.

**The `fuzzy` tier currently fires on nothing.** Measured across all 344 shipped zones it matches no
name the other three tiers miss, and refuses every near miss — including `Butcherblock Mountains`,
whose best offer is `Tenebrous Mountains` at 0.33. That silence is the tier working as specified: it
is a last resort that only speaks when it is sure, and it will start earning its keep as the app
meets zone names from sources we haven't seen yet. It is also the tier to suspect first if a zone
ever resolves surprisingly.

**The load-bearing safety property is tested against the real table, not a fixture**
(`electron/tests/zone-resolve.test.ts`): with every tier on, all 344 zones resolve to themselves and
none to a neighbour. A hand-picked fixture could not show that.

**`zoneKey` is unchanged as an identity**, so nothing stored is re-keyed — no record folds differently
than it did, because the fold is computed at read time and never persisted. The two new aliases do
merge their pairs everywhere, which is correct: they are the same zone.

**A new asymmetry to keep in mind.** An alias has no candidate list to be outvoted by, so it is
believed everywhere and forever, while a resolver match is always checked against what the caller
actually has. That makes the alias table the *more* dangerous of the two — the opposite of the
intuition that hand-written entries are the safe ones.
