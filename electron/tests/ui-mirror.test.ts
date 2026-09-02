/**
 * What a window believes about its own panel settings, and who gets the last word.
 *
 * The regression these pin cost the Items tab's dropdowns: main's record was fetched once at page
 * load and held as a **snapshot**, so every remount re-applied it. Change a dropdown, switch tabs,
 * switch back, and the change was silently reverted by a read answering from a photograph — while
 * every write in the chain worked perfectly, which is what made it hard to credit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createUiMirror } from "../../src/shared/ui-mirror";

test("a value written is the value read back", () => {
  // The whole bug in one line: this is what a remount asks, and it used to get launch-time state.
  const mirror = createUiMirror();
  mirror.remember("zone", "Befallen");
  mirror.remember("zone", "Blackburrow");
  assert.equal(mirror.get("zone"), "Blackburrow");
});

test("the seed fills gaps rather than overwriting", () => {
  // A user quick enough to change a setting inside the first IPC round trip must not have it undone
  // by the reply to a request that went out before they touched it.
  const mirror = createUiMirror();
  mirror.remember("zone", "Blackburrow");
  mirror.seed({ zone: "Befallen", grouping: "item" });
  assert.equal(mirror.get("zone"), "Blackburrow", "ours stood");
  assert.equal(mirror.get("grouping"), "item", "and theirs filled the gap");
});

test("a second seed cannot undo what happened between them", () => {
  const mirror = createUiMirror();
  mirror.seed({ zone: "Befallen" });
  mirror.remember("zone", "Blackburrow");
  mirror.seed({ zone: "Befallen" });
  assert.equal(mirror.get("zone"), "Blackburrow");
});

test("a key nothing has set is absent, not undefined-shaped", () => {
  // `has` is what decides whether a mount can answer synchronously or has to wait for main, so
  // "absent" and "set to undefined" have to be tellable apart.
  const mirror = createUiMirror();
  assert.equal(mirror.has("zone"), false);
  assert.equal(mirror.get("zone"), undefined);
  mirror.seed({ zone: "Befallen" });
  assert.equal(mirror.has("zone"), true);
});

test("a falsy value is a value, and survives a seed", () => {
  // Every one of these is a real setting — an unticked box, an empty filter, a zeroed weight — and
  // a gap test written as a truthiness test would let the seed overwrite all of them.
  const mirror = createUiMirror();
  for (const [key, value] of [["off", false], ["none", 0], ["blank", ""], ["empty", []]] as const) {
    mirror.remember(key, value);
  }
  mirror.seed({ off: true, none: 99, blank: "something", empty: ["a"] });
  assert.deepEqual(
    ["off", "none", "blank", "empty"].map((k) => mirror.get(k)),
    [false, 0, "", []],
  );
});
