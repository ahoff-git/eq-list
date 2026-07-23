# Map coordinate model

How an EverQuest world coordinate maps to a pixel on the zone image, and back. The
implementation is `src/shared/map/coords.ts`; this is the derivation.

## Inputs

- **`eq: Loc`** — an EQ world coordinate `{ y, x }` (EQ reports the triple y-first;
  we keep that order).
- **`zone`** — calibration for the zone:
  - `size: { width, height }` — the span of EQ world units the map image covers.
  - `centerOffset: { y, x }` — where the image's centre sits in (negated) EQ units.
- **`size: CanvasSize`** — the pixel `{ width, height }` we're drawing onto (a square
  canvas in practice).

A zone without `size` + `centerOffset` is **uncalibrated**: both functions return
`undefined` and nothing is plotted.

## EQ → canvas (`eqToCanvasCoords`)

1. **Flip axes.** EQ's axes run opposite to canvas pixels, so negate:
   `unscaled = { x: -eq.x, y: -eq.y }`.
2. **Scale + offset** into pixels relative to the image centre:
   `centered.x = (unscaled.x − centerOffset.x) · size.width / zone.size.width`
   (and the same for `y`).
3. **Shift origin** from the centre to the top-left and round:
   `px = { x: round(centered.x + size.width/2), y: round(centered.y + size.height/2) }`.

## Canvas → EQ (`canvasToEqCoords`) — the exact inverse

1. **Recentre:** `centered = { x: px.x − size.width/2, y: px.y − size.height/2 }`.
2. **Unscale + un-offset:**
   `scaled.x = (centered.x / size.width) · zone.size.width + centerOffset.x`
   (and the same for `y`).
3. **Flip back**, y-first: `eq = { y: −round(scaled.y), x: −round(scaled.x) }`.

## Rounding

Both directions round to integers (whole pixels, whole EQ units), so a round-trip
is exact only up to one grid step, where one step ≈ `zone.size / canvas.size` EQ
units per pixel. `electron/tests/map-coords.test.ts` asserts the round-trip lands
within that tolerance for every calibrated `baseZone`, plus the centred-origin case
(`{y:0,x:0}` ↔ canvas centre) and the uncalibrated→`undefined` case.

## Drawing note

`drawImageScaled` fits the image into the (square) canvas preserving aspect ratio
and centred, and records the on-screen size as `zone.mapDims`. The coordinate math
uses the **full canvas size**, not the letterboxed image size — so alignment is
tightest when the image roughly fills the square canvas (as the classic maps do).
Fine-tuning `size`/`centerOffset` is the calibration tool's job (see the map README).
