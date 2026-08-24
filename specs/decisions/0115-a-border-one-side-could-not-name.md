# 0115: A border only one side could name is named by the other side

## Status
Accepted

## Context
Misty Thicket's map labels a way out to `The Liberated Citadel of Runnyeye`. Nothing in the catalogue
answers to that name — the app calls the zone *RunnyEye Citadel* — so `zoneFileFor` resolved it to
nothing, the label was counted as an unresolved destination, and **its coordinate was thrown away**.

RunnyEye's own map labels `to Misty Thicket`, which resolves fine. So the border between them
**exists**, with a position on one side and none on the other, and every walk to it from Misty Thicket
is priced at `UNKNOWN_CROSSING` — a 2,000-unit stand-in wearing a `?`. A player following a real route
saw exactly that, and both halves of the answer were sitting in the same folder the whole time.

It is not one label. Across a 590-file pack: **216 destinations nothing could place** and **161
one-sided borders**, and the overlap between the two lists is the shape of the problem. `The Feerott`
is one r short of The Feerrott. `Nekulos Forest` and `Nektulos Forrest` are both Nektulos Forest.
`North Desert of Ro` is Northern Desert of Ro. `Crystal Caverns (exit from lower level)` is Crystal
Caverns with a note nobody stripped.

[ADR 0068](./0068-a-zone-name-resolves-against-what-we-know.md) rules the resolver's looser tiers out
for `zoneFileFor`, and it is right to: against 590 candidates, `narrower` sends "East Commonlands" to
"Commonlands", which is a wrong answer that reads like a right one.

## Decision
**For a destination nothing could place, the candidates are the zones that claim a border with this
one and got no coordinates from it** — and against *that* list, every tier is allowed.

- The candidate set is precisely the borders someone else named and we didn't. It is a handful, and
  **every name on it is already asserting the connection**.
- So the looser tiers are affordable here where they aren't globally: **this pass never invents a
  border.** It decides which of a zone's own labels is the one the neighbour was talking about, and
  all it contributes is the *coordinate*. The worst a wrong answer can do is measure a walk to the
  wrong exit — not claim a way through that isn't there.
- `resolveZone` still **fails closed**: two claimants that fit equally well is a question the graph
  can't answer, so it doesn't. An unplaced border is a stand-in a route already flags; a wrongly
  placed one is a confident lie.
- Run **after the whole corpus is read**, because a border may be claimed by a zone read later, and
  **before the walks**, since a coordinate is exactly what a walk's cost is computed from.
- A destination paired this way is **no longer reported as unresolved**. Counting it under both
  headings would be a graph disagreeing with itself about what it knows.
- Every pairing is **reported** (`report.paired`, with the tier that made it), because an inference
  nobody can see is one nobody can correct.

## Consequences
On the pack that prompted it: **17 labels paired, all 17 correct**, taking one-sided borders from 161
to 146. Misty Thicket goes from one unplaced border to none, and the `2000?` in the middle of a real
route becomes a measured distance.

The tiers earn their places: `exact` (2 — names that only ever failed because the global list had a
rival), `typo` (3 — *Feerott*, *Nekulos*, *Nektulos Forrest*), `narrower` (6 — *The Liberated Citadel
of Runnyeye* and the parenthesised *Crystal Caverns*), `fuzzy` (6 — *North Desert of Ro*, *Neriak -
Foreign Quarter*). Dropping `fuzzy` would lose 6 correct pairings and gain nothing measurable.

**Both sides staying silent is still a hole.** If neither zone names the other resolvably there is no
claim to corroborate against, and the border simply doesn't exist — 212 destinations remain unplaced,
most of them zones this server hasn't got. That is the right answer, not a shortfall.

The remaining risk is a **wrongly measured walk**, not a wrong connection, and it is visible: every
pairing is in the report, and the tier is on it, so the `fuzzy` ones can be read first.

Rejected:

- **Loosening `zoneFileFor` globally.** [ADR 0068](./0068-a-zone-name-resolves-against-what-we-know.md)
  again: against everything, `narrower` and `fuzzy` produce wrong answers that read like right ones.
  The corroboration is the entire licence for using them.
- **An alias per label.** `The Liberated Citadel of Runnyeye` is a real EverQuest zone name, so an
  alias would have been defensible — but there are seventeen of these in one pack and a different
  seventeen in the next, and a hand-list that has to grow per pack is a list that goes stale.
- **Inventing the border when the name half-matches any zone.** Without a reciprocal claim there is no
  evidence, and a confident border to the wrong zone is far worse than an honest stand-in.
- **Pairing on the reciprocal claim alone**, ignoring the name. A zone with two unplaced borders and
  two unresolved labels would then be paired by nothing but list order.
