# 0104: A position is readable, and opening one brings its evidence with it

## Status
Accepted

## Context
[ADR 0101](./0101-an-item-page-says-who-dropped-it.md) gave an item's page the camps its drops came
from, each with the roam centre averaged from your own kills — and showed that centre as a bare
**`±30`** button. Two things were wrong with it.

**The numbers were hidden.** A roam centre is a coordinate, and a coordinate is something a player
*reads*: it goes into the game, it gets compared with a wiki `Location:` line, it gets said out loud
to a group. Ours could only be clicked, and only its uncertainty was on screen — the one part of it
you can't use. The figure was in the tooltip, where it was written out by hand in three components
(`Math.round(area.y), Math.round(area.x)`), three chances to word one fact differently.

**And the click landed somewhere silent.** `map.openAt(zone, loc, label)` opens the map and drops a
star. On a busy heatmap in a zone you've killed thousands of things in, a star is a claim with
nothing to read it against: it can't say *which mob*, *how often*, or *how many of those kills are
behind it*. The map already holds all three — the 📖 knowledge panel and the ☠ list, both narrowed
by one shared `KillFilters` — and the window that asked for the marker knew exactly which row it
wanted, and had no way to say so.

## Decision
**Show the coordinate, and let the caller say what the marker is.**

- **Every generated position is printed as `y, x`, rounded, y first** — the order EQ prints, so it
  can be read straight into the game — with the `±spread` kept beside it in a quieter weight. One
  formatter (`locText`), so the app cannot spell a coordinate two ways.
- **One sentence describes a roam area** (`roamWhy`, beside the `MobArea` type it describes, the way
  `rateWhy` sits beside the rates). It hedges deliberately — *"Killed within about 30 units of
  120, -41, averaged over 12 positioned kills"* — because this is an average of kills, not a spawn
  point, and it carries its sample, because a centre from one kill is not a camp.
- **`map.openAt` takes an optional `MapFocus`** naming the mob and the drop the coordinate came
  from. Given one, the map window opens its **📖 knowledge panel** narrowed to that mob and that
  item, and **rings the mob's kills** on the map itself. The star says *here*; the panel says what
  and how often; the rings say which kills that rests on.
- **It stays optional and additive.** Every existing caller — a wiki card's `Zone:`, an embedded
  `(y, x)` — passes no focus and behaves exactly as before. The map does nothing extra when nothing
  is asked, so no click gains a side effect it didn't have.
- **The filter is visible after it lands.** It is set into the same `KillFilters` the panel's own
  filter bar shows and can clear, so a list narrowed by an arriving request looks identical to one
  narrowed by hand — rather than being a hidden mode the player has to guess at.

Rejected alternatives:

- **Emphasis alone.** `map.emphasize` already rings a mob's kills and is deliberately powerless to
  open a window (it rides on a hover). Making it open one would break the rule that keeps hovers
  from being commands, and it can't open a panel or narrow a list anyway.
- **The caller opening the map and then emphasising.** Two messages with a race between them: the
  window is still loading when the second arrives, and emphasis is only forwarded to a map that is
  already open. One message that carries its intent has no race to lose.
- **Showing the coordinate only in the tooltip.** That was the status quo, and it is exactly wrong
  for the one part of the row a player wants to copy.
- **Opening the ☠ kill list too.** Two panels is most of the map covered. The 📖 panel is the one
  that answers "how often, out of how many", which is the question a drop's position raises.

## Consequences
- A drop row now reads as a fact — *`Blackburrow 5/20 · 120, -41 ±30`* — rather than as a control,
  and the number can be used without the map at all.
- Clicking one is a complete answer: zone, spot, mob, item, rate and the kills behind it, in the
  window built to show them.
- The map's kill filters can now be set from another window, which is a small new power over a
  shared piece of state. It's why the filter had to land somewhere visible: an invisible narrowing
  is indistinguishable from a map that has lost its markers.
- Opening a focused position also **persists the 📖 panel open**, since that toggle is remembered
  per window. That's the same thing that happens when you press the toolbar button, so nothing new
  is being remembered — but a player who never opens the panel will find it open afterwards.
- Three components stopped building their own version of one sentence and one coordinate, and a
  fourth (this one) never had to.
