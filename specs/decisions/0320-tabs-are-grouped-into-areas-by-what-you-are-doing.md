# 0320: Tabs are grouped into areas by what you are doing

## Status
Accepted

Supersedes [0088](./0088-alerts-are-a-tab-not-a-setting.md).

## Context
The control window had grown to **twenty tabs**, and at its default width six fit. The rest sat in the
`»` menu, so most features were two clicks away, and the comments in `page.tsx` had become arguments
about which tab deserved a visible slot ([0088](./0088-alerts-are-a-tab-not-a-setting.md) promoted
Alerts by position and pushed Session into the overflow to make room).

The bigger problem was that one question had several homes:

- finding an item meant Search, Items, Exports, Peers or Loot;
- what was running out was spread over five tabs (Timers, Buffs, Goals, Achievements, Alerts);
- reference lookups were five more (Items, Spells, Stances, AAs, Tradeskills).

The ask was for fewer tabs and fewer clicks.

## Decision
**Two rows: areas, then the sections of the area showing.** Seven areas, grouped by what you are
doing rather than by what the data is (`src/shared/chrome/areas.ts`):

| Area | Sections |
|---|---|
| Now | Overview, Buffs, Timers, Goals, Achievements, Alerts |
| List | List, Hunt |
| Find | Search, Items, Spells, Stances, AAs |
| Character | Inventory & exports, Faction |
| Craft | Tradeskills |
| History | Combat, Session, Loot |
| Settings | General, Peers |

- **A section keeps its old tab key.** The trail still records `nav.tab` (ADR 0173), so `openTab("peers")`,
  every notice that points somewhere, and every remembered place still work. The area is derived from
  the section showing, never stored as a second answer to where the window is.
- **An area reopens on the section you left it on** (`eqlist.main.areaSections`), so going back to
  the board you use is one click. Only when that one can't be used on this host does it fall back to
  the area's first usable section.
- **A one-section area draws no second row.** Both rows are the same `TabBar`.
- **Only two areas carry a number.** Now counts buffs that are *down* and List counts entries. The
  sections keep their own labels: `Alerts (off)`, `Goals (2)`, `Peers (3)`. 0088's point that `(off)`
  must be visible still holds; it now shows the moment Now is opened.
- **Alerts stays its own section, not a group in Settings.** That half of 0088 is unchanged: it is a
  workspace you return to.

Fewer clicks, beyond the grouping:

- **Now → Overview**: one card each for buffs down, the next timers, running goals, the session's
  XP/hour, kills and downtime, achievements in progress, and whether alerts are on. Each card's heading
  opens its full section. The cards read the same hooks as the sections, so the two can't disagree.
- **Ctrl+K** (`JumpPalette`) jumps to any section by a few letters. When nothing matches, Enter looks
  up the text in Find → Search.
- **The status bar names the stalest export** you use, once it is past half its stale time, as the
  same tinted copy button the exports view has (`stalestExport`). Retaking a dump no longer needs a
  visit to the exports section.
- **An item's hover card says who has it**: where you hold it and your best grade, and which sharing
  peers hold it (`ownershipNotes`). It is read once for the window (`OwnershipProvider`), and only from
  shares already received. A hover never asks a peer for an inventory; asking stays with the views
  whose purpose that is (ADR 0309).

## Consequences
- **The top row fits at the default width**, so the `»` menu is for a narrowed window only, and no
  feature has to win a slot by position.
- **Some views are a click deeper than when they had a visible tab**: Search, Loot and Combat are now
  area, then section. Remembering each area's last section and Ctrl+K are what pay for that.
- **Search, Items, Spells, Stances and AAs are grouped, not merged.** Each keeps its own search box. A
  single box answering across kinds is still open (see the log's open questions).
- A new feature joins an area as a section. It needs a key in `areas.ts` and a label in `page.tsx`,
  and `areas.test.ts` fails if any section is left without an area.
