# 0037: A zone is one place; its layers are a user choice, not a log fact

## Status

Accepted

## Context

RunnyEye Citadel's map only exists as four separate floor images, and the first cut at
supporting that added four entries to the zone catalogue — `RunnyEye Citadel1` … `4`, each
with its own calibration and a new `layer` field. Two things were wrong with it.

The picker listed the same place four times, which is what prompted this. The worse one was
quieter: the log says `RunnyEye Citadel` when you zone in, and none of those four names
matched it, so `findZone` never resolved any of them. A zone with four hand-calibrated maps
was *less* reachable by following the log than a zone with no map at all — you could only
get to it by picking it by hand.

Underneath both is the real constraint: **the log never says which floor you're on.** A
`/loc` line carries a z, but it isn't calibrated per floor, and nothing else in the log
mentions a layer. So the layer can't be derived — it can only be asked for.

## Decision

**A place is a `name`; a layer is another `Zone` sharing that name.** Layers differ by
`key` (unique, which is what calibration values are pasted against) and `layer` (1-based,
lowest first). A single-map zone leaves `layer` unset.

Four pure helpers in `src/shared/map/zones.ts` carry the model, so the UI holds none of it:

- `zoneLayers(name, zones)` — every map for one place, lowest first. Accepts a name *or*
  any of the layers' keys, so a saved pick still resolves to the whole set.
- `findZone(name, zones, layer?)` — unchanged for one-map zones; with no layer asked for
  it returns the **lowest**, so following the log lands on floor 1 rather than nothing.
- `collapseLayers(zones)` — one entry per place for the picker.
- `onLayer(marker, layer)` — marker visibility (below).

The map window lists each place once and shows a **second dropdown** for the layers when
there's more than one. The choice persists per window and is validated against the zone in
view, so travelling somewhere without that layer falls back to the first map.

**A marker is layer-scoped only when a person chose the layer.** Pins and pings are stamped
with the layer they were made on. Everything read out of the log — your position, peers'
positions, the kill heatmap, a mob's roam centre — has no layer and is filed zone-wide. An
unstamped marker shows on **every** layer, which is both the honest reading ("we don't know
which floor") and the migration for pins that predate this.

## Consequences

Adding a layered zone is now: same `name`, unique `key`, `layer: n`, calibrate each. Nothing
about the single-map path changed, and `findZone`'s old two-argument behaviour is intact —
an exact key still wins when no layer is named.

A multi-floor zone's kills all draw on whichever floor you're viewing, plotted by that
floor's calibration. That's a real limitation of the log rather than of the model: if the
`/loc` z is ever calibrated per floor, a kill can gain a `layer` and the same `onLayer`
filter applies with no other change.

Pins from before this ship are zone-wide, so nothing disappears; a pin you want on one
floor gets re-dropped there. Switching layer resets the map's zoom/pan (`MapPanel` keys that
on `zone.key`, not `name`) — the floors are separately scaled images, so a held crop would
land somewhere unrelated.
