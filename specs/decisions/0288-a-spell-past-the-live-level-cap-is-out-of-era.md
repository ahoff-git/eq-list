# 0288: A spell past the live level cap is out of era

## Status

Accepted

## Context

[ADR 0210](./0210-out-of-era-flagging-reaches-spells-the-shopping-list-and-lucys-live-verdict.md)
gave the Spells tab an era toggle driven by `CachedSpell.outOfEra`, which is the wiki's
**page-category** flag. A player reported the toggle letting level 51-60 spells through. The toggle
itself worked; the flag was missing. Most of eqlwiki's Kunark/Velious spell pages carry no era
category at all (Torrent of Poison, Primal Avatar and Acumen are only in `Category:Spells`). In the
live cache, 97 of the 2,020 cached spells had a minimum level above 50 and no flag, so a filter on
the flag alone could never hide them.

A spell has no zones, so `item-era.ts`'s zone-by-zone widening has nothing to read. What a spell
does have is a level for each class, and an era's level cap is exactly what decides whether a level
can be reached.

## Decision

**A spell that no class can cast at or under the level cap of the era open now is out of era,
whatever its page says.** `spell-search.ts`'s `spellEraRows` widens `spell.outOfEra` at render time,
the same split `eraCorpus` uses for items (bake the wiki flag at fetch time, widen it live), so the
existing toggle and badge pick it up unchanged. A card that names no class is never judged by
level.

**The live cap comes from the live out-of-era zone list.** `expansions.ts` adds `liveLevelCap`:
50 for the original release, and 60 once Kunark or Velious is open. An expansion counts as open
(`expansionOpen`) unless **most** of its zones are shut. "Any zone open" can't be the test: this
server runs The Hole, Stonebrunt and The Warrens in era even though fandom files them under
Kunark/Velious. Name mismatches between fandom and eqlwiki count as open zones, and an empty list
(wiki unreachable) opens everything. Both of those fail open, like the rest of that module.

`spell-file.ts`'s `MAX_LEVEL` (60) is left as it is, because it answers a different question: what
the server *has*, not what is open.

The web snapshot's spell catalogue was also dropping the page flag (`snapshot.ts`'s
`cachedSpellsJson`), the same kind of gap ADR 0210 closed in Electron. It now carries the flag
through.

## Consequences

With today's era list, the Spells tab hides 98 more spells by default (1,684 shown → 1,586), and
none left on screen is above level 50. When Kunark opens on the wiki, the cap rises to 60 and they
come back with no code change.

The level rule judges reach, not which classes are on the server. A spell only a Luclin class
(Beastlord) can cast, at a level under the cap, still reads as in era unless its page is flagged.
The majority rule is a heuristic over the zone list rather than eqlwiki's own `Template:PageEra`
keys. Those keys are the authoritative source, but today they never leave the main process.
