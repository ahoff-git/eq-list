# 0210: Out-of-era flagging reaches the spells tab, the shopping list and Lucy's live verdict

## Status

Accepted

## Context

A player reported the Spells tab showing spells from eras the server hasn't opened — a level-60
spell sitting beside classic ones. The cause was that `CachedSpell` never carried an `outOfEra`
flag at all: `WikiPage.outOfEra` is computed for every fetched page including spells, but the
spell-catalogue walk (`electron/wiki/index.ts`) threw it away when building a `CachedSpell` row, and
`SpellCriteria`/`matchesSpell`/`searchSpells` (`src/shared/spell-search.ts`) had no era concept to
filter or badge by. This was a deliberate v1 scope cut, not a regression —
[ADR 0195](./0195-a-spell-catalog-trusts-the-wikis-own-numbers.md) says outright "no era toggle...
can be added later without disturbing the shape."

Auditing the rest of the app for the same class of gap turned up two more, both already named in
[ADR 0170](./0170-an-item-s-sources-are-read-against-the-era.md)'s Consequences and in
`specs/todo.md`: the shopping list's zone-grouped drop display (`ListPanel`, via
`groupDropsByZone`) applied **no era test at all**, and Lucy's era verdict
(`src/shared/lucy-era.ts`'s `eraFromSourceZones`) only asked whether the **gazetteer** has ever
heard of a zone — a permanent fact — never whether that zone's era is **currently open**, the live
half every other surface (`zoneUnavailable`, `eraCorpus`, `sourcesByEra`) already reads off
`useClosedZones()`. A Kunark/Velious-only Lucy item could read "in era" before that era had
actually opened.

## Decision

**The Spells tab gains the same `outOfEra`/toggle/badge machinery the Items tab already has,
closing the scope ADR 0195 deferred.** `CachedSpell.outOfEra` carries the wiki's page-category
flag through (mirroring `CachedItem.outOfEra`), `SpellCriteria` gains a `hideOutOfEra` toggle
(default `true`, same as Items), `matchesSpell` filters on it, and `SpellCatalogTable` badges a row
that survives the toggle turned off. The same flag also now travels with a spell page shared
between peers (`SharedSpellPage.outOfEra`, `electron/wiki/index.ts`'s `spellShard`/`acceptSpells`)
— it was being dropped on that path too, for the identical reason.

**The shopping list's row expansion marks a shut drop zone, the same way `WikiPageView`'s
`SourceList` marks a shut item source.** `ListPanel`'s `ZoneRow` reads `useClosedZones()` (read
once in `ListPanel` and passed down, the same reasoning `askLucy` already uses to avoid a
subscription per row) and calls the existing `zoneShut`/`unavailableReason` — no new pure function
needed, since the judgement already existed and only wanted a caller.

**Lucy's era verdict widens additively: a placeable zone can now also be currently shut.**
`eraFromSourceZones` gains an optional `closed: ReadonlySet<string>` parameter. Among the zones
Lucy's gazetteer can already place, only the ones also `zoneAvailable` right now count toward
"in-era" when `closed` is supplied; if none remain open, the verdict becomes "out-of-era" with
wording that says the zone hasn't opened yet (distinct from "this server doesn't run it" for a
truly-unplaceable zone). This can only ever **narrow** in-era to out-of-era, never the reverse, so
every existing caller and test — none of which passes `closed` — sees no behavior change.
`LucySays` recomputes the badge live from `item.sources` and `useClosedZones()` instead of trusting
`item.era`/`item.eraWhy`, which are derived once in main at fetch time and cached with the item.
This is the same split the wiki side already uses: bake a cheap, permanent-ish signal at fetch time
(`page.outOfEra`), widen it live at render time (`eraCorpus`, and now this). The main-process bake
feeding `CachedItem.outOfEra` for Lucy-origin Items-tab rows (`electron/lucy/index.ts`,
`electron/lucy/parse.ts`) is left untouched — it still reflects only the permanent signal.

**Left open, deliberately:**

- **The Items tab's Lucy-origin rows still can't judge live closure.** `eraCorpus`'s zone-based
  check runs a row's zone strings through `item-era.ts`'s generic, wiki-shaped zone matching; Lucy's
  zone strings carry decorations (`[RoS]` tags, `2.0` revamp numbers, parenthetical glosses) that
  only `lucy-era.ts`'s own `zoneReadings()` knows how to strip. Reconciling the two zone-matching
  paths is a real, separate change.
- **A cached Lucy verdict can still go stale until refetched.** `LucySays`'s badge is now live, but
  `CachedItem.outOfEra`/`LucySearchResult.era` for Lucy items are unchanged — still baked once at
  fetch/parse time in main. Making *those* live is the harder half ADR 0170 already declined to
  settle ("deciding what a cached verdict is worth when the era moves under it"), and nothing here
  changes that calculus.

Both are recorded in `specs/todo.md` rather than attempted here.

## Consequences

A level-60 spell fetched into the cache now shows an "out of era" badge and is hidden by the
Spells tab's default toggle, the same as an out-of-era item. A shopping-list entry whose only
known source is a zone the server hasn't opened yet says so in its expanded breakdown rather than
silently sending the player there. An item page backed only by Lucy correctly reads "out of era"
once its one placeable zone's expansion is live-flagged shut, rather than reading "in era" forever
on the strength of a permanent fact alone.

None of the three changes touch an existing exported shape in a breaking way — `outOfEra` and
`hideOutOfEra` are additive fields with safe defaults, and `eraFromSourceZones`'s new parameter is
optional and can only narrow a verdict, never widen one. Every pre-existing test for
`spell-search.ts`, `lucy-era.ts`, and the peer-share readers passes unchanged; new cases were added
alongside them rather than replacing anything.
