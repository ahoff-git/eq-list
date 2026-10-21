/**
 * Every place the app links an item or a spell has decided its level (ADR 0312, ADR 0316).
 *
 * The decision is a **type**: `ItemLink`'s `title` (and `NameList`'s `names`) take only a `ShownName`
 * (`src/shared/shown-name.ts`), which a name becomes by a level writer (`gradedTitle`,
 * `rankedSpellTitle`) or by a marker saying why it needs none (`heldAsNamed`, `wikiName`,
 * `dropTableName`, `notAnItem`). So the compiler checks every call site, and `level-paths.test.ts`
 * checks what each marker promises against real data.
 *
 * This file pins the two halves of that: a plain string cannot pass for a `ShownName` (the compile
 * of this very file fails if it could), and every `<ItemLink title={…}>` in the renderer is built by
 * one of the six — not cast around them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { heldAsNamed, type ShownName } from "../../src/shared/shown-name";

const REPO_ROOT = path.join(__dirname, "../../..");
const COMPONENTS = path.join(REPO_ROOT, "src", "app");
const DECIDERS = ["gradedTitle", "rankedSpellTitle", "heldAsNamed", "wikiName", "dropTableName", "notAnItem"];

test("a plain string is not a ShownName — the level has to be decided to link it", () => {
  // @ts-expect-error a bare string carries no decision about its level
  const bare: ShownName = "Dragoon Dirk";
  const decided: ShownName = heldAsNamed("Dragoon Dirk +2");
  assert.equal(`${bare} ${decided}`, "Dragoon Dirk Dragoon Dirk +2", "markers are the identity at runtime");
});

/** Every `.tsx` under `dir`. */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sources(full);
    return e.name.endsWith(".tsx") ? [full] : [];
  });
}

/** The `title={…}` expression of each `<ItemLink …>` in a file, braces balanced, across lines. */
function titlesIn(text: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf("<ItemLink", from);
    if (at === -1) return out;
    from = at + 1;
    const t = text.indexOf("title={", at);
    // This tag's own attribute only: a `title={` past the next `<ItemLink` belongs to that one.
    const next = text.indexOf("<ItemLink", from);
    if (t === -1 || (next !== -1 && t > next)) continue;
    let depth = 0;
    let i = t + "title=".length;
    const start = i + 1;
    for (; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) break;
    }
    out.push(text.slice(start, i).replace(/\s+/g, " ").trim());
  }
}

test("every ItemLink title is built by a level writer or a marker, never cast around them", () => {
  const sites: string[] = [];
  const undecided: string[] = [];
  for (const file of sources(COMPONENTS)) {
    const rel = path.relative(COMPONENTS, file).replace(/\\/g, "/");
    for (const title of titlesIn(fs.readFileSync(file, "utf8"))) {
      sites.push(`${rel}|${title}`);
      // `NameList`'s own `name` is already a ShownName — its callers decided (they're checked by type).
      const decided = DECIDERS.some((d) => title.startsWith(`${d}(`)) || (rel.endsWith("items/ItemLink.tsx") && title === "name");
      if (!decided || /\bas ShownName\b/.test(title)) undecided.push(`${rel}|${title}`);
    }
  }
  assert.ok(sites.length > 60, "the renderer's ItemLinks were found");
  assert.deepEqual(undecided, [], "build each title with gradedTitle / rankedSpellTitle, or mark why it needs no level");
});
