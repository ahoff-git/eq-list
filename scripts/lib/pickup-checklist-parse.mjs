/**
 * pickup-checklist-parse.mjs — read "go and pick these up" steps that a quest page writes as checklist
 * bullets rather than a table.
 *
 * Some pages skip the Zone / Location table (`pickup-table-parse.mjs`) and list each piece as a nested
 * bullet under the step that asks for them — the enchanter's Coin of Tash writes its ten coins as
 *
 *   ** Azia - '''[[Ak'anon]]''' - Near great wheel (not in water) (1990, -260, -125). It's on …
 *
 * i.e. `Label - Zone - directions`, with the spot as the **last** parenthesised group holding two or
 * more numbers (directions may hold other parentheses, and other numbers in a group of their own).
 *
 * Pure: wikitext in, rows out, in the same `{ label, zone, loc, note, extras }` shape the table
 * parser returns, so the generator treats both alike.
 */
import { parseLoc, plainText } from "./pickup-table-parse.mjs";

/** `** Label - Zone - directions` — a nested bullet in the page's three-part shape. */
const BULLET = /^\*{2,}\s*([^-\n]+?)\s+-\s+(.+?)\s+-\s+(.+)$/;

/** Every `( … )` group holding two or more numbers — a candidate `/loc`. */
const LOC_GROUP = /\(\s*[-+]?\d+(?:\.\d+)?\s*,[^()]*\)/g;

/**
 * Every nested `Label - Zone - directions (y, x[, z])` bullet on the page.
 *
 * A bullet of that shape with no coordinates is skipped and reported in `skipped`, as the table
 * parser does, rather than shipped as a pin at 0, 0.
 */
export function parsePickupChecklist(wikitext) {
  const rows = [];
  const skipped = [];
  for (const raw of wikitext.split("\n")) {
    const m = BULLET.exec(raw.trim());
    if (!m) continue;
    const [, labelText, zoneText, rest] = m;
    const label = plainText(labelText);
    const locText = rest.match(LOC_GROUP)?.at(-1);
    const loc = locText && parseLoc(locText);
    if (!loc) {
      skipped.push(label);
      continue;
    }
    const note = plainText(rest.replace(locText, ""))
      .replace(/\s+([.,;])/g, "$1")
      .replace(/\.{2,}/g, ".")
      .replace(/^[.,;]\s*/, "");
    rows.push({ label, zone: plainText(zoneText), loc, note, extras: [] });
  }
  return { rows, skipped };
}
