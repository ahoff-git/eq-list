/**
 * wikitext.mjs — the handful of primitives every hand-authored-guide parser in here needs.
 *
 * `race-unlocks-parse.mjs` proved this shape first (heading depth, section slicing, link display
 * text) for Alanna's Race Unlock Guide. It keeps its own copy rather than importing this file —
 * it's a working, tested black box and isn't part of whatever change brought this file in, so it's
 * left alone. This exists so the *next* hand-authored-guide parser doesn't grow a third copy.
 *
 * Nothing here knows what a heading or a section *means* — that's every caller's own business.
 */

/** A heading line at any level (`== X ==` through `====== X ======`), or `null`. */
const HEADING_RE = /^(={2,6})\s*(.+?)\s*\1\s*$/;

export function headingLine(line) {
  const m = HEADING_RE.exec(line);
  return m ? { level: m[1].length, title: m[2].trim() } : null;
}

/** Every heading of exactly `level` in `lines`, with the line index right after it. */
export function headingsAt(lines, level) {
  const out = [];
  lines.forEach((line, i) => {
    const h = headingLine(line);
    if (h && h.level === level) out.push({ title: h.title, bodyStart: i + 1 });
  });
  return out;
}

/** From `start` up to (not including) the next heading whose level is `<= level` — the standard
 *  wikitext sectioning rule: a heading *deeper* than `level` is a subsection, not a boundary. */
export function sectionLines(lines, start, level) {
  const out = [];
  for (let i = start; i < lines.length; i++) {
    const h = headingLine(lines[i]);
    if (h && h.level <= level) break;
    out.push(lines[i]);
  }
  return out;
}

/** `[[Title]]` / `[[Title|Display]]` → the display text a reader would see. */
export function linkDisplay(text) {
  return text.replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, title, display) => display || title);
}
