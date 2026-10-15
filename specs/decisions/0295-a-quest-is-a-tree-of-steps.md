# 0295: A quest is a tree of steps

## Status

Accepted

## Context

Exotic Drinks is a chain. You get a Kiola Nut, a Honey Jum, an Erud's Tonic and a Koalindl Fish,
hand them to Gregor Nasin for the Barkeep Compendium, and take that to Clurg for the Stein. Each
ingredient is its own errand. The Honey Jum, for example, means three Honeycombs from Bixies,
handed to Kizzie Mintopp in Rivervale. The fish can come from another quest, Frostbite's Fish.

The quest page showed this as one flat turn-in list. Barkeep Compendium sat beside Honeycomb, with
nothing to say which step makes what, who to see, or where. The wiki does say all of it, as bullets
and sub-bullets, and each NPC's own page states their zone and spot.

[ADR 0293](./0293-quest-npcs-are-bundled-and-pinned-while-their-quest-is-listed.md) bundles NPCs
for the quests in the pickup config. That covers the quests someone has configured, not every
quest.

## Decision

**A quest page keeps its walkthrough as `steps`: one step per bullet, sub-bullets as sub-steps, and
each step's sentence with its links in place.** The parser is its own black box,
`electron/wiki/quest-steps.ts`. It reads the first walkthrough or checklist section whose bullets
nest. Failing that, it reads the first checklist, since a checklist is a list of steps however flat
it is. A bold-only paragraph labels the list after it. It reads one section only, because pages
often give a short and a long version of the same walkthrough. A gear-set bundle gets no steps,
since `subQuests` already lays out its pieces.

**The parser doesn't decide what a link is. The linked page does, when the steps are shown.**
`useStepLinks` reads each linked page through `wiki.getPage`, the way a hover card does, and
`describeStepLink` (`src/shared/quests/quest-steps.ts`) turns it into a kind plus, for an NPC or
mob, its zones and spot. The page view (`QuestSteps`) draws a zone as a map link and an NPC with its
zone and spot on the map. Another quest gets "▸ steps", which opens that quest's own steps in place,
up to three quests deep and never itself. So a new chain needs no configuration, and a new kind of
link needs only a new case in the view.

**Only opening a quest asks for v27.** Like spells in
[ADR 0294](./0294-a-spell-page-says-how-to-get-it-and-every-era-flag-reads-the-level-cap.md), the
quest floor in `MIN_PARSE_VERSION` is unchanged, because item levels are read off ~950 cached quest
pages whose turn-ins haven't moved. `MIN_VIEW_VERSION` has quest at 27. A peer's copy never carries
`steps`, so `peerCopyVersion` files any shared page just under its kind's view floor.

## Consequences

Exotic Drinks reads as six steps, from "Get Kiola Nut" to "Get Stein of Moggok". Each NPC in them
shows where they stand, and "Do Frostbite's Fish" opens that quest's steps under it. Coin of Tash's
ten coins sit under the step that collects them, and its four hand-ins follow in order.

A quest whose walkthrough is prose with no nested bullets gets no steps, and shows exactly what it
did before. Of 24 sampled quest pages, 6 produced steps.

The turn-in list (`components`) is unchanged and still flat, so "+ Add full quest" still adds
intermediate items like the Barkeep Compendium. The steps are what tells you that one is made on the
way.

Opening a quest costs one `getPage` per linked page. Most are already cached. A miss is a fetch,
the same as hovering that link would cost.
