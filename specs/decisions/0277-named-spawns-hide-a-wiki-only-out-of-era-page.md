# 0277: Named spawns hide a wiki-only out-of-era page

## Status

Accepted

## Context

[ADR 0265](./0265-named-spawns-mark-themselves-on-the-map.md) marks every mob in eqlwiki's
`Category:Named Mobs` on the map, sourced from the zone's own roster or a kill, and placed by
`mobPlace()` (`src/shared/map/mob-place.ts`): your kills, then peers', then the wiki's stated
`Location:`. That category is deliberately broad and unfiltered by era — it names mobs from content
this server hasn't opened yet, exactly the class of noise [ADR 0210](./0210-out-of-era-flagging-reaches-spells-the-shopping-list-and-lucys-live-verdict.md)
already closed for the Spells tab, the shopping list's zone-grouped drops, and Lucy's live verdict.
Named pins were the one surface that audit missed: `useMobWikiPlaces` (`src/lib/hooks.ts`) already
fetches each unplaced named mob's own wiki page to ask its `Location:`, and that page already carries
the same `outOfEra` category flag every other page does (`electron/wiki/index.ts`) — it was simply
being thrown away, keeping only `wikiPlace(page.card)`.

The result: a named mob nobody has ever killed here, whose only evidence is a wiki page tagged with
an era this server hasn't reached, still drew a pin — indistinguishable from a genuine, currently
obtainable rare.

## Decision

**A wiki-only placement declines when its page is out of era; a kill never does.**

`WikiPlace` (`mob-place.ts`) gains an optional `outOfEra` field alongside `zone`/`loc`.
`useMobWikiPlaces` sets it from the fetched page's own `outOfEra` flag, the same permanent,
page-level signal `CachedItem.outOfEra`/`CachedSpell.outOfEra` already carry. `namedPins()`
(`named-pins.ts`) passes `stated?.outOfEra ? undefined : stated` as the wiki evidence into
`mobPlace()` — the same shape as passing no wiki placement at all, so an out-of-era-only mob falls
through to "nothing can place it" and is left off, matching the module's own existing rule to "say
nothing rather than guess."

A kill (yours, peers', or pooled) is untouched by this and still outranks the page regardless of its
era tag: it is direct evidence the mob spawns here *now*, and a stale or simply wrong page tag
shouldn't override that. This mirrors `mobPlace`'s existing ranking rather than adding a new rule to
it.

Not done: no live "is this era currently open" check (`useClosedZones`/`zoneAvailable`) the way
Lucy's verdict widened to in ADR 0210 — a named mob's own page tag is a single boolean with no zone
string to re-check live, unlike an item's sources. If that gap matters here too, it is a separate,
larger change to how a mob page states its era.

## Consequences

A named pin placed only by the wiki no longer appears once its page is tagged out of era. A named
pin backed by a kill is unaffected. `unplacedNamedMobs()` is unchanged — it still asks the wiki about
every unplaced candidate; the filter happens once the answer comes back, in `namedPins()` itself.

## See also

[ADR 0265](./0265-named-spawns-mark-themselves-on-the-map.md) ·
[ADR 0210](./0210-out-of-era-flagging-reaches-spells-the-shopping-list-and-lucys-live-verdict.md) ·
[ADR 0142](./0142-a-hunted-mob-marks-itself.md)
