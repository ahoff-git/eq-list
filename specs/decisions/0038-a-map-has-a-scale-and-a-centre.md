# 0038: A map has a scale and a centre, and you calibrate it by clicking

## Status

Accepted

## Context

Calibration was two hand-tuned pairs per zone — `size: { width, height }` and
`centerOffset: { y, x }` — nudged into place with W/A/S/D and I/J/K/L. `size` was
documented as "the span of EQ world units the map image covers", and it wasn't. The
coordinate maths spread that span across the **whole canvas** in each axis independently,
while `drawImageScaled` fitted the image into a letterboxed sub-rectangle of that canvas.
So `size` was really two fudge factors absorbing three different things at once: the map's
scale, the letterboxing, and whatever the tuner's eye settled on. Nothing about it was
checkable against the world.

Three consequences, all visible in the bundled data:

- **It could express maps that can't exist.** Two independent axes mean a stretched map. The
  15 genuinely-tuned zones came out within 2% of isotropic anyway (worst: Toxxulia, ~11px of
  skew across a 537px image), which is the tuners fighting to a result the model should have
  guaranteed.
- **Five zones were never calibrated at all.** RunnyEye Citadel's four floors and Northern
  Desert of Ro carried a `size` that was, to the pixel, their image's own dimensions
  (431×488, 296×569, …). Someone pasted the image dimensions in. Those zones plotted your
  dot at a fictitious spot and nothing said so.
- **Adding a map was miserable.** A new zone started from nonsense and reached alignment
  only by holding down keys — on a 6,000-unit zone, at 100 units a press, against a number
  with no meaning to reason about.

The image's pixel dimensions were the missing input all along. They're free at runtime
(`naturalWidth`/`naturalHeight` on the loaded image) and can't be got wrong.

## Decision

**Calibration is `scale` (EQ world units per image pixel) and `center` (the EQ coordinate
at the image's centre).** Both are real, checkable quantities about the map. Nothing
describes the image's pixel size — that's read off the image, so it can't be authored
wrongly. `Zone.size`, `Zone.centerOffset` and the write-only `Zone.mapDims` are gone.

**All geometry measures from the image as drawn.** One pure `fitRect(image, canvas)` gives
the rectangle the image is fitted into; `drawImageScaled` draws into it and the coordinate
maths measures from it. One definition, so the picture and the plotted dot can't disagree —
and with the letterboxing accounted for, a single isotropic scale is correct, so a stretched
map is no longer expressible.

**You calibrate by clicking a fix.** A *fix* pairs a known EQ coordinate with the image
pixel it sits on: `/loc` in-game, then click that spot on the map. One fix *places* a map
whose scale is already right. Two fixes far apart also *scale* it — the EQ distance between
them over the pixel distance **is** EQ units per pixel — so a map with no calibration at all
becomes a calibrated one in two clicks. The keyboard stays for fine-tuning: I/J/K/L move the
centre by the step, W/S change the scale by 1% a press. Derivation in
[data-model.md](../map/data-model.md); the solve is pure and unit-tested.

**The five uncalibrated zones lose their fake numbers** rather than carrying them forward.
They keep their maps, report themselves as uncalibrated, and the 📐 tool — which now works
on *any* zone that has an image, not only one that already has numbers — is how they get
real ones.

The other 15 were converted arithmetically: their old canvas-relative spans, read against
the square canvas they were tuned on and the image's true dimensions, reduce to
`scale = mean(size.width, size.height) / max(image.width, image.height)`, and
`center = −centerOffset` (the old offset was in negated EQ units, which is the other reason
it was hard to reason about).

## Consequences

Adding a map is now: drop the image in, pick the zone, 📐, `/loc` and click, walk somewhere
else, `/loc` and click. Two clicks instead of a keyboard grind, and the numbers that come
out mean something — "this map is 12.7 EQ units per pixel, centred on 0,0" can be sanity
checked without the app.

Every bundled zone's alignment shifts by up to 2%, since the anisotropy in the old numbers
can't be represented and is averaged away. That's a fraction of the letterboxing error the
old maths was carrying, but it does mean the 15 converted zones deserve a real-run look.

**RunnyEye and Northern Desert of Ro won't plot a dot until someone calibrates them.** That
is a visible regression against a feature that never worked — they were plotting against
their own pixel dimensions — and it's now stated in the UI instead of implied by a wrong
dot.

The tool still doesn't persist: values are copied out (there's a copy button now) and pasted
into `zones.ts`, which keeps calibration reviewable in git rather than hidden in a user's
store. If in-app persistence is ever wanted, the shape it would save is exactly the two
numbers this ADR settles on.
