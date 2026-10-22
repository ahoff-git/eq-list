/**
 * Every item and zone a view names is a link: hover an item for its card, click either for its page.
 *
 * Two ways a name has slipped through as plain text, each caught by its own rule:
 *
 *   1. **A decided name that never reached a link.** `gradedTitle(…)` and the other level writers and
 *      markers (`shown-name.ts`) exist to feed `ItemLink`/`NameList`; one rendered straight into a
 *      cell is a name someone meant to link and didn't — best in slot's Replaces column was exactly
 *      this. Any such call outside an `<ItemLink …>` or `<NameList …>` tag fails.
 *   2. **An item or zone field rendered as JSX text** — `{row.item}`, `{h.row.zones[0]}`,
 *      `{timer.place}`. Link it (`ItemLink`, or `ZoneName`/`ZoneNames` for a zone), or say here why
 *      it stays plain.
 *
 * **To change what's allowed, edit `PLAIN` below** — one line per site, with the reason. A reason is
 * required because the exceptions are real (a native `<option>` can't hover, an alert banner is gone
 * in seconds) and the next person to look should know which kind each one is. A listed site that no
 * longer exists fails too, so the list can't rot.
 *
 * Static, over the renderer's source, like `item-link-levels.test.ts` beside it: the alternative is
 * mounting every view with data in every shape, and a name in a branch that data didn't reach would
 * still go unseen.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.join(__dirname, "../../..");
const COMPONENTS = path.join(REPO_ROOT, "src", "app");

/** The level writers and markers — every way a name becomes a `ShownName` (`shown-name.ts`). */
const DECIDERS = ["gradedTitle", "rankedSpellTitle", "heldAsNamed", "wikiName", "dropTableName", "notAnItem"];
/** Tags that take a decided name and link it. */
const LINKS = ["ItemLink", "NameList"];

/**
 * A JSX text child naming an item or a zone: `{x.item}`, `{x.zone}`, `{x.zones[0]}`, `{x.place}`,
 * optionally followed by a `??` / `||` fallback. Matched on the field, since that's what says what
 * the value is; a bare local (`{zone}`) is too often a label to judge by name.
 */
const NAMED_FIELD = /\.(item|zone|zones\[\d+\]|place)$/;

/** Sites that stay plain on purpose — `path under src/app|expression`: why. */
const PLAIN: Record<string, string> = {
  // Inside a control that already does something with the name, or can't host a hover at all.
  "components/items/BisWearTable.tsx|gradedTitle(c.title, c.grade)": "a native <option> in the slot's picker — options can't hold a link or show a hover",
  "components/items/SearchPanel.tsx|it.item": "already a link (opens what your log knows); these are items the wiki has no page for, so there's no card",
  "components/mob/HuntPanel.tsx|it.item": "the label inside its own ItemLink",
  "components/items/BisWearTable.tsx|gradedTitle(pick.item.title, pick.item.grade)": "matched against a socket claim's host name to find the row's stone — compared, never rendered",
  "components/items/BisHuntTable.tsx|gradedTitle(row.replaces.item.title, row.replaces.item.grade)": "the Replaces column's sort value (`valueGetter`), never rendered — its cell links it",
  "components/map/TravelPanel.tsx|place.zone": "inside the button that puts a skipped place back",
  "components/peers/MapUsers.tsx|u.zone": "the button that opens that zone on the map",
  "components/peers/PeersPanel.tsx|peer.zone": "the button that opens that zone on the map",
  "components/mob/SpawnPanel.tsx|camp.place": "inside a picker button that chooses the camp",
  "components/mob/SpawnPanel.tsx|timer.place": "a hand-added timer's place is free text (a boat, a lockout), not always a zone",
  // Gone in seconds, or chrome rather than a view.
  "components/alerts/CastAlerts.tsx|loot.item": "an alert banner — on screen for seconds, never hovered",
  "components/alerts/CastAlerts.tsx|celebration.item": "an alert banner — on screen for seconds, never hovered",
};

/** Every `.tsx` under `dir`. */
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sources(full);
    return e.name.endsWith(".tsx") ? [full] : [];
  });
}

const relOf = (file: string) => path.relative(COMPONENTS, file).split(path.sep).join("/");

/** Where each `<ItemLink …>` / `<NameList …>` opening tag runs, attributes and all, braces balanced. */
function linkSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const tag of LINKS) {
    for (let at = text.indexOf(`<${tag}`); at !== -1; at = text.indexOf(`<${tag}`, at + 1)) {
      let depth = 0;
      let i = at + tag.length + 1;
      for (; i < text.length; i++) {
        const c = text[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ">" && depth === 0) break;
      }
      spans.push([at, i]);
    }
  }
  return spans;
}

/** The whole `name(…)` call starting at `at`, parentheses balanced, whitespace folded. */
function callAt(text: string, at: number): string {
  let depth = 0;
  let i = text.indexOf("(", at);
  for (; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) break;
  }
  return text.slice(at, i + 1).replace(/\s+/g, " ");
}

/** Rule 1: decided names outside any link tag, as `file|call`. */
function unlinkedDecisions(file: string, text: string): string[] {
  const spans = linkSpans(text);
  const out: string[] = [];
  const call = new RegExp(String.raw`\b(${DECIDERS.join("|")})\(`, "g");
  for (const m of text.matchAll(call)) {
    const at = m.index!;
    const lineStart = text.lastIndexOf("\n", at) + 1;
    if (/^\s*(import|export|\*|\/\/)/.test(text.slice(lineStart, at))) continue; // an import or a comment
    if (spans.some(([from, to]) => at > from && at < to)) continue;
    out.push(`${relOf(file)}|${callAt(text, at)}`);
  }
  return out;
}

/** Rule 2: item or zone fields rendered as JSX text, as `file|expression`. */
function plainNames(file: string, text: string): string[] {
  const out: string[] = [];
  // A `{…}` that isn't an attribute value (`=`) or a template hole (`$`).
  for (const m of text.matchAll(/(?<![=$])\{\s*([\w.?![\]]+)\s*(?:(?:\?\?|\|\|)[^{}]*)?\}/g)) {
    const expr = m[1].replace(/[?!]/g, "");
    if (NAMED_FIELD.test(expr)) out.push(`${relOf(file)}|${expr}`);
  }
  return out;
}

const scan = () =>
  sources(COMPONENTS).flatMap((file) => {
    const text = fs.readFileSync(file, "utf8");
    return [...unlinkedDecisions(file, text), ...plainNames(file, text)];
  });

test("every item and zone a view names is a link, or is listed with the reason it isn't", () => {
  const found = [...new Set(scan())];
  const unlisted = found.filter((site) => !(site in PLAIN));
  assert.deepEqual(unlisted, [], "link these (ItemLink, ZoneName / ZoneNames), or add them to PLAIN with the reason they stay plain");
});

test("every site listed as plain still exists", () => {
  const found = new Set(scan());
  const stale = Object.keys(PLAIN).filter((site) => !found.has(site));
  assert.deepEqual(stale, [], "these are gone or now linked — remove them from PLAIN");
});
