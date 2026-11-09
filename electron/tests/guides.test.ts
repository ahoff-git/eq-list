/**
 * The real how-to guides, held to the rules (ADR 0373): every one is about a tab that exists, names only hotkeys
 * the app registers, and spells none out by hand. Not a black box of its own — checks on the data in
 * `src/shared/help/guides.ts` against the nav (`areas.ts`) and the hotkey constants. A failure here is a guide
 * that has outlived the thing it describes: fix the guide, not the test. Re-run when guides, the nav or the
 * hotkeys change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AREAS } from "../../src/shared/chrome/areas";
import { guideProblems } from "../../src/shared/help/guide";
import { GUIDES } from "../../src/shared/help/guides";

const NAV_SECTIONS = new Set(AREAS.flatMap((a) => a.sections));

test("every guide is well formed, about a real tab, and names no hotkey that doesn't exist", () => {
  assert.deepEqual(guideProblems(GUIDES, NAV_SECTIONS), []);
});

test("there are guides, and the help sections are in the nav they are checked against", () => {
  assert.ok(GUIDES.length > 0);
  assert.ok(NAV_SECTIONS.has("help") && NAV_SECTIONS.has("updates"));
});

// ── the words a guide points at ──

const REPO_ROOT = path.join(__dirname, "../../..");

/**
 * Everything a player's screen text can come from: the app's own source, but not tests, not generated data (which names
 * thousands of things and would "find" any label), and not the guides, notes and history themselves — a label has to be
 * somewhere other than the sentence that mentions it.
 */
function screenSource(): string {
  const parts: string[] = [];
  const skipDirs = new Set(["node_modules", ".next", "tests", "releases", "help"]);
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.generated\./.test(entry.name)) {
        parts.push(fs.readFileSync(path.join(dir, entry.name), "utf8"));
      }
    }
  };
  walk(path.join(REPO_ROOT, "src"));
  walk(path.join(REPO_ROOT, "electron"));
  return parts.join("\n");
}

/** Whether `label` is spelled somewhere in `source` — as JSX text, a string, or an entity-escaped one. A count ("unseen in N") is matched by what comes before it. */
function appearsIn(source: string, label: string): boolean {
  const plain = label.replace(/ N$/, "");
  return [plain, plain.replace(/'/g, "&apos;"), plain.replace(/&/g, "&amp;")].some((spelling) => source.includes(spelling));
}

/** The labels a guide puts in bold — what it tells the player to look for on screen or type. */
function boldLabels(guide: { steps: readonly string[]; tips?: readonly string[] }): string[] {
  return [...guide.steps, ...(guide.tips ?? [])].flatMap((line) => [...line.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]));
}

test("every label a guide puts in bold is spelled somewhere on our screens — a renamed button can't leave a guide pointing at nothing", () => {
  const source = screenSource();
  const missing = GUIDES.flatMap((g) => boldLabels(g).filter((label) => !appearsIn(source, label)).map((label) => `${g.id}: ${label}`));
  assert.deepEqual(missing, [], "rename it in the guide too — or, if it is a word from the game rather than from EQ List, say it without bold");
});

test("…and the check can fail: a label nobody wrote is not found, and an escaped apostrophe still is", () => {
  assert.equal(appearsIn("<button>Read my stats</button>", "Nothing at all"), false);
  assert.equal(appearsIn("<button>Nothing&apos;s changed</button>", "Nothing's changed"), true);
  assert.equal(appearsIn("unseen in {truth.kills}", "unseen in N"), true);
  assert.ok(boldLabels({ steps: ["Press **A** then **B**."], tips: ["And **C**."] }).join() === "A,B,C");
});
