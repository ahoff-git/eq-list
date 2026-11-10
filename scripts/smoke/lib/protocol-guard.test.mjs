import { test } from "node:test";
import assert from "node:assert/strict";

import { planRestore } from "./protocol-guard.mjs";

const installed = '"C:\\Users\\Lucy\\AppData\\Local\\Programs\\eq-list\\EQ List.exe" "%1"';
const dev = '"G:\\Code\\eq-list\\node_modules\\electron\\dist\\electron.exe" "%1"';

test("a handler the run left alone is left alone", () => {
  assert.equal(planRestore(installed, installed), "unchanged");
  assert.equal(planRestore(null, null), "unchanged");
});

test("a handler a dev launch replaced is put back", () => {
  assert.equal(planRestore(installed, dev), "restore");
});

test("a handler the run created where there was none is removed again", () => {
  assert.equal(planRestore(null, dev), "remove");
});
