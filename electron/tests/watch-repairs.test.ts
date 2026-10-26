/**
 * Mending copies of a library rule that shipped wrong (`watch-repairs.ts`, run by `migrations.ts`):
 * an untouched copy is mended, an edited one is left as its owner made it, and mending twice is once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { repairTellRules } from "../../src/shared/alerts/watch-repairs";
import { TELL_LINE } from "../../src/shared/alerts/watch-library";
import { runMigrations } from "../migrations";
import type { CastWatch } from "../../src/shared/types";

/** The tell rule as the library shipped it before it read the tell's shape — the author's own copy. */
const oldTell = (over: Partial<CastWatch> = {}): CastWatch => ({
  id: "9a3b642c",
  enabled: true,
  spell: "tells you",
  onCast: false,
  onLine: true,
  message: "Tell",
  conditions: [
    { field: "line", op: "starts", text: "You tell", exclude: true },
    { field: "line", op: "contains", text: "auction", exclude: true },
  ],
  ...over,
});

test("an untouched copy of the old tell rule is mended, and keeps everything else of its own", () => {
  const { watches, repaired } = repairTellRules([oldTell({ message: "Psst" })]);
  assert.equal(repaired, 1);
  assert.equal(watches[0].id, "9a3b642c");
  assert.equal(watches[0].message, "Psst");
  assert.deepEqual(watches[0].conditions?.[0], { field: "line", op: "regex", text: TELL_LINE });
  assert.equal(repairTellRules(watches).repaired, 0, "a mended copy no longer looks broken");
});

test("an edited copy, or another rule entirely, is left as its owner made it", () => {
  const edited = oldTell({
    conditions: [...oldTell().conditions!, { field: "line", op: "contains", text: "Kitsch", exclude: true }],
  });
  const other = oldTell({ spell: "invites you" });
  const watches = [edited, other];
  const out = repairTellRules(watches);
  assert.equal(out.repaired, 0);
  assert.equal(out.watches, watches, "nothing to mend hands back the same list");
});

test("at startup, the settings file's copy is mended in place", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-watch-repair-"));
  const file = path.join(dir, "settings.json");
  fs.writeFileSync(file, JSON.stringify({ schema: 1, castAlerts: { enabled: true, watches: [oldTell()] } }));
  runMigrations(dir, undefined);
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(stored.castAlerts.watches[0].conditions[0].op, "regex");
  assert.equal(stored.castAlerts.enabled, true, "the rest of the alert settings are untouched");
});
