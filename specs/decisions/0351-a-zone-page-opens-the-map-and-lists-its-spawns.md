# 0351: A zone page opens the map and lists its spawns

## Status
Accepted

## Context
A zone's page in the app said only "open it on eqlwiki to browse its contents". Yet the page was
already parsed with the zone's NPC roster, name and level
([ADR 0163](./0163-an-item-wears-the-level-of-what-drops-it.md) read it for item levels), and the map window reads that roster for its
named pins. Kills and peers' reports already know, per zone, what died there, how often, and where
(`mobs.all(zone)`). Neither was on the page, and there was no way from it to the map.

## Decision
**A zone page shows a button that opens the zone on the map, then its known spawns** (`ZoneSpawns`
over `zoneSpawns` in `src/shared/zones/zone-spawns.ts`):

- **The roster joined with kills.** Rows match by `npcNameKey` (no article, no trailing
  disambiguation, case folded), so the wiki's "A basilisk (Lower Guk)" meets the log's "basilisk".
  A mob killed there that the roster doesn't list is kept and says so.
- **Each row**: the name, linking to its page; a "named" tag; the roster's level; kills there
  (pooled, yours on hover); and, when kills place it, the roam centre, which opens the map at that
  spot.
- **Order**: it opens with nameds first, then most killed, then highest level, then by name, ten
  rows a page. It's a DataGrid like every other table (ADR 0230), so every column also sorts.
- **Named means no indefinite article** in the roster's spelling (`rosterNamed`): "Raster of Guk"
  and "The Ghoul Lord" are named, "a froglok slave" is not. eqlwiki's `Category:Named Mobs`
  (`isNamedMob`) could not be used: its 6,586 titles include nearly every mob, "a gnoll" and "a large
  rat" among them.

## Consequences
- A zone is one click from its map, and its roster is readable without leaving the app.
- A mob known only from kills can't be called named, since the log drops its article.
- `isNamedMob` answers true for nearly everything, which also affects what the map marks as a named
  pin ([ADR 0265](./0265-named-spawns-mark-themselves-on-the-map.md)). That is an Open Question, not
  changed here.
