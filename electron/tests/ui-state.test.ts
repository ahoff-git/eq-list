/**
 * ui-state.ts — the panel settings mirror kept in `userData`, beside `localStorage`'s own copy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createUiState } from "../ui-state";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-ui-state-"));
}

test("a value written is the value read back", () => {
  const state = createUiState(tmpDir());
  state.set("zone", "Blackburrow");
  assert.equal(state.get("zone"), "Blackburrow");
  assert.deepEqual(state.all(), { zone: "Blackburrow" });
});

test("a value survives a restart", () => {
  const dir = tmpDir();
  const first = createUiState(dir);
  first.set("weights", { ac: 3, hp: 1 });
  first.flush();

  const second = createUiState(dir);
  assert.deepEqual(second.get("weights"), { ac: 3, hp: 1 });
});

test("setting undefined or null forgets the key", () => {
  const state = createUiState(tmpDir());
  state.set("zone", "Blackburrow");
  state.set("zone", undefined);
  assert.equal(state.get("zone"), undefined);
  assert.deepEqual(state.all(), {});

  state.set("grouping", "item");
  state.set("grouping", null);
  assert.deepEqual(state.all(), {});
});

test("writing the exact same value back leaves the stored copy and its identity untouched", () => {
  const state = createUiState(tmpDir());
  state.set("weights", { ac: 3, hp: 1 });
  const first = state.get("weights");
  state.set("weights", { ac: 3, hp: 1 });
  assert.deepEqual(state.get("weights"), { ac: 3, hp: 1 });
  // A no-op `set` must not even re-parse/replace the stored object — same reference back.
  assert.equal(state.get("weights"), first);
});

test("a genuinely new value overwrites and survives a restart", () => {
  const dir = tmpDir();
  const state = createUiState(dir);
  state.set("zone", "Blackburrow");
  state.set("zone", "Befallen");
  assert.equal(state.get("zone"), "Befallen");
  state.flush();

  const second = createUiState(dir);
  assert.equal(second.get("zone"), "Befallen", "the change reached disk");
});

test("a key nothing has stored is undefined, not present in all()", () => {
  const state = createUiState(tmpDir());
  assert.equal(state.get("never-set"), undefined);
  assert.deepEqual(state.all(), {});
});
