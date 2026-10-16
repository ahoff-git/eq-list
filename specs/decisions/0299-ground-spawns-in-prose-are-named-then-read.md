# 0299: Ground spawns in prose are named, then read

## Status

Accepted

## Context

ADR 0291 bundled quest pickups from pages that list them in one machine-readable shape: a
Zone / Location table (Tarton's Wheel), and later a `Label - Zone - directions (loc)` checklist
(Coin of Tash). A scan of all 929 eqlwiki quest pages found no other page in either shape.

Plenty of other quests do send you to pick things up. They say so in prose, each in its own words:
"[[Ingot of the Ardent]] (Ground spawn in [[Everfrost Peaks]] at 2984, -5716…)", "The [[Magnifying
Glass]] is a bag sitting on the ground… The loc is -600, 2000", "[[Barbarian Femur]]: +1405, -4570,
-190". No rule picks out the pickup sentences without also picking up every "Find [[NPC]] at …". Some
pickups are only described, never located: the Bones of Darak Lightforge's backbone is "in the Ghost
Room Pit in Unrest".

The scan also found long quests with no pickups at all whose top table names a dozen NPCs, most of
them placed by their own wiki pages (Incandescent Armor, Noble Hunters, Crafted Armor).

Many candidates are in zones this server doesn't run. Kunark and Velious quests (Velium Focus, the
Sebilis key, Spirit of Garzicor) and the class epics (`{{Epics Era}}`, already flagged out of era by
the app) would put pins in zones the map can't open.

## Decision

**A prose page's pickups are named in the config, and everything else is read off the page**
(`from: "spots"`, `scripts/lib/pickup-spots-parse.mjs`). Each spot gives its item and, where needed,
the text that finds its line (`match`) and a zone the prose leaves unlinked. The position comes from
that line's `{{Loc}}` template, or the first coordinates after the match. The directions are the line
itself. A spot the page no longer has fails the run rather than dropping out quietly.

**A pickup may have no location**, but only where the config says `noLoc`. It keeps its zone and
directions, gets no pin, and its page says the spot isn't stated.

**A pickup that is the only one of its name is listed by that name alone**: "Abandoned Orc Shovel",
not "Abandoned Orc Shovel (Abandoned Orc Shovel)". It is then the same entry as the turn-in the quest's
page already lists, and that entry gets the pin. `Item (Label)` stays for sets that share a name
(Rods, coins).

**Long quests can be bundled for their NPCs alone** (`from: "npcs"`). These are the in-era quests whose
top table names five or more NPCs the wiki places.

**Only in-era quests are configured, and only reachable NPCs are shown.** A quest NPC is listed and
pinned only if the map can open their zone (`REACHABLE_QUEST_NPCS`). The rest stay bundled and appear
by themselves once the gazetteer knows their zone.

## Consequences

- 12 in-era quests now have ground spawns (25 pickups, 4 of them described only), and 19 long quests
  have NPC pins. In all, 154 quest NPCs are bundled and 148 are reachable.
- Adding a prose quest takes a few lines of config, not a parser. The trade-off is that someone has to
  read the page once to name its spots.
- Kunark and Velious quests wait: the Velium Focus, the Sebilis/Veeshan's Peak key, the Spirit of
  Garzicor, Fusibility Research, Cannibalize II and the class epics. Each is a `spots` entry away once
  its zones open.
- Writing this turned up zone lines the app couldn't resolve: the game's long names for the four
  Karanas, the Qeynos Aqueducts and South Ro. They now have aliases. Neriak's two districts ("Neriak -
  Commons") failed for a different reason: a dash was read as a ruleset tag. Only ruleset words fold
  after a dash now (`ZONE_DASH_MODE_RE` in `src/shared/names.ts`), and every zone line in a real
  2½-month log resolves.
