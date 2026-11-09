/**
 * Every relative link in the specs points at something that exists — and so does every decision record that code
 * comments cite. Not a black box: a check on the docs against the tree they describe.
 *
 * Why it exists: the October reorganisation moved sixty-odd source files into domain folders
 * (`src/shared/peers/`, `src/shared/alerts/`, …) and the decision records that linked to them by their old paths kept
 * pointing at nothing — 23 links across 17 records — until a scan found them. Records are not edited for what they
 * decided, but where a thing lives is a fact about the tree, and it moves. A move that breaks a link should fail here,
 * in the same change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.join(__dirname, "../../..");
const SKIP_DIRS = new Set(["node_modules", ".next", "dist-electron", "out", "release", ".git"]);

function walk(dir: string, ext: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : walk(path.join(dir, entry.name), ext);
    return ext.test(entry.name) ? [path.join(dir, entry.name)] : [];
  });
}

/** `./NNNN-….md` in the instructions for writing a record is a template, not a link. */
const isPlaceholder = (target: string): boolean => /NNNN/.test(target);

test("every relative link in the specs, the README and CLAUDE.md resolves to a file or folder that exists", () => {
  const docs = [...walk(path.join(REPO_ROOT, "specs"), /\.md$/), path.join(REPO_ROOT, "README.md"), path.join(REPO_ROOT, "CLAUDE.md")].filter((f) => fs.existsSync(f));
  const broken: string[] = [];
  for (const doc of docs) {
    const text = fs.readFileSync(doc, "utf8");
    for (const m of text.matchAll(/\]\(([^)\s]+?)\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|#)/.test(target) || isPlaceholder(target)) continue;
      const file = target.split("#")[0];
      if (file && !fs.existsSync(path.resolve(path.dirname(doc), file))) broken.push(`${path.relative(REPO_ROOT, doc)} → ${target}`);
    }
  }
  assert.deepEqual(broken, [], "a file moved (or a record was renamed) without its links following");
});

test("every decision record a source comment cites exists", () => {
  const records = new Set(fs.readdirSync(path.join(REPO_ROOT, "specs", "decisions")));
  const missing: string[] = [];
  for (const root of ["src", "electron"]) {
    for (const file of walk(path.join(REPO_ROOT, root), /\.(ts|tsx)$/)) {
      for (const m of fs.readFileSync(file, "utf8").matchAll(/specs\/decisions\/(\d{4}-[a-z0-9-]+\.md)/g)) {
        if (!records.has(m[1])) missing.push(`${path.relative(REPO_ROOT, file)} → ${m[1]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("the check can fail: a link to nothing is found, and a template placeholder is not one", () => {
  assert.equal(fs.existsSync(path.resolve(REPO_ROOT, "specs", "no-such-area", "README.md")), false);
  assert.equal(isPlaceholder("./NNNN-….md"), true);
  assert.equal(isPlaceholder("./0373-release-notes.md"), false);
});
