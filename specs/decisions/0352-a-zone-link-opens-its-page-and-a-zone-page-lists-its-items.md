# 0352: A zone link opens its page, and a zone page lists its items

## Status
Accepted

## Context
A zone page ([ADR 0351](./0351-a-zone-page-opens-the-map-and-lists-its-spawns.md)) said who lives
in a zone but not what they carry. The Items tab already answers that: tick a zone in its Zone
picker. That meant leaving the page, and the catalogue spells some zones two ways ("Castle
Mistmoore", "Mistmoore Castle"), so one tick could miss half the zone's items.

Meanwhile `ZoneLink`, the zone name in rows about *where something is* (drops, kills, quest steps,
the spawn board), opened the map. So most zone names went to the map and could not reach the zone's
page, while `ZoneName` ([ADR 0325](./0325-every-named-item-and-zone-is-a-link.md)) went to the page
and could not reach the map.

## Decision
- **A zone page lists the items found there** (`ZoneItems`). It is the Items tab's own query
  (`useItemQuery`) and table (`ItemTable`), with only the Zone picker set. The picker gets every
  catalogue spelling that opens this page (`spellingsOfZone` in `src/shared/zones/zone-page.ts`).
  The era toggle is off, because the page is about this zone whether or not it's open. No source
  kind is filtered: the From column says whether an item drops, is sold or is a quest reward.
- **`ZoneLink` is a `ZoneName` followed by a 🗺.** The name opens the zone's page. The icon opens the
  map with the row's `focus`, which is what the whole name used to do.

## Consequences
- From any zone name, the map is one click away (the 🗺) and so is the zone's page. The page then
  shows its map button, its spawns and its items.
- Like the Items tab, the list holds only cached items, so a zone you've barely browsed looks
  sparse.
- `ZoneName` is still the plain name, for tables with no room for an icon (the Items tab's Zone
  column).
