/**
 * `raiseIfEnabled` is the one gate every tracker's own alert (`achievement-tracker.ts`,
 * `goal-tracker.ts`, `spawn-tracker.ts`, `game-clock-tracker.ts`, `buff-tracker.ts`) makes before it
 * ever builds a banner: the overlay itself, on or off. What's pinned here is the gate alone — each
 * tracker's own payload shape is exercised by its own tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { raiseIfEnabled } from "../alert-gate";
import type { CastAlertEvent, CastAlertSettings } from "../../src/shared/types";

const settings = (enabled: boolean) => ({ enabled }) as unknown as CastAlertSettings;

test("nothing is built or raised while the overlay is switched off", () => {
  let built = false;
  const raised: CastAlertEvent[] = [];
  raiseIfEnabled(
    () => settings(false),
    (a) => raised.push(a),
    () => {
      built = true;
      return { caster: "", spell: "", at: "", event: "line" } as CastAlertEvent;
    },
  );
  assert.equal(built, false, "the gate fails closed before `build` is ever asked to do work");
  assert.deepEqual(raised, []);
});

test("build sees the current settings, and its event is raised", () => {
  const raised: CastAlertEvent[] = [];
  let seen: CastAlertSettings | undefined;
  const event = { caster: "", spell: "Fear", at: "2026-01-01T00:00:00.000Z", event: "cast" } as CastAlertEvent;
  raiseIfEnabled(
    () => settings(true),
    (a) => raised.push(a),
    (s) => {
      seen = s;
      return event;
    },
  );
  assert.equal(seen?.enabled, true);
  assert.deepEqual(raised, [event]);
});

test("build returning undefined skips silently, even while enabled", () => {
  const raised: CastAlertEvent[] = [];
  raiseIfEnabled(
    () => settings(true),
    (a) => raised.push(a),
    () => undefined,
  );
  assert.deepEqual(raised, []);
});
