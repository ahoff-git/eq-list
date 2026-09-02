# 0174: The era decides which drawing is the zone

## Status
Accepted

## Context
Reported from the app: **the Navigation tab didn't know there is a wizard port to the Northern Desert
of Ro.** There is — the Minor Spire sits in the north-west of the desert, and `Ro Gate` is the spell.

Brewall ships `nro.txt` and `northro.txt`, and they are not two drawings of one moment. `nro` labels
`to East Commonlands`, `to Oasis of Marr`, `to East Freeport` and `to Iceclad Ocean`, and it marks the
**Minor Spire**. `northro` labels `to The Commonlands`, `to Freeport Sewers`, `to South Desert of Ro`
and `to The Eastern Wastes`, carries LDoN camps and a Wayfarer port, and marks **no spire at all**.
One is the classic zone this server runs; the other is the 2006 revamp, redrawn in its own frame.

Two rules pointed the wrong way at once, and each one hid the other:

- The gazetteer's `VERIFIED` list named **`northro`** "Northern Desert of Ro"
  ([ADR 0076](./0076-a-supplied-gazetteer-outranks-our-guesses.md)), overruling the supplied table's
  `nro`, on the stated grounds that it was "the one that exists in a real install". Both exist. So the
  *revamp* drawing held the name — and a name is what the map window, the era check and the travel
  graph all key on.
- [ADR 0111](./0111-one-zone-one-map-file.md) folds two drawings of one zone into one, but its test is
  closed-up spelling: `southro` folds to "South Ro" and pairs with `sro`, while `northro` does not fold
  to "Northern Desert of Ro" and pairs with nothing. So North Ro entered the graph **twice**.

The result was the two halves of one zone, split so that neither worked. The half a player could name
(`northro`, "Northern Desert of Ro") had the revamp's borders and no port. The half with the spire
(`nro`) was reachable only as the bare string "Nro", and the wiki adjacency this app already ships —
which names East Freeport, East Commonlands, Iceclad Ocean and Oasis of Marr for this zone, `nro`'s
list exactly — was grafted onto the revamp instead, as borders with no coordinates.

## Decision
**Where a pack draws one zone in two eras, the drawing that matches this server's era is the zone** —
whatever either table happens to have named.

- The gazetteer's verified entry for "Northern Desert of Ro" is **`nro`**. Fandom's "North Ro" stays
  an alias, so both spellings resolve and the expansion lookup is untouched.
- `northro` joins `STALE_DRAWINGS` (`manual-links.ts`), which is where
  [ADR 0111](./0111-one-zone-one-map-file.md)'s rule already sends a pair its spelling test can't see —
  the same entry `freeporteast` has, for the same reason and on the same evidence.
- **The evidence is the exits, and it is the check to run before any such entry.** A file's neighbours
  identify it, which is the gazetteer's own rule for adding a verified name; a drawing whose exits
  name zones this server hasn't got is drawing a different era of the place. Nothing here is a guess
  about which map is prettier or fuller.

This does not change ADR 0076 — the supplied table still loses to a verified entry, and here it
happened to agree with the corrected one — nor ADR 0111's fold. It corrects one wrong entry and adds
one pair the fold can't see.

## Consequences
- The wizard network reaches North Ro: a route now reads *Teleport → Minor Spire · Northern Desert of
  Ro*, which is the reported miss.
- North Ro is **one** zone in the graph again, with measured coordinates on its borders to Oasis of
  Marr, East Freeport and East Commonlands, where the revamp half had claimed borders and no
  positions.
- The map window draws `nro.txt` for the zone. This matters beyond the spire: the two files are
  different coordinate frames, so every position plotted on the revamp drawing was in the wrong one.
- `northro` keeps its file name in the picker ("Northro") and is no longer offered as a place to
  travel to. That is the ADR 0111 bargain: the loser stays selectable and stops being a second zone.
- Two ADRs cite `nro`/`northro` as an example of a *file* the two tables disagree about
  ([0076](./0076-a-supplied-gazetteer-outranks-our-guesses.md),
  [0139](./0139-a-difficulty-can-never-cost-a-map.md)). They no longer disagree about it; the example
  is stale where it stands, and this record is the correction rather than an edit to either.
- **`sro`/`southro` is the same pair and was already right**, by luck rather than by rule: `sro` was
  named, so ADR 0111's fold caught it. Worth remembering that the fold catching a pair says nothing
  about *which* of the two it kept — only that it kept the named one.
