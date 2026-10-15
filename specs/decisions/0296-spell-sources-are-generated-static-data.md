# 0296: Spell sources are generated static data

## Status

Accepted

## Context

Some spells aren't bought from a guild vendor. They take a long quest: Ice Comet is the reward for
the wizard's Tarton's Wheel, and Tashania comes from the enchanter's Coin of Tash. The Spells tab
gave no hint of this, so you could only find these spells by already knowing about them.

Every eqlwiki spell page has a `where_to_obtain` field. It is written by hand, so it comes in several
shapes: a merchant table, a "Spell Vendors" link list, prose naming a quest, "Kunark Level 50+ Mob
Drop" with a `==Related Quests==` heading, or a Research recipe. The spell harvest's card
(`parseSpellCard`) never kept this section. Reading it there would mean re-fetching all ~2050 cached
spells for every user before the column could fill in.

## Decision

**A spell's sources are scraped into a bundled dataset**, the same generated-static-data shape ADRs
0262–0264 and 0291 use. `scripts/fetch-spell-sources.mjs` reads all of `Category:Spells` (about 42
requests) and classifies each field with `scripts/lib/spell-source-parse.mjs` into one or more kinds:
`quest`, `research`, `drop`, `vendor`, or `other` for text it can't place. It also records the quest
pages a field links to. The output is `src/shared/spells/spell-sources.generated.ts`. If a page says
nothing, the spell has no entry, which the table shows as "—" rather than guessing "vendor".

**A quest spell a vendor also sells is both.** EQL has put some quest spells on vendors, and the
wiki records that in three ways. Sometimes both are in one field. Sometimes the page has a second
`where_to_obtain` field holding the vendor list (Fire Flux); MediaWiki shows only the last one, so we
read every one. Sometimes the field is a vendor list and the quest is a page section outside it
(Spirit Pouch's "Quest Reward of"). Such a spell shows as "Quest · Vendor".

The Spells tab gets a **Source** column that shows the kinds and links each quest to its page. The
column sorts before the 300-row cut, like every other sort. Its order brings **quest-only** spells
first, then spells a quest is one way to get (ones a vendor also sells, or the Kunark 50+ spells,
which also drop), then research,
drops, vendors, and unknown last. Within each group, spells for the same quest sit together.

## Consequences

- Sort by Source and the long-quest spells are at the top, Ice Comet and Tashania among them, whether
  or not you knew to look for them.
- The data is only as fresh as the last regenerate. A wiki edit to a spell's source shows up as a
  diff to review when `npm run spell-sources:fetch` is rerun, never silently at runtime.
- A merchant in a "Caster Quest NPC Area" (the Translocate vendor) stays a vendor, because a merchant
  table wins over the word "quest".
- A field the classifier can't read lands as `other` ("See wiki"), not as a wrong kind. About a third
  of spell pages say nothing at all, mostly NPC-only and newer-era spells.
