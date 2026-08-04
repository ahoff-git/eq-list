# 0039: Render the game's own map files, and let the player choose whose maps

## Status

Accepted

## Context

Every map the app could draw was a Project 1999 scan bundled into `public/maps/` and aligned
by hand. That capped us at 20 images, 15 of them calibrated, against eqlwiki's ~117 zones —
and each new one cost an image hunt plus a calibration session
([ADR 0038](./0038-a-map-has-a-scale-and-a-centre.md) made that cheap, not free).

EverQuest itself doesn't work that way. It draws vector maps from `<EverQuest>/maps/`, and
the community has been drawing them for twenty years (Brewall's, Goodurden's). The format is
two line kinds:

```
L x1, y1, z1, x2, y2, z2, R, G, B          a line segment
P x, y, z, R, G, B, size, label            a labelled point of interest
```

The decisive property is that **those coordinates are world coordinates** — x and y negated,
which is the same negation our canvas maths already applies. Checked against all ten zones we
had hand-tuned: the negated file extents sit inside the image extents with centre gaps of
tens of units on multi-thousand-unit zones (Greater Faydark 23/−22, Crushbone 18/5, Nektulos
79/−2), and the asymmetric zones only agree under negation. A map file already knows where it
is in the world, so **it needs no calibration at all**.

The install is free to find: we already watch `<EQ>/Logs`, so `maps` is its sibling.

## Decision

**A map source is a place maps come from, and the player picks one.** The bundled images are
one source; the game's `maps` folder is another; every subfolder of it holding `.txt` maps is
one more, discovered rather than hardcoded — unzip a pack and it appears in the dropdown,
with hover text naming the folders it looks in. The choice persists.

**Every source produces `Zone[]`**, so one code path serves both kinds. A file-backed zone
carries `file` (its short name) instead of `mapImg`/`scale`/`center`, and
`vectorProjection` turns its own geometry into the calibration it never needed: a synthetic
"image" the size of the world box it covers, at one pixel per EQ unit. Feed that to the
existing `fitRect`/`eqToCanvasCoords` and every marker, pin, ping, kill, grid, zoom and pan
path works unchanged. **A vector map is just a zone that calibrates itself.**

**All maps are available**, not only zones we have names for. Files are named for a zone's
*short* name (`gfaydark`, `qey2hh1`) and the log only says the long one, with no mapping
anywhere in the files. So naming is deliberately narrow: an alias table for the zones we ship
images for (which is where the real names come from — we aren't inventing any), two
conservative rules, and **the file's own name for everything else**. Loose rules are worse
than no name: dropping a trailing word maps "Qeynos Hills" onto `qeynos` (South Qeynos) and
taking the last word maps "East Commonlands" onto `commonlands` (a different zone), and a
confidently mislabelled map means kills plotted in the wrong place. An unnamed zone shows as
`gukbottom`, is still selectable, and a name can be filled in later.

**Layers 2 and up aren't drawn.** In every pack sampled, layer 2 is a compass rose plus the
mapmaker's credits drawn as vector text, parked thousands of units outside the zone — it
would clutter the map and wreck the fit-to-geometry view. Its labels *are* read, though, and
shown as attribution: someone drew these by hand and gave them away.

**The images stay.** They're a source like any other, kept for comparison while the vector
path proves itself in real use — along with the calibration tool that serves them.

## Consequences

Coverage goes from 15 calibrated zones to 133 from the game's own folder and 568 from
Brewall's, including every zone a real log caught us missing (New Sebilis Expedition, East
Commonlands, Unrest, the tutorial) and RunnyEye, whose four floors arrive as one map because
that's how the game draws them. Labelled points come free: zone exits, Succor spots, bankers,
forges, quest markers — 144 in Greater Faydark.

The two folders are genuinely different maps and worth switching between: EQ Legends' own
`gfaydark` has 14,566 segments to Brewall's 3,351, while Brewall ships far more labels. That's
the dropdown earning its place rather than a fallback chain guessing for the player.

Nothing about the image path changed, so a user with no EverQuest install (or a zone no pack
covers) sees exactly what they saw before. Calibration is now image-only — a file-backed zone
can't be calibrated because there's nothing to calibrate.

What this doesn't do yet: **floors**. RunnyEye's z clusters cleanly into four bands and its
mapmaker even labelled them (`LVL_2`, `Water_-_LVL_3`), and `LocEvent` already carries z — so
the layer choice that ADR 0037 makes manual could become automatic, for vector maps, from the
height you're standing at. That's a separate decision on separate evidence.
