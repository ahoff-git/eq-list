# 0297: A spell no class can cast is not in the spell list

## Status

Accepted

## Context

After [ADR 0288](./0288-a-spell-past-the-live-level-cap-is-out-of-era.md), no spell above level 50
was left in the Spells tab, but players still reported out-of-era spells there. Replaying the live
cache (2,020 spell pages) showed where they came from. Of the 1,586 spells shown, 439 had a card
that names no player class: NPC abilities, weapon and spell procs, focus effects, potion effects and
rogue poison strikes. The level rule never judges these, because there is no level to judge. The
page flag usually misses them too: 268 have no era category at all (only `Category:Spells` or
`NPC Only Spells`). That group includes Kunark and Velious content such as Blinding Fear and Deadly
Lifetap (Trakanon), Fiery Death (Chardok), Deadly Velium Poison, Acid Jet (Temple of Veeshan), and
Extended Range III, which decays on spells over level 60.

Guessing these spells' era from their descriptions (a closed zone or a known Kunark mob named in the
text) was considered and rejected. It would catch a few dozen of them, misjudge some, and keep the
rest anyway. Beastlord-only spells were also checked: they are not out of era. The wiki files them
as `Classic Era`, and EQL has Beastlords from launch.

## Decision

**The Spells tab hides a spell no player class can cast, by default.** `spell-search.ts`'s
`isPlayerSpell` asks whether the card names a class level. `SpellCriteria.playerOnly` (on in
`NO_CRITERIA`) applies the check, and the *player spells only* toggle next to *in era only* turns it
off. Like the era toggle, it is the default view rather than a condition the player added, so it is
not counted by `Clear (n)`.

A card with no lines at all says nothing either way, so it keeps its row. `pastLevelCap` gives such
a card the same benefit of the doubt.

This is a separate toggle, not part of the era flag. "Not castable by players" is a different fact
from "not open yet". The search box and the page view still show an NPC spell's page as it is.

## Consequences

With today's cache, the Spells tab shows 1,147 spells by default instead of 1,586, and every one of
them names a class that can cast it at or under the live level cap. A player looking for a proc or
a potion effect unticks the toggle and sees everything 0288 allows, including the uncategorised
Kunark and Velious NPC spells, which still carry no era judgement.
