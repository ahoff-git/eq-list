# 0061: A map pack names its own zones

## Status

Accepted

## Context

[ADR 0039](./0039-render-the-game-s-own-maps.md) made every folder of map files a **source** you pick
between: the game's own `maps/`, and each installed pack beside it (Brewall's, Goodurden's). Geometry
has always come from exactly one of them — `mapReader.load(dir, short)` reads one folder.

Naming did not. `createZoneNamer` harvested the exit labels (`to The Lesser Faydark`) from **every**
folder into one gazetteer, keyed by short name, and solved it once. The reasoning was sound on its
face: a short name means the same zone in every pack, the game's own maps label barely any exits, and
Brewall's label the same zones — so let each source benefit from the other's homework.

But a pack is a **survey**, not a contribution to a shared one: two folders are two authors drawing
the same world separately, with different coverage and different wording. And `solveZoneNames`
assigns **one name to one file** — that global uniqueness is what makes it refuse a confident wrong
answer — so merging two surveys' evidence lets one folder's file take a name out from under the
other's.

Measured on a real install, 133 game maps beside Brewall's 568:

- Pooling left **eight** Brewall zones nameless that its own labels name outright — Unrest, Sebilis,
  Dalnir, Kurn's Tower, the City of Mist, the Akheva Ruins, Trakanon's Teeth, Neriak Commons.
- It **rewrote seven more** in the other pack's wording (`northkarana` became "North Karana" rather
  than Brewall's own "The Northern Plains of Karana").

A player using one pack in the game and the same pack in the app is entitled to the same map and the
same names in both. Borrowed names break that quietly: nothing on screen says a name came from a
folder you are not looking at.

## Decision

**Each source is named from its own labels, and nothing else's.** `zoneNamer.names(source)` takes one
source and caches per folder; `map.names(sourceId)` is asked per source and re-asked when you switch
packs, clearing the previous pack's names first — the last pack's names over this pack's files is
exactly the mixing this removes.

The rest of the naming order is unchanged: **catalogue → this pack's solved names → the file's own
name**. A zone nobody can name still shows as `gukbottom`, still selectable and still drawn, which
[ADR 0039](./0039-render-the-game-s-own-maps.md) already settled as better than a loose guess.

Rejected alternatives:

- **Keep pooling, but only borrow a name for a file the other pack doesn't have.** Still mixes, and
  the damage measured above is not from *extra* names — it is the uniqueness constraint being fought
  over by two surveys, which this doesn't remove.
- **Pool, and label a borrowed name in the picker.** More UI to explain a mechanism that turned out
  to be a net loss even before the labelling.
- **A shared name table shipped with the app.** That is the catalogue, and it stays small on purpose
  ([ADR 0039](./0039-render-the-game-s-own-maps.md)); growing it to cover 568 files is the "table
  typed from memory" the solver exists to avoid.

## Consequences

- What you see is one pack: its geometry, its labels, its names. Switching packs re-reads all three.
- The game's own maps name **54 of 133** files instead of borrowing their way to more. That is the
  cost, paid deliberately: they label few exits, so most of them show a file name until the catalogue
  covers them. Every zone remains selectable and drawable.
- Brewall's naming is *better* than it was — the eight zones above come back, in its own wording.
- Naming is now cached per folder rather than per set of folders, so switching packs and switching
  back costs one scan each, not one per combination.
- A pack that ships no exit labels at all now names nothing on its own. Its files still draw; the
  catalogue and the file names carry it.
