# 0063: A zone the pack lacks is borrowed from the game's own maps

## Status

Accepted

## Decision context

[ADR 0039](./0039-render-the-game-s-own-maps.md) made a map source a folder you pick between, and
[ADR 0061](./0061-a-map-pack-names-its-own-zones.md) stopped the packs lending each other *names* —
two surveys of one world, fought over a one-name-to-one-file rule, and Brewall lost eight zone names
its own labels state outright.

Coverage is a different question from naming, and it went unasked. Packs don't cover the same zones:

- The game's own `maps/` ships **no Blackburrow and no Unrest** — 237 of a real log's kills.
- Brewall's pack ships **no New Sebilis Expedition**, one of EQ Legends' own zones — 286 more.

So whichever folder you picked, a few hundred of your kills had no map, while the folder next to it
had one all along. The window said "no map file for this zone", which was true of the pack and false
of the install.

## Decision

**A zone the chosen pack has no file for is drawn from the game's own maps.** `zonesFromSources`
composes the zone list: everything the pack has, plus — for the short names it hasn't — whatever the
backstop can draw. Each `Zone` carries the `source` that will draw it, and `useVectorMap` loads from
*that* folder rather than the chosen one.

The backstop is specifically **the game's own `maps/`**, not "any other pack": it is the one folder
every install has, so the rule is the same on every machine. A second pack is a preference; the game's
maps are the floor.

**This is coverage, not blending, and the three rules that make it safe:**

- **One zone is still one file.** Nothing is drawn from two surveys at once, which is what would put
  two slightly different worlds on one canvas.
- **A borrowed zone is named by the folder it came from** — 0061 holds. The pack that couldn't draw it
  has no opinion about what it's called.
- **The pack wins wherever both have something**, including a name collision, since two entries for
  one place leave one of them unreachable.

**And it says so.** The title bar marks a borrowed map — "· from Game maps (maps folder)", with the
reason on hover. A map that looks different from the rest of them should never be a mystery.

Rejected alternatives:

- **Fall back to any pack, in the order they're listed.** Unpredictable — the answer would depend on
  what happens to be installed and how it sorts — and there's no argument for Goodurden's over
  Brewall's when your choice was neither.
- **Merge the file lists and pick per zone by which has more detail.** A silent quality judgement,
  and it makes the map you get depend on a segment count rather than on what you asked for.
- **Leave it, and let the user switch packs per zone.** That's the state this replaces: the switch is
  in the titlebar, but nothing tells you it would help, and it changes every *other* zone too.

## Consequences

- On a real install, every zone that has a map anywhere now has one: the 30 zones a log had visited
  went 15 → 27 resolving on naming alone ([ADR 0061](./0061-a-map-pack-names-its-own-zones.md) and the
  mapping list), and the last three are these — Blackburrow and Unrest on the game's maps, New Sebilis
  Expedition on Brewall's. Nothing left unmapped that any folder can draw.
- The zone picker lists more zones than the chosen pack has files for. That's the point, and the
  borrowed ones are marked once drawn.
- Two folders' names are now fetched instead of one (each cached in the main process, per folder).
- A pack that *does* cover a zone badly still wins — this only fills silence, never quality. Judging
  quality would need a rule nobody has.
- If the game's maps folder is where the pack lives (you picked the stock source), there's nothing to
  borrow from and the composition is a no-op.
