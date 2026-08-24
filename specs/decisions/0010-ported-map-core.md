# 0010: Port eq-map's map core; show the map in a sibling window

## Status
Superseded by 0042

The `/loc` feed and the sibling map window stand. The ported *image* core does not:
[0038](./0038-a-map-has-a-scale-and-a-centre.md) replaced its `size`/`centerOffset` calibration and
[0042](./0042-only-the-game-s-own-maps.md) removed the bundled scans altogether.

## Context
Users want to see where they are while playing. A sibling project, **eq-map**, has
an isolated, dependency-free map core (`types`/`coords`/`zones`/`draw`/`calibration`)
plus Project 1999 classic map images and calibration. Rebuilding that geometry from
scratch would be wasted effort, and this app already has the pipeline to feed it:
a log watcher, a main→renderer broadcast for the current zone, and a windowing layer.
The one missing input was a **player-location feed** — the log's `/loc` line wasn't
parsed.

The [map-import proposal](../map/) sketched this as a new **Map tab**. The user
instead asked for a **separate window** (the old, now-removed control window's
"repurpose it for a map later" slot from [ADR 0009](./0009-single-window-with-tray.md)).

## Decision
- **Add a `/loc` location feed** mirroring the existing `zone` event end-to-end:
  `LocEvent` + `parseLocLine` (pure, tested) → `watcher.onLoc` → `currentLoc` →
  `CH.locChanged` broadcast → `usePlayerLoc` / `usePlayerTrail`.
- **Port the map core** into this repo, split by DOM dependency: the pure geometry
  (`types`, `coords`, `zones`) to `src/shared/map/` (unit-tested with `node --test`),
  the canvas drawing (`draw`) to `src/lib/map/`. Copy the P99 images to
  `public/maps/` and retarget `zones.ts` image paths to `/maps/…` (served by the
  `app://` protocol from `out/maps/`). Fixed one data bug (Neriak Third Gate's key
  image was missing its extension).
- **Show it in a sibling window**, not a tab: `createMapWindow` (frameless,
  translucent, resizable, always-on-top) loads route `/map`, opened on demand from
  the main window's 🗺 button. It follows the current zone (with a dropdown to view
  any mapped zone) and receives zone/loc via the same broadcasts as every window.

## Consequences
- Reuses proven geometry verbatim; the only new logic is the location feed and the
  window/UI glue. Round-trip + known-point tests pin the coord math.
- The dot updates **per `/loc` line** (EQ logs a location only when one is emitted),
  not continuously — surfaced in the UI so it doesn't read as broken.
- Calibration is P99-derived and may not perfectly fit every EQL zone. The dev-only
  **calibration tool** (ported `calibration.ts` + a keyboard hook, gated behind the
  tray's Debug logging) re-tunes `size`/`centerOffset` live; the values are then
  hand-copied into `zones.ts` (the tool doesn't persist them). Same path adds a new
  map: add a zone entry with rough values, then nudge.
- Third window in play (main + map + the screengrab selectors); `window-state`
  gained a `map` role for saved bounds.
