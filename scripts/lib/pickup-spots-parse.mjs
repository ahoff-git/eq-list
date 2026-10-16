/**
 * pickup-spots-parse.mjs — read named ground spawns out of a quest page's prose.
 *
 * Most quests don't table their ground spawns (`pickup-table-parse.mjs`) or list them in one bullet
 * shape (`pickup-checklist-parse.mjs`). They mention each one in a sentence, in whatever words the
 * editor chose:
 *
 *   * [[Ingot of the Ardent]] (Ground spawn in [[Everfrost Peaks]] at 2984, -5716. You'll most likely …)
 *   * The [[Magnifying Glass]] is a bag sitting on the ground not too far from the shore. The loc is -600, 2000.
 *   * [[Barbarian Femur]]:  +1405, -4570, -190
 *
 * No rule finds *which* sentences are pickups without also finding every "Find [[NPC]] at …", so the
 * config names them (`spots`), and this reads the rest off the page: where, and the directions.
 * Each spot is found by a piece of text on its line (`match`, by default its item's link).
 *
 *   - **loc** — a `{{Loc|Zone|(y, x)}}` on that line, else the first `y, x[, z]` after the match.
 *   - **zone** — the spot's own `zone` if it gives one (for prose that names it unlinked, "in
 *     Kithicor"), else the `{{Loc}}`'s zone, else the first link after the match that isn't the item.
 *
 * A spot whose line states no position is reported in `skipped`, unless it says `noLoc: true` — some
 * pickups are only ever described ("in the Ghost Room Pit in Unrest"), and saying so in the config
 * keeps a parse that lost a coordinate from shipping silently.
 *
 * Pure: wikitext in, rows out, in the shape the other two parsers return.
 */
import { parseLoc, plainText } from "./pickup-table-parse.mjs";

const LOC_TEMPLATE = /\{\{\s*loc\s*\|\s*([^|}]+?)\s*\|([^}|]*)/i;
const COORDS = /([-+]?\d{1,5}(?:\.\d+)?)\s*,\s*([-+]?\d{1,5}(?:\.\d+)?)(?:\s*,\s*([-+]?\d{1,5}(?:\.\d+)?))?/;
const LINK = /\[\[([^\]|#]+)(?:[^\]]*)\]\]/g;

/** Every spot in `spots` found on the page: `{ label, item, zone, loc?, note, extras }`. */
export function parsePickupSpots(wikitext, spots) {
  const lines = wikitext.split("\n");
  const rows = [];
  const skipped = [];
  for (const spot of spots) {
    const item = spot.item;
    const label = spot.label ?? item;
    const match = spot.match ?? `[[${item}]]`;
    const line = lines.find((l) => l.includes(match) && (spot.noLoc || place(l, match)));
    if (!line) {
      skipped.push(`${label} (no line with "${match}"${spot.noLoc ? "" : " and a position"})`);
      continue;
    }
    const found = spot.noLoc ? undefined : place(line, match);
    const zone = spot.zone ?? found?.zone ?? linkAfter(line, match, item);
    if (!zone) {
      skipped.push(`${label} (no zone)`);
      continue;
    }
    const note = plainText(line.replace(/^[*#:]+\s*/, ""));
    rows.push({ label, item, zone, ...(found ? { loc: found.loc } : {}), note, extras: [] });
  }
  return { rows, skipped };
}

/** The position stated on `line` after `match`: from a `{{Loc}}` template, or the first coordinates. */
function place(line, match) {
  const after = line.slice(line.indexOf(match) + match.length);
  const template = LOC_TEMPLATE.exec(line);
  if (template) {
    const loc = parseLoc(template[2]);
    if (loc) return { zone: template[1].trim(), loc };
  }
  const coords = COORDS.exec(after);
  return coords ? { loc: parseLoc(coords[0]) } : undefined;
}

/** The first page linked after `match` that isn't the item itself — on these lines, the zone. */
function linkAfter(line, match, item) {
  const after = line.slice(line.indexOf(match) + match.length);
  for (const m of after.matchAll(LINK)) if (m[1].trim().toLowerCase() !== item.toLowerCase()) return m[1].trim();
  return undefined;
}
