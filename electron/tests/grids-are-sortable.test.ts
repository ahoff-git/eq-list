/**
 * Every grid sorts by every column ([ADR 0327](../../specs/decisions/0327-every-grid-sorts-by-every-column.md),
 * extending [ADR 0230](../../specs/decisions/0230-every-table-gets-a-column-menu.md)).
 *
 * Three ways a table has ended up unsortable, each failed here:
 *
 *   1. **A plain `<table>`** — it has no header to click. Build it as a `DataGrid` (ADR 0230;
 *      `dataGridDefaults.ts` has the look, `BisHuntTable` is a short worked example).
 *   2. **`sortable: false` on a data column.** A searched catalogue sorts *before* it truncates
 *      (`sortingMode="server"`, ADR 0230), so a column needs a sort key upstream — add one rather than
 *      switching the column off. An actions column of buttons spreads `ACTION_COL` and isn't data.
 *   3. **`disableColumnSorting`** on a grid.
 *
 * **To allow an exception, add it to `ALLOWED` with the reason** — one line, so the policy reads in one
 * place. A listed site that no longer exists fails too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const COMPONENTS = path.join(__dirname, "../../..", "src", "app");

/** `path under src/app|table` or `path under src/app|field` → why it doesn't sort. */
const ALLOWED: Record<string, string> = {};

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sources(full);
    return e.name.endsWith(".tsx") ? [full] : [];
  });
}

const relOf = (file: string) => path.relative(COMPONENTS, file).split(path.sep).join("/");

/** Every unsortable site in a file: `file|table`, `file|disableColumnSorting`, or `file|<field>`. */
function unsortable(file: string, text: string): string[] {
  const rel = relOf(file);
  const out: string[] = [];
  if (/<table\b/.test(text)) out.push(`${rel}|table`);
  if (/\bdisableColumnSorting\b/.test(text)) out.push(`${rel}|disableColumnSorting`);
  for (const m of text.matchAll(/\bsortable:\s*false\b/g)) {
    // The column it belongs to: the nearest `field:` before it.
    const before = text.slice(0, m.index);
    const field = [...before.matchAll(/\bfield:\s*[`"']([^`"']+)[`"']/g)].pop()?.[1] ?? "?";
    out.push(`${rel}|${field}`);
  }
  return out;
}

const scan = () => [...new Set(sources(COMPONENTS).flatMap((f) => unsortable(f, fs.readFileSync(f, "utf8"))))];

test("every grid sorts by every column, or the exception is listed with its reason", () => {
  assert.deepEqual(
    scan().filter((s) => !(s in ALLOWED)),
    [],
    "make these sortable (a DataGrid, and a sort key for a searched catalogue's column), or add them to ALLOWED with the reason",
  );
});

test("every allowed exception still exists", () => {
  const found = new Set(scan());
  assert.deepEqual(Object.keys(ALLOWED).filter((s) => !found.has(s)), [], "gone — remove from ALLOWED");
});
