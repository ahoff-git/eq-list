# 0007: Quests-by-zone via backlinks ∩ Category:Quests

## Status
Accepted

## Context
Users want to find quests by zone ("what can I do in Befallen?"). The obvious
approaches don't work on eqlwiki, which runs **stock MediaWiki with no
CirrusSearch** (confirmed via `meta=siteinfo` — no search extension installed):

- `incategory:` in full-text search returns nothing (CirrusSearch-only operator).
- There is no per-zone quest category; a zone's own `Category:<Zone>` holds
  NPCs/items, not quests.
- Zone pages have no "Quests" section (only a curated, inconsistent `Related Quests`
  infobox param).

What *is* reliable: quests link their zone as a wikilink in `Start Zone` /
`Related Zones`, but under inconsistent targets — canonical (`[[Befallen]]`),
piped, underscored, and redirect aliases (`[[Highpass]]` for Highpass Hold).

## Decision
`questsByZone(zone)` = the zone page's **inbound links (`generator=backlinks`)
intersected with `Category:Quests`**, unioned over the zone's **redirect aliases**
(`prop=redirects`). Zone names come from `Category:Zones`. Category checks use
`cllimit=max` (the default of 10 silently truncates) and follow `continue`.

## Consequences
- Reliable and API-native; verified live (Befallen → 8 quests, Highpass Hold → 19,
  including alias-only links the canonical-only query would miss).
- High recall, moderate precision: includes quests that merely *reference* a zone in
  a walkthrough, not only those that start there. Acceptable for discovery; a future
  refinement could post-filter by each quest's `Start Zone`.
- A few quest pages missing the `[[Category:Quests]]` tag won't appear (wiki
  data-quality gap); the curated infobox list could backstop this later.
- Costs a few cache-friendly GETs per zone (aliases + backlinks); results are cached
  per zone for the session.
