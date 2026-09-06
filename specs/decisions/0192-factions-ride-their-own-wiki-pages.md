# 0192: Factions ride their own wiki pages

## Status
Accepted

## Context
Users want to search for a faction and see what raises it — the quests to run, the
mobs to kill — with a way to track those mobs. No faction concept existed anywhere
in this app; the only prior faction data was unstructured prose already folded into
a mob's card (`parseMobFactions`, v12: "Factions: X (+N), Y (-N)"), never parsed
into anything searchable or indexable.

Checked the live wiki rather than assuming: eqlwiki has a **dedicated page per
faction** (`/Priests_of_Life`, etc.), rendered by `Template:Factionpage` with a
stable, uniform shape — a `.eql-factionpage` container holding two columns
(`.eql-factionpage-raise` / `-lower`), each with `.eql-factionpage-section`s for
Zones / Quests / Mobs. A mob row is `<a>name</a> <span>(Zone - role)</span>`. No
per-entry point values appear anywhere on the page — only direction (raise/lower),
never amount. `Category:Factions` lists all 258 factions and is fetchable in **one**
`list=categorymembers` call (`cmlimit=max` covers it, no pagination needed) — the
same shape `zoneIndex` already mirrors from `Category:Zones`.

A faction-tier standing requirement (e.g. "obtainable at apprehensive faction") is
*not* on the faction page at all — when the wiki states one, it's a freeform
editorial aside on the individual quest's own page (inside its Walkthrough), and
most quests carry no such note. There is no reliable per-faction amount data to
extract anywhere on the wiki.

## Decision
- `faction` is a new `WikiPageKind`, detected by `.eql-factionpage` and parsed into
  `raise`/`lower` sides (`zones: string[]`, `quests: string[]`,
  `mobs: {name, note?}[]`) — the same flat `WikiPage` shape every other kind uses,
  not a discriminated union.
- `Category:Factions` is mirrored into a `factionIndex` exactly like `zoneIndex`
  mirrors `Category:Zones`, powering `wiki.searchFactions(term)`. Faction search is
  a third mode of the existing `SearchPanel` (alongside "name"/"zone"), not a new
  tab — every mode already funnels a result through the same `nav.openPage` →
  `WikiPageView` path, so a faction page needed no bespoke detail-view component.
- "Kill this mob to raise faction X" reuses the **existing**
  `ShoppingListEntry.kind: "mob"` shape (already "a thing to go kill," already
  excluded from loot matching, already surfaced by the Hunt tab) with
  `origin: {kind: "faction", name}`. `addFromPage` bulk-adds every raise-side mob
  this way, so the existing "+ Add full quest" pattern becomes, for a faction page,
  "+ Track all N raise mobs" for free. Lower-side mobs are shown for information
  only (avoid killing these) and aren't bulk-tracked.
- A quest's own faction-tier aside, when the wiki states one, is matched by a tight
  heuristic (a tier adjective within a few words of the word "faction", scoped to
  `<p>` asides only — never `<dl>/<dd>` dialogue, which is where false positives
  from ordinary English ("she kindly agreed") would come from) and folded into the
  quest's existing info **card** as a "Faction note:" line, rather than a field of
  its own — so it shows up on the quest's own page and in its hover preview
  wherever it's linked (including from a faction's own raise/lower quest list) for
  free, the same way every other card fact already does.

## Consequences
- No per-entry faction amounts are available anywhere — raise/lower is the whole
  answer the wiki gives. The Zones/Quests/Mobs lists are exactly what the faction's
  own page states, nothing derived or inferred.
- The faction-tier note is best-effort and will miss most quests (the wiki has no
  fixed place to put one) and, rarely, could still misfire on prose that happens to
  put a tier word near "faction" without meaning it as a requirement — shown as a
  verbatim wiki snippet, never treated as authoritative or acted on programmatically,
  so a bad match is a confusing line, not a functional bug.
- A page already cached under the old item-fallback parse before this change (e.g. a
  faction name a user searched before this feature existed) stays wrong until its
  90-day TTL lapses or it's manually refreshed — narrow, self-healing, and not worth
  a forced mass re-parse of the item cache (`CACHE_VERSION` bump, no floor added for
  `item`).
