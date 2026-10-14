# 0291: Quest pickups are generated static data

## Status

Accepted

## Context

Epic quests send you to pick things up off the ground at known spots. The wizard epic's Tarton's
Wheel step wants ten Rods (Azia to Jaka), each in a different zone. eqlwiki's quest page for the step
holds a **Locations** table with a label column, a **Zone** column and a **Location** column, each
location written as a `{{loc|Zone|y, x}}` template.

The app had nowhere to put this. List entries get their sources from a live eqlwiki lookup, and
nothing there produces a `ground` source. The Hunt tab places only `drop` sources. Map pins are
either typed in by hand or derived from mobs. And all ten Rods share one in-game name, so the list,
which keys entries by name and origin, would fold them into one "Rod ×10" line that can't say which
ones you still lack.

## Decision

**Pickup tables are scraped into a bundled dataset**, the same generated-static-data shape ADRs
0262–0264 use. `scripts/fetch-quest-pickups.mjs` reads every eqlwiki page in its `PAGES` config
(for the Rods, "Tarton's Wheel" itself) with a generic parser (`scripts/lib/pickup-table-parse.mjs`),
which finds columns by their header words. The result is `src/shared/quests/quest-pickups.generated.ts`. **Adding another epic step is one
line in `PAGES`** and a rerun.

**Each pickup is its own list entry, named `Item (Label)`** ("Rod (Azia)"), filed under its quest.
The List tab's **＋ Quest pickups…** picker adds a quest's set through the existing `addFromPage`
path, by handing it a quest-shaped page whose turn-ins are the pickups.

**A served quest page carries its bundled pickups as turn-ins** (`withQuestPickups`, applied by
`getPage`/`refreshPage` on the way out and never cached). eqlwiki's parser reads no turn-ins off
"Tarton's Wheel", whose rods sit in a checklist and a table, and a quest with none was added to
the list as its own name. That entry could never be satisfied and placed no pins. Now **+ Add** on the
quest's page adds the rods, the same as the picker does.

**The map pins are derived, never stored**, as hunt pins are (ADR 0142). A pin is drawn while its
entry is still needed and the pickup's zone is the one on screen. It is captioned with the label,
drawn as a hunt mark with the dashed ring of a stated position, and shares the hunt's 👁 switch.
The Hunt tab lists pickups in their own **On the ground** section, with the same zone filter and
obtained stepper.

**Each pickup has its own in-app page**, built from the dataset rather than fetched, since no wiki
has a page called "Rod (Azia)". Opening a pickup's name anywhere shows `PickupPageView` in place of
a wiki page. It says **where**: the zone and the spot, both opening the map, plus the wiki's
directions. It says **why**: the quest, linked to eqlwiki's page for it, and the rest of the set,
with ticks for the ones you have. A ↗ link opens the eqlwiki page the pickup was read from.

`quest-pickups.ts` owns the naming and the lookup back from an entry. The list, the Hunt tab, the
map and the page all go through it.

## Consequences

- Picking an item up off the ground writes nothing to the log, so a pickup is never ticked off
  automatically. You mark it obtained yourself, and its pin goes when you do.
- A pickup's entry name is no eqlwiki title, so `useEntrySources` answers from the dataset and
  never asks the wiki about it.
- The data is the same wiki the rest of the app reads, so a quest's pickups and its in-app quest
  page can't disagree about where to go, short of a regenerate falling behind an edit.
- A table whose location has no two numbers is skipped and reported, not shipped as a pin at 0, 0.
