/**
 * map-labels.mjs — where a zone's own map file says a named thing stands.
 *
 * EverQuest map files mark points of interest with label lines — `P -474.0000, -547.0000, 0, …,
 * Gorgalosk_(Raid)` — in map coordinates, which are `/loc`'s y and x negated. Mapmakers label the
 * named NPCs worth finding, which is exactly who a wiki page sometimes forgets to give a `location`
 * (the Plane of Sky's island bosses have none). This finds the label for a name, so a plan can still
 * place them ([ADR 0300](../../specs/decisions/0300-a-long-quest-is-a-plan-of-stages.md)).
 *
 * Only zones this server runs have a map file to read; the zone → file table is the same supplied
 * gazetteer the app's map uses (`src/shared/zones/eql-classic-zone-maps.json`).
 */
import fs from "node:fs";
import path from "node:path";

/** `The Plane of Sky`, `plane_of sky` → `plane of sky` — the fold labels and names are compared in. */
export function foldLabel(text) {
  return text
    .replace(/_/g, " ")
    .replace(/[`’]/g, "'")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/^#?\d+\s+/, "")
    .trim()
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ");
}

/** The map file names a zone is drawn in, from the supplied gazetteer — `[]` for a zone it doesn't carry. */
export function mapNamesFor(zone, gazetteer) {
  const want = foldLabel(zone);
  const out = [];
  for (const entry of gazetteer.zones ?? []) {
    for (const map of entry.maps ?? []) {
      const names = [entry.zone, map.display_name, ...(map.aliases ?? [])].filter(Boolean).map(foldLabel);
      if (names.includes(want)) out.push(map.map_name);
    }
  }
  return [...new Set(out)];
}

/**
 * Every label in a map's files (base and layers, every source on disk), as `/loc` y, x — except a
 * label **off the drawn map**. Mapmakers put a legend beside the map in a layer of its own (the Plane
 * of Sky's `_2` lists every boss in one column at x 300), and a legend entry is a name, not a place:
 * read as one, it puts Gorgalosk three thousand units out in the void.
 */
const LEGEND_COLUMN = 5;

export function mapLabels(mapsDir, mapName) {
  const labels = [];
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const source of ["brewall", "stock"]) {
    for (const layer of ["", "_1", "_2", "_3"]) {
      let text;
      try {
        text = fs.readFileSync(path.join(mapsDir, source, `${mapName}${layer}.txt`), "utf8");
      } catch {
        continue;
      }
      for (const line of text.split(/\r?\n/)) {
        const parts = line.slice(1).split(",").map((p) => p.trim());
        if (line.startsWith("L")) {
          for (const [x, y] of [[parts[0], parts[1]], [parts[3], parts[4]]].map((xy) => xy.map(Number))) {
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            bounds.minX = Math.min(bounds.minX, x);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxY = Math.max(bounds.maxY, y);
          }
        } else if (line.startsWith("P")) {
          const [mx, my] = [Number(parts[0]), Number(parts[1])];
          const label = parts.slice(7).join(",");
          if (Number.isFinite(mx) && Number.isFinite(my) && label) labels.push({ label, mx, my, file: `${source}${layer}` });
        }
      }
    }
  }
  // A legend is a column: five or more labels in one file at exactly the same x. No map puts five
  // real places on one coordinate, and a legend can sit inside the drawn bounds as easily as outside.
  const column = new Map();
  for (const l of labels) column.set(`${l.file}|${l.mx}`, (column.get(`${l.file}|${l.mx}`) ?? 0) + 1);
  for (const l of labels) l.legend = column.get(`${l.file}|${l.mx}`) >= LEGEND_COLUMN;
  const onMap = (l) => l.mx >= bounds.minX && l.mx <= bounds.maxX && l.my >= bounds.minY && l.my <= bounds.maxY;
  return labels.filter((l) => onMap(l) && !l.legend).map((l) => ({ label: l.label, y: -l.my, x: -l.mx }));
}

/**
 * Where a zone's map labels `name`, or `undefined` when no label is that name — or when labels for it
 * disagree by more than `agree` units (two sources put it in different places; neither is trusted).
 */
export function labelPlace(labels, name, agree = 300) {
  const want = foldLabel(name);
  const hits = labels.filter((l) => foldLabel(l.label) === want);
  if (!hits.length) return undefined;
  const far = hits.some((h) => Math.hypot(h.y - hits[0].y, h.x - hits[0].x) > agree);
  return far ? undefined : { y: Math.round(hits[0].y), x: Math.round(hits[0].x) };
}
