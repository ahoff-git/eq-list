/**
 * The watch a faction page's "🔔 Alert me" button adds
 * ([ADR 0193](../../specs/decisions/0193-a-faction-alert-rides-the-existing-line-watch.md)).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFactionWatch, isFactionWatched } from "../../src/shared/faction-watch";
import { checkWatch } from "../../src/shared/watch-check";
import type { CastWatch } from "../../src/shared/types";

test("a faction watch passes the same soundness check a hand-made watch does", () => {
  const issues = checkWatch(buildFactionWatch("Priests of Life"));
  assert.deepEqual(issues, []);
});

test("a faction watch matches raw lines, scoped to that faction's own name", () => {
  const w = buildFactionWatch("Priests of Life");
  assert.equal(w.onLine, true);
  assert.equal(w.onCast, false);
  assert.ok(w.conditions?.some((c) => c.field === "line" && c.text === "Priests of Life" && !c.exclude));
});

test("two factions get two independent watches, never confused for one another", () => {
  const a = buildFactionWatch("Priests of Life");
  const b = buildFactionWatch("Knights of Truth");
  assert.notEqual(a.id, b.id);
  assert.ok(!isFactionWatched([a], "Knights of Truth"));
  assert.ok(isFactionWatched([b], "Knights of Truth"));
});

test("isFactionWatched: judged by what a watch matches, not by id — same rule the library uses", () => {
  const watches: CastWatch[] = [buildFactionWatch("Priests of Life")];
  assert.ok(isFactionWatched(watches, "Priests of Life"));
  assert.ok(!isFactionWatched(watches, "Priests of Marr"));
  assert.ok(!isFactionWatched([], "Priests of Life"));
});

test("an excluding condition on the same faction name doesn't count as watching it", () => {
  // A watch built to skip lines naming this faction (unlikely, but possible by hand) is the mirror
  // image of watching it — `exclude` must not be read as a match.
  const excluding: CastWatch = {
    id: "x",
    spell: "faction standing",
    enabled: true,
    onLine: true,
    conditions: [{ field: "line", op: "contains", text: "Priests of Life", exclude: true }],
  };
  assert.ok(!isFactionWatched([excluding], "Priests of Life"));
});
