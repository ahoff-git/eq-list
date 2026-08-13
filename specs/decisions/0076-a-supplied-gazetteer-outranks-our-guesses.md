# 0076: A supplied gazetteer outranks our guesses

## Status

Accepted

## Context

Four vocabularies name EverQuest's zones and no two agree. Everything a *rule* can reach is settled
— case, a leading "the", the apostrophe the maps and the log write differently, a difficulty number
and its ruleset tag ([ADR 0057](./0057-a-grade-is-not-an-identity.md)), word order and sub-zones
([ADR 0068](./0068-a-zone-name-resolves-against-what-we-know.md)), and one misspelling
([ADR 0075](./0075-a-zone-s-misspelling-is-the-same-zone.md)). What was left over was **two
hand-written tables** that had grown one painfully-verified entry at a time:

- `CURATED_ZONES` — which map **file** a zone is (`qeytoqrg` is Qeynos Hills), 31 entries;
- `ZONE_ALIASES` — which **name** means it (the log's "Kerra Isle" is the packs' "Kerra Ridge"), 3.

Both were honest about being incomplete, and the price showed. A real install's folder holds ~130
files; 31 of them had names. The rest fell back to `prettyZoneName`, so the picker offered
**`Gukbottom`**, **`Cazicthule`** and **`Soldungb`** — selectable, and honest about knowing nothing.
Worse, an unnamed zone can't be *placed*: `zoneAvailable` and the travel graph both key off a name, so
those files also sat outside the era check, and any kill recorded there could only ever match itself.

Each new entry cost a real investigation — read the file's exit labels (a map that links "to X" is a
neighbour of X, not X), then check your own recorded `/loc` fixes fall inside its geometry. That is the
right process for a table that *can't fail closed*: a wrong file draws another zone's map under the
right name and puts every position you plot somewhere else. It is also why the table stayed at 31.

Then a gazetteer was supplied: the EQL wiki's own in-era Zones page, mapped to EverQuest short names,
with a display name and the aliases for each: 62 zone labels covering 78 map files, where we had 31.

## Decision

`eql-classic-zone-maps.json` ships as data in `src/shared/zones/`, and
**`zones/gazetteer.ts` derives both tables from it.** They stop being two lists to maintain and become
two views of one table: which file a zone is, and which names mean it. `CURATED_ZONES` is re-exported
from `map/zones.ts` where its readers have always found it; `names.ts` folds the alias pairs into
`ZONE_ALIASES`, which is the identity fold and so the part that had to be handled carefully.

**Why it is believed.** Of the thirty-one names this repo had verified the hard way it confirms
**twenty-four exactly** — same name, same file — including the two that cost the most: `qey2hh1` is **West Karana** (not the Qeynos Hills its own exit
label names) and `qeytoqrg` is **Qeynos Hills**. It also explains the solver's worst confident-wrong
answer — `neriaka` is the Foreign Quarter, and the Fourth Gate it kept offering is `neriakd`, a file we
had no name for at all. A source that agrees with every measurement we have, and explains a
disagreement we didn't understand, has earned the rest.

**What we verified still wins.** `VERIFIED` comes first and first wins, for two reasons that are both
about a name being load-bearing rather than cosmetic: a canonical name is what the expansion lookup
resolves against and what stored pins carry, and where the two disagree about a *file* (`tox` /
`toxxulia`, `steamfont` / `steamfontmts`, `nro` / `northro`) the entry we kept is the one that exists
in a real install. Nothing is lost by that ordering — the loser stays in the list as a **candidate**,
so a folder with only `tox` now names it Toxxulia Forest where it used to show "Tox", and every other
spelling becomes an alias, so both resolve.

**Three filters on the alias side**, because an alias has no candidate list to be outvoted by:

- **Under four characters is dropped.** "EC", "WC", "SK" are player shorthand no source we read emits.
- **A wiki zone label counts only when it names one map.** "Freeport" covers three files and means
  none of them; "Kerra Island" covers one and is exactly the name we needed.
- **A parenthesised spelling is dropped**, and this one is a bug the tests now pin. The fold reads a
  trailing parenthetical as a ruleset tag (ADR 0057), so the table's `Qeynos (North)` folds to the key
  **`qeynos`** — and left in, it renamed the whole city to one of its halves, everywhere and forever.
  Every such spelling is also listed unbracketed, so refusing them costs nothing.

**An alias may only ever add a match, never cost one.** With 250 of them, `zoneKey` now *replaces*
names often ("North Kaladim" → "Northern Kaladim"), and the resolver's looser tiers work on words — so
a replacement could move a name away from a candidate that was a rephrasing of the original ("Kaladim
North"). `resolveZone` therefore tries both wordings, the aliased and the one as written. Finding that
also turned up why it had silently not worked: `zoneWords` re-folded whatever it was handed, so both
spellings collapsed back to one. Folding and word-splitting are now separate functions.

## Consequences

The picker names **83 files instead of 31**, and 76 of those now place in an expansion (up from 15), so
the era check and the travel graph see zones that were previously nameless. `Gukbottom` in the
zone list is now Lower Guk — and, because the file-name spelling is one of the supplied aliases, a
`Gukbottom` recorded by an older build still folds onto it.

The naming rules are unchanged and still do the work: the gazetteer only supplies names, and
`zonesFromFiles` still gives one to a file only if the file exists, still prefers a curated name over a
solved one, and still falls back to the file's own name. So a pack full of zones no table knows behaves
exactly as before.

**A supplied table is now a dependency, and it is not verified the way our own entries are.** The
mitigation is that the checks are mechanical and run in CI: no alias may rename a zone we name, none
may fold two of the fandom table's distinct zones together, no bracketed spelling may get in, and
nothing the gazetteer names may end up *excluded* from the picker by the era filter. Those tests are
the review a re-supplied table has to pass — which is the point at which this stops being a one-off
import and becomes a source we can take updates from.

Two things it deliberately does **not** do. It doesn't decide availability: the table's scope is
"in era", while `zoneAvailable` asks "does this server have it at all" — Kunark and Velious are on the
server and out of era, so the two questions stay separate (ADR 0065). And it doesn't rename anything
that already worked: the display name for a file we had verified stays ours, because renaming churns
stored pins and the expansion lookup for no gain.

One entry is knowingly weak: the table lists a `tutorial` map, and this server's own tutorial is
`tutoriala` with the log's wording as its name. They may be one place under two files, in which case
the picker shows two tutorials until someone checks in game.
