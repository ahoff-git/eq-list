/**
 * aa-list-parse.mjs — turning eqlwiki's "Alternate Advancement" page into structured data.
 *
 * Like Alanna's Race Unlock Guide (`race-unlocks-parse.mjs`, ADR 0222) and "Stances & Invocations"
 * (`stances-invocations-parse.mjs`, ADR 0262), this is a **single hand-authored page**, not a wiki
 * template `electron/wiki/parse.ts` already knows how to read — there is no signature container class
 * to key off, only this one page's own heading structure and wikitables. Checked against the page's
 * real wikitext (fetched directly via the API, not guessed from the rendered page) before writing a
 * single regex here, the same discipline every parser in this family holds itself to. Section
 * boundaries and link-display text reuse `wikitext.mjs`'s primitives rather than growing a third copy
 * of them, the same way `stances-invocations-parse.mjs`/`buff-lines-parse.mjs` already do.
 *
 * **This page is considerably more regular than either sibling**, which is *why* it's worth saying so
 * rather than assuming it: 19 real `{| class="wikitable sortable"` tables, every one of them with the
 * identical header row `Name | Ranks | Cost | Description`, and (unlike "Stances & Invocations") no
 * second, derived table to drift out of sync with the first. The only two irregularities measured
 * against the live page: Special AAs carries an extra decorative `! colspan="4" | Special AAs` row
 * above its real header (skipped explicitly below), and a handful of rows write their four cells one
 * per line (`|Full Potential` / `|1` / `|0` / `|...`) instead of the usual single `| A || B || C || D`
 * line, and one row's Description wraps onto a second physical source line with no `|`/`||` marker at
 * all (Innate Camouflage) — ordinary MediaWiki paragraph continuation, not a new cell. The row reader
 * below handles all three shapes with one rule: a line starting with `|` opens one or more new cells
 * (split on `||`); any other non-blank line extends whatever cell was opened last.
 *
 * Throws with the specific section/row that doesn't fit this shape, rather than silently emitting a
 * short list or a garbled description — see `fetch-aa-list.mjs`'s header for why that matters here:
 * nothing else re-checks this data against the live game, so a bad regen has to be impossible to
 * commit by accident.
 */
import { headingsAt, linkDisplay, sectionLines } from "./wikitext.mjs";

/** `linkDisplay`'s output, further folded to plain prose: `'''bold'''`/`''italic''` markers dropped,
 *  `<br>` folded to a space, whitespace collapsed. What search matches against, so it has to read as
 *  plain prose, not wikitext. */
function plainText(text) {
  return linkDisplay(text)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/'{2,3}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const REQUIRED_HEADER = ["Name", "Ranks", "Cost", "Description"];

/** The one `{| ... wikitable ... |}` block in `lines`, as its own line array (open and close lines
 *  included), or `undefined` if this section carries none. */
function findTable(lines) {
  const start = lines.findIndex((l) => /^\{\|/.test(l) && /wikitable/.test(l));
  if (start === -1) return undefined;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\|\}/.test(lines[i])) return lines.slice(start, i + 1);
  }
  throw new Error(`a wikitable never closes with "|}"`);
}

/**
 * One section's table → its rows, each `{ name, ranks, cost, description }`. Throws, naming
 * `label` (the section/subsection title), on anything that doesn't fit the shape described above.
 */
function parseTable(tableLines, label) {
  const body = tableLines.slice(1, -1); // drop the "{|...}" open and "|}" close lines
  // Special AAs' decorative "! colspan=4 | Special AAs" row sits above the real header; skip any
  // header-shaped line that isn't the plain column list.
  const headerIdx = body.findIndex((l) => l.startsWith("!") && !/colspan/i.test(l));
  if (headerIdx === -1) throw new Error(`${label}: no header row found`);
  const header = body[headerIdx].replace(/^!\s*/, "").split("!!").map((c) => c.trim());
  if (header.join("|") !== REQUIRED_HEADER.join("|")) {
    throw new Error(`${label}: header row is [${header.join(", ")}], expected [${REQUIRED_HEADER.join(", ")}]`);
  }

  // Row chunks, split on "|-" separators — each chunk may itself be one physical line (the common
  // case) or several (a one-cell-per-line row, or a cell whose prose wraps onto the next source line).
  const chunks = body
    .slice(headerIdx + 1)
    .join("\n")
    .split(/\n?\|-\s*\n?/);

  const rows = [];
  for (const chunk of chunks) {
    const chunkLines = chunk.split("\n").filter((l) => l.trim().length > 0);
    if (!chunkLines.length) continue;
    const cells = [];
    for (const line of chunkLines) {
      if (line.startsWith("|")) {
        for (const part of line.slice(1).split("||")) cells.push(part.trim());
      } else if (cells.length) {
        // Paragraph continuation (no "|"/"||" of its own) — folds into the cell just opened.
        cells[cells.length - 1] = `${cells[cells.length - 1]} ${line.trim()}`.trim();
      } else {
        throw new Error(`${label}: a row starts with a continuation line, not a cell: "${line}"`);
      }
    }
    if (cells.length !== 4) {
      throw new Error(`${label}: row has ${cells.length} cell(s), expected 4: ${JSON.stringify(cells)}`);
    }
    const [name, ranks, cost, description] = cells.map(plainText);
    if (!name || !description) {
      throw new Error(`${label}: a row has an empty name or description: ${JSON.stringify(cells)}`);
    }
    rows.push({ name, ranks, cost, description });
  }
  if (!rows.length) throw new Error(`${label}: table has 0 rows`);
  return rows;
}

/** A top-level `== <Title> AAs ==` section's one table, tagged with its category. Throws by name if
 *  the section or its table is missing. */
function parseFlatSection(lines, title, category) {
  const heading = headingsAt(lines, 2).find((h) => h.title === title);
  if (!heading) throw new Error(`no "${title}" section found`);
  const top = headingsAt(lines, 2);
  const idx = top.findIndex((h) => h.title === title);
  const sectionEnd = top[idx + 1] ? top[idx + 1].bodyStart - 1 : lines.length;
  const section = lines.slice(heading.bodyStart, sectionEnd);
  const table = findTable(section);
  if (!table) throw new Error(`"${title}": no wikitable found in its section`);
  return parseTable(table, title).map((r) => ({ ...r, category }));
}

/**
 * "Class AAs"'s sixteen `=== <Class> Class AAs ===` subsections, one table each. `classNames` (the
 * app's own `SPELL_CLASSES`) is passed in rather than imported, so this module stays pure text-in/
 * data-out — a subheading that doesn't normalize onto one of them is exactly the kind of drift this
 * has to fail loudly on, since the generated `class` field is typed against that same list.
 */
function parseClassSections(lines, classNames) {
  const top = headingsAt(lines, 2);
  const idx = top.findIndex((h) => h.title === "Class AAs");
  if (idx === -1) throw new Error(`no "Class AAs" section found`);
  const sectionEnd = top[idx + 1] ? top[idx + 1].bodyStart - 1 : lines.length;
  const section = lines.slice(top[idx].bodyStart, sectionEnd);

  const subs = headingsAt(section, 3);
  if (!subs.length) throw new Error(`"Class AAs": no per-class subsections found`);

  const out = [];
  const seen = new Set();
  for (const [i, sub] of subs.entries()) {
    const m = /^(.+?)\s+Class AAs$/.exec(sub.title);
    if (!m) throw new Error(`"Class AAs": subsection "${sub.title}" isn't titled "<Class> Class AAs"`);
    const className = m[1].replace(/\s+/g, "");
    if (!classNames.includes(className)) {
      throw new Error(`"${sub.title}": normalizes to "${className}", which isn't one of SPELL_CLASSES`);
    }
    const end = subs[i + 1] ? subs[i + 1].bodyStart - 1 : section.length;
    const table = findTable(section.slice(sub.bodyStart, end));
    if (!table) throw new Error(`"${sub.title}": no wikitable found in its subsection`);
    out.push(...parseTable(table, sub.title).map((r) => ({ ...r, category: "class", class: className })));
    seen.add(className);
  }

  const missing = classNames.filter((c) => !seen.has(c));
  if (missing.length) throw new Error(`"Class AAs": no subsection found for: ${missing.join(", ")}`);
  return out;
}

/**
 * The whole page → one entry per AA, in the page's own order (General, Archetype, each class in the
 * page's own heading order, Special). Throws on the first section/row whose shape doesn't fit — see
 * the module header for why this doesn't fail softer.
 */
export function parseAlternateAdvancement(wikitext, classNames) {
  const lines = (wikitext ?? "").split(/\r?\n/);
  return [
    ...parseFlatSection(lines, "General AAs", "general"),
    ...parseFlatSection(lines, "Archetype AAs", "archetype"),
    ...parseClassSections(lines, classNames),
    ...parseFlatSection(lines, "Special AAs", "special"),
  ];
}
