/**
 * `createArrayAdminStore` is the one function every registered store goes through — see the module
 * doc in `electron/admin.ts` on why that matters (it replaced three copies of this exact walk).
 *
 * The property under test throughout: **a patch mutates the object every other reader already holds
 * a reference to.** That's what "changes filter through the system" means in practice, and it's the
 * one thing a shallow-copy bug would break silently.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAdminRegistry, createArrayAdminStore } from "../admin";

interface FakeKill {
  id: string;
  mob: string;
  zone?: string;
  confidence: number;
}

function store(kills: FakeKill[]) {
  let saves = 0;
  let changes = 0;
  const admin = createArrayAdminStore("Kills", () => kills, {
    idOf: (k) => k.id,
    summaryOf: (k) => `${k.mob} in ${k.zone ?? "?"}`,
    editable: ["mob", "zone", "confidence"],
    remove: (k) => {
      const i = kills.indexOf(k);
      if (i >= 0) kills.splice(i, 1);
    },
    save: () => saves++,
    onChanged: () => changes++,
  });
  return { admin, kills, saves: () => saves, changes: () => changes };
}

test("list reflects the live array, field by field, with no prior edits", () => {
  const { admin } = store([{ id: "k1", mob: "a gnoll", zone: "Blackburrow", confidence: 0.8 }]);
  const [row] = admin.list();
  assert.equal(row.id, "k1");
  assert.equal(row.summary, "a gnoll in Blackburrow");
  assert.equal(row.edited, false);
  assert.deepEqual(row.history, []);
  assert.deepEqual(row.fields, [
    { key: "mob", value: "a gnoll", type: "string" },
    { key: "zone", value: "Blackburrow", type: "string" },
    { key: "confidence", value: 0.8, type: "number" },
  ]);
});

test("patching a live record changes the exact object every other reader holds", () => {
  const original: FakeKill = { id: "k1", mob: "a gnoll", zone: "an area where levitation effects do not function", confidence: 0.8 };
  const { admin, kills } = store([original]);

  const result = admin.patch("k1", "zone", "Blackburrow");
  assert.deepEqual(result, { ok: true });

  // Not a copy the admin layer swapped in — the very reference this test already held.
  assert.equal(original.zone, "Blackburrow");
  assert.equal(kills[0], original);
});

test("a patch is refused for a field type mismatch, and nothing is written", () => {
  const { admin, saves } = store([{ id: "k1", mob: "a gnoll", confidence: 0.8 }]);
  const result = admin.patch("k1", "confidence", "not a number");
  assert.deepEqual(result, { ok: false, error: '"not a number" is not a number' });
  assert.equal(saves(), 0, "a refused patch never calls save");
});

test("a field not on the editable list is refused, whatever the store actually holds", () => {
  const { admin } = store([{ id: "k1", mob: "a gnoll", confidence: 0.8 }]);
  const result = admin.patch("k1", "id", "k2");
  assert.equal(result.ok, false);
});

test("an edited record carries the flag and the full history, oldest first", () => {
  const { admin } = store([{ id: "k1", mob: "a gnoll", zone: "bad", confidence: 0.8 }]);
  admin.patch("k1", "zone", "Blackburrow");
  admin.patch("k1", "mob", "a gnoll pup");

  const row = admin.get("k1")!;
  assert.equal(row.edited, true);
  assert.equal(row.history.length, 2);
  assert.deepEqual(
    row.history.map((h) => [h.field, h.from, h.to]),
    [
      ["zone", "bad", "Blackburrow"],
      ["mob", "a gnoll", "a gnoll pup"],
    ],
  );
});

test("save and onChanged fire exactly once per successful patch, never on a refusal", () => {
  const { admin, saves, changes } = store([{ id: "k1", mob: "a gnoll", confidence: 0.8 }]);
  admin.patch("k1", "confidence", "0.5");
  assert.equal(saves(), 1);
  assert.equal(changes(), 1);
  admin.patch("k1", "confidence", "nope");
  assert.equal(saves(), 1, "still 1 — the bad patch changed nothing");
});

test("removing a record takes it out of the exact array every other reader holds", () => {
  const original: FakeKill = { id: "k1", mob: "a gnoll", confidence: 0.8 };
  const { admin, kills, saves, changes } = store([original, { id: "k2", mob: "a bat", confidence: 0.4 }]);

  const result = admin.remove("k1");
  assert.deepEqual(result, { ok: true });
  assert.equal(saves(), 1);
  assert.equal(changes(), 1);

  // Not a copy the admin layer swapped in — the very array this test already held.
  assert.deepEqual(kills, [{ id: "k2", mob: "a bat", confidence: 0.4 }]);
  assert.equal(admin.get("k1"), undefined);
});

test("removing an id that doesn't exist is refused, and nothing is written", () => {
  const { admin, saves } = store([{ id: "k1", mob: "a gnoll", confidence: 0.8 }]);
  const result = admin.remove("nope");
  assert.deepEqual(result, { ok: false, error: "no such record" });
  assert.equal(saves(), 0);
});

test("a store that replaces its whole array is picked up without re-registering", () => {
  let kills: FakeKill[] = [{ id: "k1", mob: "a gnoll", confidence: 0.8 }];
  const admin = createArrayAdminStore("Kills", () => kills, {
    idOf: (k) => k.id,
    summaryOf: (k) => k.mob,
    editable: ["mob"],
    remove: () => {},
    save: () => {},
  });
  kills = [{ id: "k2", mob: "a bat", confidence: 0.4 }]; // a `clear` + re-import, say
  assert.equal(admin.list().length, 1);
  assert.equal(admin.list()[0].id, "k2");
  assert.equal(admin.get("k1"), undefined, "the old record is gone with the array it lived in");
});

test("createAdminRegistry reports every store's size and how much of it is already flagged", () => {
  // A real store's `getItems` returns the *same* array every call (kill-log.ts's `kills`, e.g.) —
  // a fresh literal here would silently discard every patch, which is exactly the trap the module
  // doc warns about. Captured variables, not inline literals, are what make this test honest.
  const killRows: FakeKill[] = [{ id: "k1", mob: "a gnoll", confidence: 0.8 }];
  const lootRows: { id: string; item: string }[] = [{ id: "l1", item: "Bone Chips" }];
  const kills = createArrayAdminStore("Kills", () => killRows, {
    idOf: (k: FakeKill) => k.id,
    summaryOf: (k: FakeKill) => k.mob,
    editable: ["mob"],
    remove: (k) => {
      const i = killRows.indexOf(k);
      if (i >= 0) killRows.splice(i, 1);
    },
    save: () => {},
  });
  const loot = createArrayAdminStore("Loot", () => lootRows, {
    idOf: (l: { id: string }) => l.id,
    summaryOf: (l: { item: string }) => l.item,
    editable: ["item"],
    remove: (l) => {
      const i = lootRows.indexOf(l);
      if (i >= 0) lootRows.splice(i, 1);
    },
    save: () => {},
  });
  const registry = createAdminRegistry({ kills, loot });

  kills.patch("k1", "mob", "a gnoll pup");

  assert.deepEqual(
    registry.stores().sort((a, b) => a.id.localeCompare(b.id)),
    [
      { id: "kills", label: "Kills", count: 1, editedCount: 1 },
      { id: "loot", label: "Loot", count: 1, editedCount: 0 },
    ],
  );
  assert.equal(registry.records("loot").length, 1);
  assert.equal(registry.record("kills", "k1")?.edited, true);
  assert.deepEqual(registry.patch("nope", "k1", "mob", "x"), { ok: false, error: "no such store" });

  assert.deepEqual(registry.remove("nope", "k1"), { ok: false, error: "no such store" });
  assert.deepEqual(registry.remove("loot", "l1"), { ok: true });
  assert.equal(registry.records("loot").length, 0);
});
