# Map coordinate model

How an EverQuest world coordinate maps to a pixel on the zone image, and back. The
implementation is `src/shared/map/coords.ts`; this is the derivation. The calibration it
takes as input is two numbers, arrived at by clicking — see
[ADR 0038](../decisions/0038-a-map-has-a-scale-and-a-centre.md).

## Inputs

- **`eq: Loc`** — an EQ world coordinate `{ y, x }` (EQ reports the triple y-first;
  we keep that order).
- **`zone`** — calibration for the map:
  - `scale` — **EQ world units per image pixel**. A property of the map, not of the window.
  - `center: { y, x }` — the EQ coordinate at the **centre of the image**.
- **`view: MapView`** — `{ image, canvas }`: the map's own pixel dimensions (read off the
  loaded image, never authored) and the pixel size of the surface we're drawing onto.

A map without `scale` + `center` is **uncalibrated**: every function returns `undefined`
and nothing is plotted, though the image still draws.

## The fit (`fitRect`)

An image is scaled to touch the tighter pair of canvas edges and centred, so a non-square
map is letterboxed:

```
f = min(canvas.width / image.width, canvas.height / image.height)
width  = image.width  · f          x = canvas.width/2  − width/2
height = image.height · f          y = canvas.height/2 − height/2
```

**Everything measures from this rectangle**, and the drawing uses the same function — a dot
placed against the canvas while the picture sits in a letterboxed sub-rectangle is a dot in
the wrong place. This is also what lets one isotropic `scale` be correct: the old model
measured EQ spans across the *whole canvas* in each axis independently, so a non-square map
needed the two spans to differ, and that difference was standing in for the letterboxing.

## EQ → canvas (`eqToCanvasCoords`)

1. **EQ units per canvas pixel.** The scale is per *image* pixel, so adjust it by how far
   the image was fitted: `perPx = scale · image.width / rect.width`. (Equivalently
   `image.height / rect.height` — the fit preserves the aspect ratio.)
2. **Offset from the image centre**, negating because EQ's axes run opposite to pixels —
   a coordinate north/east of centre draws up/left of it:
   `px = { x: cx − (eq.x − center.x)/perPx, y: cy − (eq.y − center.y)/perPx }`,
   where `(cx, cy)` is the centre of `rect`.
3. **Round** to whole pixels.

## Canvas → EQ (`canvasToEqCoords`) — the exact inverse

`eq = { y: center.y − (px.y − cy)·perPx, x: center.x − (px.x − cx)·perPx }`, rounded, and
returned y-first.

## Image pixels (`canvasToImagePx` / `imagePxToCanvas`)

The same fit, without any calibration: a canvas point becomes a pixel of the image itself.
Calibration fixes are recorded in image pixels so resizing the window — or zooming the
view — can't invalidate one, and they need no calibration to exist, which is the point.

## Calibration, solved (`calibration.ts`)

A **fix** pairs a known EQ coordinate with the image pixel the player says it sits on
(`/loc`, then click that spot). In image pixels the mapping above reads
`imgPx.x = image.width/2 − (eq.x − center.x)/scale`, so:

- **Centre, from one fix at a known scale** — rearranged for `center`:
  `center.x = eq.x + (imgPx.x − image.width/2) · scale` (and the same for `y`).
  One fix *places* an already-scaled map.
- **Scale, from two fixes** — the same rearrangement, differenced so the centre drops out:
  `scale = |ΔEQ| / |Δpx|`, both Euclidean, taken from the pair furthest apart in pixels
  (the longest baseline is the most accurate). Isotropic by construction — there is no way
  to express a stretched map, because no image is stretched.

With more than two fixes the centre is averaged over all of them, so one shaky click is
diluted rather than decisive.

## Rounding

Both directions round to integers (whole pixels, whole EQ units), so a round-trip is exact
only up to one grid step, where one step is `perPx` EQ units.
`electron/tests/map-coords.test.ts` asserts the round-trip lands within that tolerance for
every calibrated `baseZone` against landscape, portrait and square images, plus the
centred-origin case and the uncalibrated→`undefined` case.
`electron/tests/map-calibration.test.ts` asserts the solve recovers a known calibration
from fixes sampled off it.
