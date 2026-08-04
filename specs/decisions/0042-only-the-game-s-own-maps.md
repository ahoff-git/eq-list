# 0042: Only the game's own maps — the bundled scans are gone

## Status

Accepted

## Context

The app carried two kinds of map: 20 Project 1999 scans bundled into `public/maps/`, each needing
hand-tuned calibration, and the EverQuest map files on the player's own disk
([ADR 0039](./0039-render-the-game-s-own-maps.md)). The scans came first and the source dropdown
kept them "for now, for comparison".

Comparison is exactly what they stopped being good for. The two sets disagree in ways that look
like bugs and aren't:

- A scan can be **rotated or cropped**, and `scale` + `center` express a size and a position and
  nothing else, so such a map can *never* be calibrated to fit. Our own catalogue admitted it:
  `Neriakcommons_true_north.png` was named that way because the standard P99 Neriak Commons map
  isn't true north. Neriak Third Gate was the same story in coverage — a landscape crop (554×340)
  of a zone that is actually square (1206×1259).
- Five of the twenty were never calibrated at all
  ([ADR 0038](./0038-a-map-has-a-scale-and-a-centre.md) found their `size` was their image's own
  pixel dimensions), so they plotted nothing.
- The scans cover 20 zones. The game's folder covers 133 and Brewall's 568, in the server's own
  geometry, with labelled points of interest, and self-locating.

So the bundled half of the feature was a smaller, blurrier, more error-prone map that produced
questions about rotation and alignment which had nothing to do with the maps we actually draw.

## Decision

**Delete the bundled images, and everything that existed to serve them.** Gone: 4MB of scans in
`public/maps/`, the `Zone.mapImg`/`mapKeyImg`/`scale`/`center` fields, the map-key viewer, and the
whole calibration subsystem — `calibration.ts`, `useCalibration`, the 📐 tool, the click-to-fix
flow, and the image-pixel coordinate helpers it needed. The source dropdown now lists only folders
of map files; with no EverQuest install found there are no sources, and the window says so instead
of falling back to something worse.

**A projection is read, never authored.** `MapProjection { scale, center }` replaces the calibration
fields on `Zone`, and the coordinate functions take one directly rather than a zone. Only
`vectorProjection` produces one, off the geometry's own bounds — so there is no longer any way to
express a hand-tuned alignment, which is the point.

**`Zone` is now a name and a file.** Its old job — a catalogue of images and their calibration — is
reduced to the one thing map files can't supply: what a zone is *called*. `CURATED_ZONES` is a short
list of names the solver gets wrong or can't reach, and it still outranks
`solveZoneNames` ([ADR 0039](./0039-render-the-game-s-own-maps.md)).

**Per-file "layers" go; floors stay.** [ADR 0037](./0037-one-zone-many-layers.md) existed because
RunnyEye shipped as four separate *images*. One map file is one zone, so that mechanism has nothing
to do; the floor picker built on the mapmakers' own labels
([ADR 0040](./0040-floors-come-from-the-mapmaker.md)) is unaffected, and `onLayer` — which stamps
pins and pings with the floor they were made on — survives with its meaning narrowed to floors.

## Consequences

The installer loses 4MB and the app loses its only offline map: **a user with no EverQuest install
now sees no maps at all**. That's the honest state — the app already can't do anything without a log
file to watch, so a map that works without the game was never serving a real user.

Two todo items evaporated rather than being done: calibrating the five uncalibrated scans, and
finding images for the four zones a real log caught us missing. Both were image problems, and every
one of those zones has a map file already.

`scale`/`center` were introduced by [ADR 0038](./0038-a-map-has-a-scale-and-a-centre.md) *four
decisions ago*, along with a click-to-calibrate tool that took real work and is now deleted
unused-in-anger. That's the cost of having built the scans-first path at all; the calibration work
did pay for itself, in that deriving those two numbers properly is what proved the map files' own
coordinates were trustworthy in the first place.

The map subsystem gets materially smaller: one kind of map, one projection, one source of names, and
no branch anywhere for "is this an image or a map file".
