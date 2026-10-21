# 0326: The status bar is a way in

## Status

Accepted

## Context

The bottom bar reports the log watcher, the current zone, the game clock, the last drop, and, in
the main window, the stalest game export. Most of it couldn't be clicked. The zone was left unlinked
on purpose (a map window appearing from under your panel is unwanted). The export chip copied its
`/outputfile` command
([ADR 0320](./0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md)). So a chip saying the
inventory export was stale gave no way to the place that explains what the export feeds and lists
the others.

The bar is only drawn in the main window, which has the tab navigation (`useNav`), despite its old
comment saying it appeared in every window.

## Decision

**Every chip in the status bar opens where its subject is dealt with.**

- Log status → General settings, where the log folder is chosen.
- Zone → the zone's page (`ZoneName`), never the map.
- Last drop → the Loot tab. Its item and mob names are links to their own pages too.
- Stale export → Inventory & exports. This replaces ADR 0320's copy-on-click; the command is copied
  from that section, which also shows what each export feeds.
- The game clock keeps its own click, which pins the floating clock over the game.

`StatusLink` (in `StatusBar.tsx`) is how a chip opens a tab. Without navigation it renders as plain
text, so the bar reads the same in a window that has no tabs.

## Consequences

- The bar now gets you to the thing it's telling you about.
- Copying the stale export's command takes one more click, since the Exports tab has it.
