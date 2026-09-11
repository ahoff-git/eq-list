/**
 * `sanitizeObservations` is the receiving half of "somebody else told us this" for pooled mob
 * knowledge — see `peer-kills.test.ts` for the sibling check on shared kill positions, and
 * `contributions.ts` for the filing rules (keyed by contributor, re-vetted on every load).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeObservations } from "../mob-knowledge";

const obs = (over: Record<string, unknown> = {}) => ({ mob: "a bat", zone: "gfaydark", kills: 4, drops: { "Bat Fang": 2 }, ...over });

test("a well-formed observation survives", () => {
  const out = sanitizeObservations([obs()]);
  assert.equal(out.length, 1);
  assert.equal(out[0].zone, "gfaydark");
});

test("a zone confirmed to be a restriction notice, not a place, is refused like a malformed shape", () => {
  // The client reuses the zone-arrival sentence for a restriction notice ("You have entered an area
  // where levitation effects do not function.") — a peer on an older build, before `classifyZoneLine`
  // existed, could still report it as the zone an observation happened in.
  assert.deepEqual(sanitizeObservations([obs({ zone: "an area where levitation effects do not function" })]), []);
  assert.equal(sanitizeObservations([obs({ zone: "Greater Faydark" })]).length, 1, "an ordinary zone still survives");
});

test("a well-formed admin audit flag survives re-vetting; a fabricated one is dropped", () => {
  const admin = (row: unknown) => (row as { __admin?: unknown }).__admin;
  const audit = { edited: true, history: [{ field: "kills", from: 3, to: 5, at: "2026-01-01T00:00:00Z" }] };
  const [kept] = sanitizeObservations([obs({ __admin: audit })]);
  assert.deepEqual(admin(kept), audit);

  const [row] = sanitizeObservations([obs({ __admin: { edited: true, history: "nope" } })]);
  assert.equal(admin(row), undefined);
});

// ─── Multiple known locations, from a peer (ADR 0228) ──────────────────────────────────────────

test("a peer's several known locations survive vetting, element by element", () => {
  const areas = [
    { y: 10, x: 20, spread: 3, samples: 5 },
    { y: 400, x: 400, spread: 1, samples: 2 },
  ];
  const [row] = sanitizeObservations([obs({ areas })]);
  assert.deepEqual(row.areas, areas);
  assert.deepEqual(row.area, areas[0], "recomputed from `areas[0]`, not trusted as sent");
});

test("a malformed entry in a peer's `areas` array is dropped, not the whole observation", () => {
  const [row] = sanitizeObservations([
    obs({ areas: [{ y: 10, x: 20, spread: 3, samples: 5 }, { y: "nope", x: 1, spread: 1, samples: 1 }, "garbage"] }),
  ]);
  assert.deepEqual(row.areas, [{ y: 10, x: 20, spread: 3, samples: 5 }]);
});

test("a peer still on a build from before ADR 0228 — only `area`, no `areas` at all — still places it", () => {
  const [row] = sanitizeObservations([obs({ area: { y: 10, x: 20, spread: 3, samples: 5 } })]);
  assert.deepEqual(row.areas, [{ y: 10, x: 20, spread: 3, samples: 5 }]);
  assert.deepEqual(row.area, { y: 10, x: 20, spread: 3, samples: 5 });
});
