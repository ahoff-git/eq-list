/**
 * pickup-table-parse.mjs — read "go and pick these up" tables off an eqlwiki quest page.
 *
 * Epic quests are full of steps whose turn-ins lie on the ground somewhere — the wizard epic's ten
 * Rods, for one — and the wiki writes every such step the same way: a `wikitable` with a **Zone**
 * column, a **Location** column, and one column that names each thing (`Rod`, `Fragment`, …). This
 * reads any table of that shape, so the next epic step is a line in `fetch-quest-pickups.mjs`'s
 * config rather than a new parser.
 *
 * Pure: wikitext in, rows out. Columns are found **by their header's words**, never by position —
 * the Rod table puts the label first and an "Enduring Breath Recommended" column last, and the next
 * page will order them its own way. Any column that isn't the label, zone, location or description
 * is kept as an `extra` ("Enduring Breath Recommended: Yes"), since a page only adds a column when
 * it matters to doing the step.
 */
import { linkDisplay } from "./wikitext.mjs";

/** A cell's leading `width="60" style="…" |` — attributes, not content. Only strips a prefix that is
 *  *nothing but* attributes, so a `|` inside a `[[link|text]]` is never mistaken for one. */
const CELL_ATTRS = /^\s*(?:[\w-]+\s*=\s*"[^"]*"\s*)+\|(?!\|)/;

/** Header words that name the zone / location / description columns. */
const ZONE_HEADER = /^zone$/i;
const LOC_HEADER = /^(?:loc|location|coords?|coordinates)$/i;
const NOTE_HEADER = /^(?:description|notes?|details?)$/i;

/**
 * `{{loc|Zone|-1159, 2329}}` → `-1159, 2329`. eqlwiki writes every coordinate through this template
 * (it renders as a map link), so it is the one template whose words are content, not decoration.
 */
const LOC_TEMPLATE = /\{\{\s*loc\s*\|[^|}]*\|([^}]*)\}\}/gi;

/** Wiki markup → the text a reader sees: links, bold/italic, templates, tags, entities. */
export function plainText(text) {
  return linkDisplay(text.replace(LOC_TEMPLATE, "$1"))
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/'{2,}/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * `"-1159, 2329"` → `{ y: -1159, x: 2329 }`, in the order `/loc` prints them (y first), with a
 * third number as `z`. Tolerates the page's own noise — a leading `+`, a trailing comma.
 */
export function parseLoc(text) {
  const nums = (plainText(text).match(/[-+]?\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length < 2) return undefined;
  const [y, x, z] = nums;
  return z === undefined ? { y, x } : { y, x, z };
}

/** One table's rows as arrays of raw cell text, header row included. */
function tableRows(table) {
  const rows = [];
  let cells = null;
  for (const raw of table.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("{|") || line.startsWith("|}") || line.startsWith("|+")) continue;
    if (line.startsWith("|-")) {
      if (cells?.length) rows.push(cells);
      cells = [];
      continue;
    }
    if (line.startsWith("!") || line.startsWith("|")) {
      cells ??= [];
      // `!! ` / `|| ` put several cells on one line.
      for (const part of line.slice(1).split(/!!|\|\|/)) cells.push(part.replace(CELL_ATTRS, "").trim());
    } else if (cells?.length && line) {
      // A cell that runs onto the next line.
      cells[cells.length - 1] += ` ${line}`;
    }
  }
  if (cells?.length) rows.push(cells);
  return rows;
}

/** Every `{| … |}` table in the page, as raw text. Tables don't nest on these pages. */
function tables(wikitext) {
  return [...wikitext.matchAll(/\{\|[\s\S]*?\n\|\}/g)].map((m) => m[0]);
}

/**
 * Every row of every table that has a column headed `label`, a Zone column and a Location column.
 *
 * Returns `{ label, zone, loc, note, extras }` per row; a row whose location has no two numbers in
 * it is skipped and reported in `skipped`, so the generator can say so rather than ship a pin that
 * lands at 0, 0.
 */
export function parsePickupTables(wikitext, { label }) {
  const rows = [];
  const skipped = [];
  for (const table of tables(wikitext)) {
    const [header, ...body] = tableRows(table);
    if (!header) continue;
    const names = header.map(plainText);
    const col = (re) => names.findIndex((n) => re.test(n));
    const labelCol = names.findIndex((n) => n.toLowerCase() === label.toLowerCase());
    const zoneCol = col(ZONE_HEADER);
    const locCol = col(LOC_HEADER);
    if (labelCol < 0 || zoneCol < 0 || locCol < 0) continue;
    const noteCol = col(NOTE_HEADER);
    const known = new Set([labelCol, zoneCol, locCol, noteCol]);
    for (const cells of body) {
      const name = plainText(cells[labelCol] ?? "");
      const loc = parseLoc(cells[locCol] ?? "");
      if (!name) continue;
      if (!loc) {
        skipped.push(name);
        continue;
      }
      const extras = names
        .map((n, i) => (known.has(i) || !plainText(cells[i] ?? "") ? "" : `${n}: ${plainText(cells[i])}`))
        .filter(Boolean);
      rows.push({
        label: name,
        zone: plainText(cells[zoneCol] ?? ""),
        loc,
        note: noteCol >= 0 ? plainText(cells[noteCol] ?? "") : "",
        extras,
      });
    }
  }
  return { rows, skipped };
}
