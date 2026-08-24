# 0048: A map label is read by its words, and a bracket it can't read defers

## Status

Accepted

## Context

The map's 👁 panel offers to hide kinds of map label ([ADR 0039](./0039-render-the-game-s-own-maps.md)
put the packs' labels on screen; a busy dungeon is mostly labels). Classification was eight kinds
decided by the label's own words, with one catch-all at the end: **a trailing parenthetical that
isn't a quest, a bare `(Hunter)`, or a click instruction "names the trade they deal in"**.

Tallying the whole corpus — 760 files (the game's own 192 plus Brewall's 568), 18,946 distinct
labels — says what that cost:

- **5,749 distinct labels were filed as merchants**, ~30% of every label in the corpus. Among them
  every `Locked Door (Picklock 200+)`, `One-Way (to East)`, `Prince Jerranad (Boss)`,
  `Mujaki the Devourer (Raid)`, and **4,119 labels wearing `(Hunter…)`** — `(Hunter,Roam)`,
  `(Hunter,Roam,HS)`, `(Hunter,5days+2hours)`. `(Hunter)` alone was recognised; the stacked forms,
  which are the majority, were not. This is the most common parenthetical in the corpus, and it was
  the merchant list.
- **`GS:` was read as a quest prefix.** It is *Ground Spawn* — 422 distinct labels marking a
  harvestable item on the floor — so a zone's entire foraging map sat under "Quests".
- Eight kinds also had nowhere to put the things a dungeon map is largely made of: 217 `TRAP`
  markers, 138 `Fake Wall`s, doors with their keys and picklock skills, ladders, elevators, druid
  rings, spires, teleport pads. Those went to "Names & places" or "Notes".

Separately, **floors were single-pick**: a `<select>` of one storey at a time, and no control at all
on the ~95% of maps whose author labelled no storeys ([ADR 0040](./0040-floors-come-from-the-mapmaker.md)
established that floors are read from those labels and never guessed from heights).

## Decision

**A label is classified by what its words actually say, and a parenthetical we can't read defers to
the rest of the label rather than assuming a trade.** Fourteen kinds, in five sections:

| Section | Kinds |
| --- | --- |
| Getting around | zone lines · ports & boats · ways up & down |
| Doors & traps | doors & clickies · traps & hazards |
| Who's here | vendors & services · quests & missions · named & bosses · ordinary spawns |
| The zone | ground spawns & drops · tradeskill stations · names & places |
| Map notes | floor markers · notes |

Each vocabulary is a **tally of the corpus**, and the counts stay in the code as comments so a rule
can be argued with. `merchant` is now a positive match on trade and service words (`(General)` 301,
`(Merchant)` 278, `(Spells)` 198, `(Smithing)` 160 …) instead of the fallback; `note` is the only
fallback, as it always should have been.

Two readings outrank a bracket: `(Hunter…)` marks an achievement spawn whatever else the label says,
and `to The Plane of Knowledge (Click Book)` is a zone line however you work it. Otherwise, **what
the label already says it is outranks what the bracket says about working it** — the bracket on
`Elevator (click)` is an instruction, not the thing.

The filter's **sections are themselves toggles**, because the gesture you actually want is a whole
section off, not one kind at a time.

**Floors became multi-select, and a map with no labelled floors gets a height window instead.** The
checkboxes let two storeys be read together, which one dropdown never could; a hand-set `minZ..maxZ`
window is offered on maps that name no storeys, since height is the only thing such a map can
honestly be filtered by. Both feed one `ZBand[]` — the drawing cares about heights, and only some of
the heights it is given have a name.

## Consequences

Merchants fall from 5,749 distinct labels to 3,740, and the bucket is genuinely merchants. 4,909
labels are now named/boss spawns, 946 zone lines, 421 ground spawns, 333 doors, 397 traps, 337
passages, 409 transport — all of which were previously merchants, "named", or notes.

**"Names & places" is still the largest bucket (6,461), and stays deliberately ambiguous.** A proper
name written plain — `Enraged Trueborn Lightstealer`, `Bandit Camp` — cannot be told from a landmark
by its words. Splitting it on a guess would be a worse answer than one honest section; the hint says
so in as many words.

Fourteen checkboxes need grouping to be usable at all, which is why the sections exist rather than
being decoration. The 👁 panel moved into its own component (`MapFilters`) and scrolls.

A **height window can't persist**: z means a treetop in one zone and a sewer in the next, so it is
held with its zone and dropped the moment you look at another. The floor picks do persist, and an
empty or stale pick falls back to showing every floor — hiding every floor would only blank the map.

`onLayer` now takes a *set* of floors, and a marker stamped with a floor the current map lacks now
shows rather than hiding: a pin you placed is yours, and switching map packs shouldn't lose it.

This does **not** reopen [ADR 0040](./0040-floors-come-from-the-mapmaker.md). Nothing here guesses
where a floor is; the height window is a filter a person sets and reads, on a scale taken from the
map's own geometry, and it is never chosen for you.

The classifier will still be wrong sometimes — it is reading hand-authored text — but it is now
wrong in ways the corpus can be re-tallied against, and the tests are real labels for that reason.
