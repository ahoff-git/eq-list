/**
 * Black-box tests for the zone catalogue's lookup/layer helpers (pure). These decide what
 * the zone picker lists and which map the log's zone name resolves to, so the layer model
 * — one place, several maps — is pinned here rather than in the UI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { baseZones, collapseLayers, findZone, layerLabel, onLayer, sortZones, zoneLayers } from "../../src/shared/map/zones";
import type { Zone } from "../../src/shared/map/types";

/** A two-layer place plus a single-map one — the whole shape under test, in miniature. */
const zones: Zone[] = [
  { name: "Tower", key: "tower-2", layer: 2, mapImg: "/maps/t2.jpg" },
  { name: "Tower", key: "tower-1", layer: 1, mapImg: "/maps/t1.jpg" },
  { name: "The Field", key: "the-field", mapImg: "/maps/f.jpg" },
];

test("zoneLayers gathers a place's maps, lowest layer first, by name or by any of its keys", () => {
  assert.deepEqual(
    zoneLayers("Tower", zones).map((z) => z.key),
    ["tower-1", "tower-2"],
  );
  // A saved pick of one layer still resolves to the whole set.
  assert.deepEqual(
    zoneLayers("tower-2", zones).map((z) => z.key),
    ["tower-1", "tower-2"],
  );
  // Name matching stays tolerant of case and a leading "the".
  assert.deepEqual(
    zoneLayers("field", zones).map((z) => z.key),
    ["the-field"],
  );
  assert.deepEqual(zoneLayers("Nowhere", zones), []);
});

test("findZone picks the asked-for layer, and the lowest when none is asked for", () => {
  assert.equal(findZone("Tower", zones)?.key, "tower-1");
  assert.equal(findZone("Tower", zones, 2)?.key, "tower-2");
  // An exact key still wins when no layer is named, so old saved values resolve as before.
  assert.equal(findZone("tower-2", zones)?.key, "tower-2");
  // A layer this place doesn't have falls back rather than showing nothing.
  assert.equal(findZone("Tower", zones, 9)?.key, "tower-1");
  assert.equal(findZone("Nowhere", zones), undefined);
});

test("collapseLayers lists a place once, at its lowest layer", () => {
  assert.deepEqual(
    sortZones(collapseLayers(zones)).map((z) => z.key),
    ["the-field", "tower-1"],
  );
});

test("onLayer hides other layers but keeps zone-wide markers", () => {
  assert.equal(onLayer({ layer: 2 }, 2), true);
  assert.equal(onLayer({ layer: 2 }, 1), false);
  // No layer = the marker belongs to the zone, so it shows on every layer and on
  // zones that have none.
  assert.equal(onLayer({}, 2), true);
  assert.equal(onLayer({}, undefined), true);
  // A layered marker never leaks onto an unlayered zone's map.
  assert.equal(onLayer({ layer: 1 }, undefined), false);
});

test("the bundled catalogue exposes RunnyEye's four floors as one place", () => {
  const runnyeye = zoneLayers("RunnyEye Citadel", baseZones);
  assert.deepEqual(
    runnyeye.map((z) => z.layer),
    [1, 2, 3, 4],
  );
  // Every layer has its own map, and the picker shows the place once. None is calibrated
  // yet: the four `size`s they used to carry were their images' pixel dimensions, which is
  // a placeholder rather than a measurement (ADR 0038) — 📐 is how they get real ones.
  assert.ok(runnyeye.every((z) => z.mapImg && !z.scale && !z.center));
  assert.equal(collapseLayers(baseZones).filter((z) => z.name === "RunnyEye Citadel").length, 1);
  assert.equal(layerLabel(runnyeye[2]), "Layer 3");
  // Keys stay unique per layer — they're what calibration values are pasted against.
  assert.equal(new Set(baseZones.map((z) => z.key)).size, baseZones.length);
});
