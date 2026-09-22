/**
 * stances-invocations-parse.mjs — turning "Stances & Invocations"'s wikitext into structured data.
 *
 * The page states each stance/invocation exactly once, in an ordinary three-column wikitable
 * (`Name | Description | Classes`) under `== Stances ==` / `== Invocations ==` — regular enough to
 * read by line, the same discipline `race-unlocks-parse.mjs` holds a hand-authored guide to. Section
 * boundaries and link-display text reuse `wikitext.mjs`'s primitives rather than growing their own
 * copy, the same way `buff-lines-parse.mjs` already does.
 *
 * The page *also* carries a second, derived "by class" matrix table under each section, restating
 * the same facts as a grid. That table is **not read here**: it's redundant with the row above it —
 * checked against a real fetch, the Invocations matrix spells a row "Empowering" where the row table
 * above it spells the same ability "Empower", so the two have already drifted once — and the row
 * table alone already states every class each ability names, so reading it is both simpler and the
 * single source of truth this page actually has. (It's also *why* the section boundary below only
 * needs "up to the next `==` heading", never a named end heading: the row table always closes long
 * before the derived matrix starts, so `firstTable` below never reaches it.)
 */
import { headingsAt, linkDisplay, sectionLines } from "./wikitext.mjs";

/** The wiki's own three-letter class codes, wherever a `Classes` cell names one — checked against
 *  this rather than against the app's `class-names.ts` so this script stays a standalone Node
 *  script with no build step of its own (the translation to the app's full class names happens once,
 *  in `src/shared/stances-invocations.ts`, which can import that module freely). */
const KNOWN_CODES = new Set([
  "BER", "BRD", "BST", "CLR", "DRU", "ENC", "MAG", "MNK",
  "NEC", "PAL", "RNG", "ROG", "SHD", "SHM", "WAR", "WIZ",
]);

/** A top-level (`==`) section's body, by its own heading title. */
function sectionByTitle(lines, title) {
  const heading = headingsAt(lines, 2).find((h) => h.title === title);
  if (!heading) throw new Error(`Stances & Invocations: no "== ${title} ==" heading — has the page been restructured?`);
  return sectionLines(lines, heading.bodyStart, 2);
}

/** The first `{| ... |}` block in a run of lines, depth-tracked in case anything ever nests inside
 *  it (nothing does today, but a wikitable can). */
function firstTable(lines, context) {
  const start = lines.findIndex((l) => l.trimStart().startsWith("{|"));
  if (start === -1) throw new Error(`${context}: no wikitable found`);
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("{|")) depth++;
    else if (t.startsWith("|}")) {
      depth--;
      if (depth === 0) return lines.slice(start + 1, i);
    }
  }
  throw new Error(`${context}: table never closes`);
}

/**
 * A wikitable's header cells and its data rows, read as *lines* rather than by a single regex — a
 * cell's content runs from the line that opens it (`| ...`) to whatever line opens the next one,
 * `|-` or `|}`, and a description spans several of those with blank lines between its paragraphs
 * kept intact (`join("\n")` below), which one regex per row can't do without either flattening the
 * paragraphs or missing the ones that have them.
 */
function parseTable(tableLines, context) {
  const headers = [];
  const rows = [];
  let cells = [];
  let cell = null;
  const closeCell = () => {
    if (cell !== null) cells.push(cell.join("\n").trim());
    cell = null;
  };
  const closeRow = () => {
    closeCell();
    if (cells.length) rows.push(cells);
    cells = [];
  };
  let inHeader = true;
  for (const line of tableLines) {
    const t = line.trim();
    if (t.startsWith("|+")) continue; // caption
    if (inHeader && t.startsWith("!")) {
      headers.push(t.slice(1).trim());
      continue;
    }
    inHeader = false;
    if (t.startsWith("|-")) {
      closeRow();
      continue;
    }
    if (t.startsWith("|")) {
      closeCell();
      cell = [t.slice(1).trim()];
      continue;
    }
    if (cell !== null) cell.push(line);
  }
  closeRow();
  for (const row of rows) {
    if (row.length !== 3) throw new Error(`${context}: a row has ${row.length} cell(s), expected 3 (starts "${row[0] ?? ""}")`);
  }
  return { headers, rows };
}

/** `<section begin="X" />…<section end="X" />` around a description → the text inside, with any
 *  `[[Title]]`/`[[Title|Display]]` link resolved to its display text (`linkDisplay`). Plain prose
 *  after that, ready to show. */
function cleanDescription(raw, name, context) {
  const text = linkDisplay(
    (raw ?? "")
      .replace(/<section\s+begin="[^"]*"\s*\/>/gi, "")
      .replace(/<section\s+end="[^"]*"\s*\/>/gi, ""),
  ).trim();
  if (!text) throw new Error(`${context}/${name}: empty description`);
  return text;
}

/** `BER&nbsp;BRD&nbsp;BST<br>MNK&nbsp;PAL&nbsp;RNG` → `["BER","BRD","BST","MNK","PAL","RNG"]`. */
function parseClasses(raw, name, context) {
  const codes = (raw ?? "")
    .split(/(?:<br\s*\/?>|&nbsp;)+/gi)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!codes.length) throw new Error(`${context}/${name}: no classes listed`);
  for (const code of codes) {
    if (!KNOWN_CODES.has(code)) throw new Error(`${context}/${name}: unrecognized class code "${code}"`);
  }
  return codes;
}

/** One `== Heading ==` section's ability table → `{ name, description, classes }[]`. */
function parseAbilityTable(lines, { heading, nameHeader }) {
  const body = sectionByTitle(lines, heading);
  const tableLines = firstTable(body, heading);
  const { headers, rows } = parseTable(tableLines, heading);
  const expected = [nameHeader, "Description", "Classes"];
  if (headers.length !== 3 || headers.some((h, i) => h !== expected[i])) {
    throw new Error(`${heading}: unexpected table headers [${headers.join(", ")}], expected [${expected.join(", ")}] — has the page been restructured?`);
  }
  return rows.map(([name, descriptionRaw, classesRaw]) => {
    if (!name) throw new Error(`${heading}: a row with no name`);
    return {
      name,
      description: cleanDescription(descriptionRaw, name, heading),
      classes: parseClasses(classesRaw, name, heading),
    };
  });
}

/** The whole page → its two ability tables. Throws, by name, on anything that doesn't fit the shape
 *  above — a bad regen must be impossible to commit without someone reading the error. */
export function parseStancesInvocations(wikitext) {
  const lines = (wikitext ?? "").split(/\r?\n/);
  const stances = parseAbilityTable(lines, { heading: "Stances", nameHeader: "Stance" });
  const invocations = parseAbilityTable(lines, { heading: "Invocations", nameHeader: "Invocation" });
  return { stances, invocations };
}
