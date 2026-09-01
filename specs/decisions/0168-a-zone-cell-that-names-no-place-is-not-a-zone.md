# 0168: A zone cell that names no place is not a zone

## Status

Accepted

## Context

An item's zones come from the "Zone" column of the wiki's drop tables, and those tables are written
by hand. A handful of their cells hold something that is not a zone:

| cell | items | what it actually is |
|---|---|---|
| `Various Zones` | 106 | the wiki declining to name anywhere |
| `(ToV East mobs)` | 21 | a section header inside the table |
| `Unconfirmed:` | 6 | a section header |
| `Pre-Revamp` | 3 | *when*, not where — Cazic Thule the god, before the zone was rebuilt |
| `Other 50+ zones` | 1 | the wiki declining, at length |
| `Unknown` | 1 | the wiki declining, briefly |
| `Zone Name` | 1 | the table's own header row, leaked |
| `Confirmed Drop Zones` | 1 | a section header |

Eight values across 139 items. Individually trivial; collectively they were 8 of the 154 rows in the
Zone picker, sitting in the alphabet looking exactly like places. "Staff of the Earthcrafter drops in
Pre-Revamp" is the report that surfaced it, and it is a fair thing to be baffled by.

The obvious rule — *drop any zone the bundled gazetteer can't resolve* — was written first and
measured, and it is badly wrong: **49 of the 154 fail to resolve**, Kaladim, East Karana, Burning
Woods and Highpass Keep among them. The gazetteer is a table of level ranges, not a census of places,
and treating a gap in it as evidence would have thrown away a third of the zones in the game.

## Decision

**A drop row's zone cell that does not name a place is not a zone** (`namesAPlace`).

- **Two shape rules first, then a short list.** A trailing colon and a wholly parenthesised cell are
  table furniture wherever they turn up, so the next one of those needs no code change. The named
  values are the ones with no shape to catch them.
- **They are dropped, not translated.** An item left with no zone at all joins `(none)`, which exists
  for precisely this — nothing places it — so the Zone picker's halves go on adding up and a level
  derived from a zone is unaffected (a non-place never resolved to a level anyway).
- **Only the Items tab's facet is affected.** A wiki page view showing `Various Zones` is *correct*:
  it is what the page says. This is a rule about what can answer "which place", not about what the
  wiki is allowed to write.
- **The pack signature moves with it** (`rows6` → `rows7`). The row *shape* did not change, only how
  a field is computed — which is the easier half to forget, and a pack written before this would have
  gone on offering `Pre-Revamp` with nothing in the code to explain why.

## Consequences

**The Zone picker is 146 real places** instead of 154 entries of which 8 were nonsense.

**45 items move to `(none)`** — the ones whose only stated zone was a non-place. That reads as a loss
and is closer to a gain: "nothing places this" is true of them, and it was previously hidden behind a
zone name you could tick and get a meaningless answer from.

**Some information is genuinely discarded.** "Various Zones" was the wiki saying *this drops widely*,
and the Zone column now shows "—" for an item whose only cell said that. That is the trade: the
alternative was a tickable zone called "Various Zones", which is worse, and a third state ("drops
widely") is more machinery than 106 items justify.

**The list will drift out of date.** It is a list of one wiki's authoring habits, and a new section
header tomorrow is a new entry here. The shape rules cover the common cases; anything else shows up
the way this did — as a baffling row in a picker — and the fix is one line.

**Nothing checks these against a real gazetteer**, because there isn't one to check against. If a
census of zones ever ships for another reason, this rule is the first thing that should be revisited:
"is it a place we know about" is a better question than "does it look like table furniture", and it
was only rejected because the data to ask it does not exist yet.
