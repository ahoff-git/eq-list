# 0300: A long quest is a plan of stages

## Status

Accepted

## Context

Quest pickups (ADR 0291, ADR 0299) model one thing lying on the ground. The quests that most need help
are long routes across many zones: the fourteen class epics and the sixteen Plane of Sky class tests.
The Cleric epic, for example, is twenty steps across Lake Rathetear, Timorous Deep, the Temple of
Solusek Ro, Solusek's Eye, Burning Woods, Chardok and Nagafen's Lair. Almost none of those steps is a
ground spawn. They are "loot X from Y", "give X to Z, receive W", "tell Z…", with intermediate items
handed from one NPC to the next.

Two things already existed. ADR 0295's step tree shows any quest's walkthrough with its links resolved
when viewed, but it tracks no progress, places nothing on the map, and has no idea of era. ADR 0293's
quest-NPC pins only cover quests with a pickup config.

eqlwiki writes these quests in two shapes, which a scan of all 30 pages confirmed:

- **Every epic has a `{{CheckboxList}}`.** Stages are bold lines or sub-headings, and steps are
  bullets nested with `*`, `**`, `:*` or `::*`, using a small set of verbs. Some pages have one
  checklist per part (Enchanter).
- **The Plane of Sky test pages hold nothing of their own.** They transclude one class's table from
  the Plane of Sky zone page: one row per test, giving the reward, the trigger phrase, the rune, and
  quest items tagged with the island that drops them ("(3-Gorga)").

Most epics sit partly in Kunark and Velious zones, which are out of era on this server.

## Decision

**A long quest is bundled as a plan: stages of steps, each step recording what it hands in, what it
gets you, who it's with, and where** (`scripts/fetch-quest-plans.mjs` writes
`src/shared/quests/quest-plans.generated.ts`). Two front ends feed the same shape
(`scripts/lib/quest-plan-parse.mjs`): checklists, and the Plane of Sky tables, whose island codes map
to the zone page's `Island N` headings. What each link is (item, NPC/mob, zone, quest) comes from the
linked page's infobox, fetched with redirects followed (`pagesByLink`). An NPC or mob is placed by
their own page. A parenthetical in a step is advice, not a reward.

**Progress is the shopping list's.** Every item a step gets is a list entry under the quest, and a step
is done when its items are obtained. `withQuestPlan` lays those items onto the served quest page, so
**+ Add** on an epic adds the whole route. Ticking a step marks its entries obtained. There is no store
of its own, so a loot line that ticks an entry ticks the step.

**A step's place is resolved when read** (`stepPlace`): the zone it names, otherwise its person's
zone. When a person's page names several zones, the step uses the one its sentence mentions. The step
uses a spot it states itself; otherwise it uses its person's spot, but only when that person stands in
exactly one zone. Era is asked through `zoneUnavailable`, the same check every other era flag uses,
so a plan fills in as eras open and nothing is excluded at generation time.

**A page that has a plan is a quest**, whatever the parser made of it. The Plane of Sky test pages
parsed as items.

**The quest page shows the plan** (`QuestPlanView`) in place of the generic step tree. It can be read
by stage or by zone (by island inside Plane of Sky). Each step shows its mark, what it gets you, who,
where, and an era badge. **The map pins a listed quest's remaining stops** (`planPins`): one pin per
person or stated spot per zone. Steps that get nothing ("Hail Kargek") are pinned only for the stage
you're on. The List tab's picker offers every plan under **Long quests**.

## Consequences

- 30 plans, 732 steps and 247 people are bundled. Every epic and every Plane of Sky test opens as a
  plan today, with its out-of-era steps marked rather than hidden.
- A step the wiki words with pronouns ("Give the torch to …") has no items to track, so it shows as
  information, not a checkbox.
- Ground-spawn pickups (ADR 0291/0299) stay as they are. A plan's ground steps are tracked by their
  items, like any other step.
- A zone the map doesn't know gives way, in order, to:
  1. a mapped zone named in the step's own words (Kargek's page says "Freeport"; the step says East
     Freeport);
  2. the person's own mapped zone, which picks the right district of a city of several ("Felwithe"
     becomes Northern Felwithe for Elia the Pure);
  3. any zone page the sentence names.

  A person the step names without linking is found among the plan's placed people (Kazen Fecae), or
  by a first name that is theirs alone in the plan ("Stanos"). A zone still unmapped is out of era when
  its own wiki page is tagged with a later era ("Burning Woods": Kunark), since the gazetteer carries
  every zone this server runs.
- **A stage is placed as a whole** (`stagePlaces`), so a step reads the steps around it. A
  continuation ("Receive the Jeweled Dragon Head Hilt", "2. Give him …") happens where the step before
  it did. A step that names no place says why: a vendor, a combine, foraging, a spell, its sub-steps,
  another quest, or a note. The view groups these under their reason, not one "no place" heap. Of 732
  steps, 580 open the map, 99 are out of era, 5 are continuations, 45 have a stated reason for having
  no place, and 8 are the wiki not saying where ("Kill a white dragon (Lady Vox, Gorenaire)"). A test
  holds every step to having a place or a reason, and the unstated ones to a handful.
- A test pins every plan's stops inside the drawn map of the zone they're pinned on: 814 pins across
  all 30 plans, wherever the map files are on disk.
- Someone whose page states no spot is placed by their zone map's own label (`scripts/lib/map-labels.mjs`),
  ignoring a legend column. That places the Plane of Sky's island bosses, whose item codes ("3-Gorga")
  the plan reads as "loot from Gorgalosk on Island 3".
- Adding another long quest means one line in `PLANS`, provided its page uses a checklist.
