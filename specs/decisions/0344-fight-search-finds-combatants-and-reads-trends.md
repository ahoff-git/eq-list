# 0344: Fight search finds anyone in a fight, and reads trends off what it found

## Status
Accepted

## Context
"Every time I fought Nagafen" is a question about history, and the History tab's search box
answered it only through the fight's *label*: the single opponent your side damaged most. A pull
where his adds took more damage than he did was labelled after an add, so it didn't come back
for his name.

A list of matching fights is also only the start of the answer. What you want from twenty
Nagafen fights is what they have in common: what hurts, which spells he shrugs off, and how often
it went badly. The figures for that are already in each fight's damage cells
([ADR 0053](./0053-damage-is-cells-rolled-up.md), [ADR 0343](./0343-resists-and-avoidance-live-in-the-damage-cells.md)).

## Decision
- **The search matches every combatant**, as well as the label and the zone. Every word still has
  to match somewhere, so "coyote steam" still means the coyotes in Steamfont. A group-mate's name
  now finds the evenings they were along.
- **Trends are computed in the renderer over the fights the search returned**, by a pure
  `fight-trends.ts`. The panel says how many fights the figures are from. The search is capped at
  the newest 100, so the trends describe the recent slice. That keeps the IPC answer unchanged
  and the work bounded per keystroke.
- **The subject is the enemies the search named**: every word matches the name or the zone,
  at least one of them the name. A search that names only a place is about every enemy there.
- Tips appear only past a floor of evidence (five casts for a resist rate, twenty swings for
  avoidance). Each tip carries its `kind` and the figures behind it, not just a sentence. Cells
  now keep a source's damage type (`fire`, `cold`) for that reason.

## Consequences
- The next step can reuse the trend tips' data rather than parsing the prose: suggesting fire
  resist against a fire breath, or mitigation against crushes.
- Fights stored before the cells (or before damage types were kept) count towards deaths but add
  no figures. The damage type is missing until their log is digested again.
- Matching on combatants widens results. A short word now also hits group-mates and pets.
