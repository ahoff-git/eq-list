# 0293: Quest NPCs are bundled and pinned while their quest is listed

## Status

Accepted

## Context

A pickup quest is only half done once its pieces are found. Coin of Tash has you take the
finished coin to Tarn Visilin in High Keep, then to Mizr N`Mar in Neriak Third Gate, then to Raine
Beteria in Erudin, and finally back to Romar Sunto in the Temple of Solusek Ro. ADR 0291 put the ten
coins on the map but not the four people. The app could already place an NPC from the wiki, but
only through the named-spawn and hunt paths (ADR 0265, ADR 0142). Neither covers a merchant you hand
a coin to.

The wiki has what's needed. The quest page's top table names the NPCs in its **Related NPCs** row.
Each NPC's own page states `zone` and `location` in its infobox. The quest's checklist bullets that
link an NPC say what you do there.

## Decision

**`scripts/fetch-quest-pickups.mjs` also bundles each configured quest's NPCs** into
`quest-pickups.generated.ts` as `QUEST_NPCS`: the quest, the NPC, the zone and location from the
NPC's page, the checklist steps that name them, and the page's directions
(`scripts/lib/quest-npc-parse.mjs`). An NPC whose page states no location is reported and left out
(Tarton's Wheel's Sulgar, for now).

**They are pinned while any entry filed under their quest is still needed**
(`src/shared/map/quest-npc-pins.ts`). The list has no entry for "hand the coin to Tarn", so the
quest's own progress decides. They are drawn like pickup pins, under the hunt's switch, captioned
with the NPC's name. The hover gives the quest's steps for that NPC.

**A pickup's page lists its quest's NPCs** under **Who to see**, each with zone and map links.

## Consequences

- NPCs come only for quests already in the pickup config. A quest with NPCs but no pickups would
  need its own entry before its NPCs are bundled.
- A quest's NPC pins all stay until the whole quest is off the list. They don't come off one by one
  as you finish each hand-in.
- The checklist step can disagree with the NPC's page about the spot (Tarn Visilin: page 65, -223;
  checklist 75, -220). The pin uses the NPC's page, and the step's wording is shown as written.
