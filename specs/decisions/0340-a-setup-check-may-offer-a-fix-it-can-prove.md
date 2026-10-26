# 0340: Routes borrow a pack that labels the ports, and a setup check may offer a fix it can prove

## Status

Accepted

## Context

A second player reported that the 🧭 travel panel "just tells me to run everywhere". They had druid
and wizard ports switched on and no zones avoided. The request that reached us was the natural one:
*can we force the map to recompute, and give them a button for it?*

Measuring the real install showed that a recompute is only half the answer, and on its own it would
have done nothing for this report. A route can walk everywhere for two unrelated reasons:

- **The pack labels no ring or spire.** Druid and wizard networks are wired from the map pack's own
  labels (`Druid Ring`, `Spires`). The game's own `maps/` folder labels neither. Built from it, the
  graph has 90 borders and **no teleport hub at all**, so Qeynos → West Freeport is a walk with
  every port switched on. That folder is also the pack the map window falls back to when nobody has
  picked one from the titlebar. A rebuild builds the same empty network again.
- **The stored graph is stale.** The graph is remembered between runs
  ([ADR 0169](./0169-the-travel-graph-is-built-once-and-remembered.md)) under a key covering the
  folder, the era, the curated inputs and the app version. The zone names it is built from come
  from a second cache, the gazetteer, keyed only on the folder. A bad name solve kept there
  survives every upgrade, and the graph key can't see it. A rebuild that forgets both does mend this.

[ADR 0100](./0100-a-setup-check-is-a-chain.md) made the setup check the place a player goes when
something isn't happening. It also held that the check **reports and never repairs**, because a
panel that can only describe can't mend the wrong thing.

## Decision

**A route is asked over a pack that can teleport** (`travelPack`, applied by the router's
`travelSource`). That is the pack the map window draws if it labels any ring or spire. Otherwise
it is the installed pack that reaches most: ports first, then borders. When no pack can teleport, the
drawn one stands. Drawing is left alone, so you can keep the game's maps on screen and still get
Brewall's ports. Nobody wants a pack that can't say where a port goes to plan their trips.

[ADR 0061](./0061-a-map-pack-names-its-own-zones.md) says a pack is its own survey, and that still
holds. Nothing is pooled: the whole route comes from one pack's graph. Routes are asked by zone
*name*, so they work across packs. Positions are not shared: answers carry the `pack` they came from,
and the map places a survey's markers only on a drawing from that same pack (`surveyFitsMap`, ADR 0111).
When it borrows, the travel panel says so, which also explains why the route's markers aren't on the
map you're looking at.

The setup check gains a **travel** row ("Travel routes can use teleports", needing `maps`) about the
pack routes are actually asked over. Main reads the map window's persisted choice from `ui-state`
and applies `travelSource`. The row compares that pack's routed graph with a build made **from nothing
stored** (a throwaway namer and no kept graph), and counts what each reaches (`travelReach`).

- **Stored ≠ fresh** → `fail`, with a **Rebuild travel map** button. The rebuild forgets that
  folder's gazetteer entry and stored graph, then builds again.
- **No installed pack can teleport** → `warn`, with no button. The fix is to install one.
- **Otherwise** → `pass`, quoting the counts and, when it borrowed, from under which drawing.

This narrows one consequence of [ADR 0100](./0100-a-setup-check-is-a-chain.md). A row may carry an
`action` (a fix the app can make itself), but **only when the probe has shown the fix would change
something**. Here that means the comparison against a fresh build. Every other row still only
describes. The panel runs the fix and then re-runs the whole check, because the row turning green is
the only proof it worked.

## Consequences

- Someone who never chose a pack, or who prefers to look at the game's maps, still gets ported.
  Qeynos → Oasis of Marr was a walk through Freeport and the Northern Desert of Ro over the game's
  folder. It is now a Wizard port to the South Ro spire.
- When routes borrow, a survey's markers aren't drawn on the game's map. The route reads correctly
  in the panel, but its legs aren't drawn. Drawing them would need positions moved between two
  drawings, which ADR 0111 rules out.
- The first route on a ring-less drawing builds every other installed pack once (kept on disk
  afterwards like any graph) to find the one to borrow.
- "Recompute the map" exists only where it can help. Comparing the whole stored graph with a fresh
  build relies on the build being deterministic through a JSON round trip. That held on a real
  568-file pack, and if it ever stops holding, every run reports a stale map — loud rather than silent.
- More fixes can be added as ids in `FIX` and cases in `selfCheckFix`. Each one owes the same proof.
