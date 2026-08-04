# Map coordinate model

How an EverQuest world coordinate maps to a pixel on the map, and back. The implementation is
`src/shared/map/coords.ts`; this is the derivation.

It takes two numbers — a scale and a centre — and **neither is ever authored**. A map file's
geometry is already in world coordinates, so `vectorProjection` reads them off its own bounds
([ADR 0042](../decisions/0042-only-the-game-s-own-maps.md); the hand-calibration those two numbers
were introduced for, in [ADR 0038](../decisions/0038-a-map-has-a-scale-and-a-centre.md), went with
the bundled scans).

## Inputs

- **`eq: Loc`** — an EQ world coordinate `{ y, x }` (EQ reports the triple y-first;
  we keep that order).
- **`projection: MapProjection`** — where the map is:
  - `scale` — **EQ world units per map pixel**. A property of the map, not of the window.
  - `center: { y, x }` — the EQ coordinate at the **centre of the map**.
- **`view: MapView`** — `{ image, canvas }`: the map's own extent and the pixel size of the surface
  we're drawing onto.

Without a projection every function returns `undefined` and nothing is plotted — which is the state
while a zone's geometry is still loading.

## The fit (`fitRect`)

A map is scaled to touch the tighter pair of canvas edges and centred, so a non-square
map is letterboxed:

```
f = min(canvas.width / image.width, canvas.height / image.height)
width  = image.width  · f          x = canvas.width/2  − width/2
height = image.height · f          y = canvas.height/2 − height/2
```

**Everything measures from this rectangle**, and the drawing uses the same function — a dot placed
against the canvas while the map sits in a letterboxed sub-rectangle is a dot in the wrong place.
It's also what lets a single isotropic `scale` be correct: measuring EQ spans across the *whole*
canvas per axis would need the two spans to differ on a non-square map, with that difference
silently standing in for the letterboxing.

## EQ → canvas (`eqToCanvasCoords`)

1. **EQ units per canvas pixel.** The scale is per *map* pixel, so adjust it by how far the map was
   fitted: `perPx = scale · image.width / rect.width`. (Equivalently `image.height / rect.height` —
   the fit preserves the aspect ratio.)
2. **Offset from the map's centre**, negating because EQ's axes run opposite to pixels —
   a coordinate north/east of centre draws up/left of it:
   `px = { x: cx − (eq.x − center.x)/perPx, y: cy − (eq.y − center.y)/perPx }`,
   where `(cx, cy)` is the centre of `rect`.
3. **Round** to whole pixels.

## Canvas → EQ (`canvasToEqCoords`) — the exact inverse

`eq = { y: center.y − (px.y − cy)·perPx, x: center.x − (px.x − cx)·perPx }`, rounded, and
returned y-first.

## Rounding

Both directions round to integers (whole pixels, whole EQ units), so a round-trip is exact
only up to one grid step, where one step is `perPx` EQ units.
`electron/tests/map-coords.test.ts` asserts the round-trip lands within that tolerance across a
spread of real scales and all three aspects (landscape, portrait, square), plus the centred-origin
case and the no-projection→`undefined` case. `electron/tests/eqmap.test.ts` asserts that a map's
projection puts its own geometry where the geometry says it is.
