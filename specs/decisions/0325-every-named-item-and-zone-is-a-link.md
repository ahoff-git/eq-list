# 0325: Every item and zone a view names is a link

## Status

Accepted

## Context

Best in slot's Hunt table named two things it didn't link. Replaces built its name with
`gradedTitle` and printed it as text, so it had no hover card. From printed `zones[0]` as text, so it
couldn't open the zone. A sweep of the renderer found the same thing in a dozen more places: the Items
tab's Zone column, the shopping list's drop zones, quest pickups, the stone sources and benched items
in best in slot, a peer's shared list and pins, the spawn board's places, and a quest step's unmapped
zone.

The item half already had a type guard ([ADR 0319](./0319-a-linked-name-has-its-level-decided-by-type.md)),
but it only looks inside `<ItemLink title={…}>`. A name that never reaches one is invisible to it.
Zones had no guard at all, and two link styles with no rule for which to use: `ZoneLink` opens the
map, and `ItemLink` with `notAnItem(zone)` opens the zone's page, by whatever name the row happened
to hold. Often that's a log spelling (`Nagafen's Lair - Group`) the wiki has no page for.

## Decision

**Every item and zone a view names is a link, unless a listed reason says why not.**

- **One way to name a zone:** `ZoneName` (`src/app/components/map/ZoneName.tsx`), and `ZoneNames`
  for "first zone +N" cells. It shows the name as written and opens the zone's page, resolved first
  to the wiki's title (`zonePageTitle`, through the zone-levels table's resolver). Changing what a
  zone name does is an edit to that one file. `ZoneLink` stays for rows about *where something is*,
  which pick a mob or drop out on the map.
- **Items keep `ItemLink`/`NameList`.**
- **A static test (`names-are-links.test.ts`) enforces both.** A level writer or marker called
  outside a link tag fails. A `.item`, `.zone`, `.zones[N]` or `.place` field rendered as JSX text
  fails unless it's in the test's `PLAIN` table with a reason. A `PLAIN` entry that no longer matches
  anything fails as well.

The reasons in `PLAIN` fall into two groups: the name is inside a control that can't host a link
(a native `<option>`, a button that already acts on it), or it's on screen too briefly to hover
(an alert banner, the status bar's ticker).

## Consequences

- A new table that prints an item or zone as text fails the suite, and the failure says which file
  and field.
- The rule matches on field names, so a value under another name (`{x.where}`, a bare `{zone}`)
  isn't checked. The field list is one regex in the test and can grow when a new shape turns up.
- Mob names aren't covered; most already link through `notAnItem`. Adding `.mob` to the field list
  is the way to cover them, and it would need its own sweep.
