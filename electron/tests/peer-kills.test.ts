/**
 * What a stranger's kill has to look like before it may put a dot on your map.
 *
 * `sanitizeKills` is the **receiving** half of a rule the sender also applies, and it is deliberately
 * not a duplicate: we cannot see how they made their check, or whether they made one at all. It is
 * the only thing standing between a peer's payload and a marker drawn at a position nobody measured,
 * so every field it reads is a field somebody else chose.
 *
 * The filing rules — keyed by contributor, replaced per report, capped — are `contributions.ts` and
 * are tested there. This is only the shape check.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeKills } from "../peer-kills";

/** A well-formed shared kill, which every case below spoils in exactly one way. */
const kill = (over: Record<string, unknown> = {}) => ({ mob: "a bat", zone: "gfaydark", y: 100, x: -200, confidence: 0.8, ...over });

test("a well-formed kill survives with nothing added and nothing carried over", () => {
  // Reduced to the five fields a dot needs. Anything else the sender attached — a time, a loot list,
  // a claim about who they are — is not copied, which is what makes storing a stranger's claim safe:
  // the worst a bad one can do is draw a marker in the wrong place.
  const out = sanitizeKills([kill({ at: "2024-01-01T00:00:00Z", loot: ["Fungi Tunic"], by: "someone else" })]);
  assert.deepEqual(out, [{ mob: "a bat", zone: "gfaydark", y: 100, x: -200, confidence: 0.8 }]);
});

test("a kill with nothing to draw is dropped rather than defaulted to nowhere", () => {
  // Position zero is a real coordinate in EverQuest, so "missing" cannot be represented by a zero —
  // it has to be represented by refusing the row.
  for (const spoiled of [{ y: undefined }, { x: undefined }, { y: "100" }, { x: null }, { y: NaN }, { x: Infinity }]) {
    assert.deepEqual(sanitizeKills([kill(spoiled)]), [], JSON.stringify(spoiled));
  }
  assert.deepEqual(sanitizeKills([kill({ y: 0, x: 0 })]).length, 1, "the origin is a place like any other");
});

test("a kill has to name something, and a name has to be more than spaces", () => {
  for (const spoiled of [{ mob: "" }, { mob: "   " }, { mob: 42 }, { mob: undefined }, { zone: "" }, { zone: "  " }, { zone: null }]) {
    assert.deepEqual(sanitizeKills([kill(spoiled)]), [], JSON.stringify(spoiled));
  }
});

test("a confidence outside 0–1 is malformed, not weak, and is refused rather than clamped", () => {
  // `estimates.ts` rule 2: a figure that cannot mean what it says is not evidence of anything, and
  // clamping it would turn a broken sender into a confident one.
  for (const c of [-0.5, 1.5, 2, "0.9", undefined, null, NaN]) {
    assert.deepEqual(sanitizeKills([kill({ confidence: c })]), [], String(c));
  }
  // And the honest-but-weak end: below the floor a position is a guess about a guess.
  assert.deepEqual(sanitizeKills([kill({ confidence: 0.19 })]), []);
  assert.equal(sanitizeKills([kill({ confidence: 0.2 })]).length, 1, "the floor itself is included");
  assert.equal(sanitizeKills([kill({ confidence: 1 })]).length, 1);
});

test("one bad row costs its own row and nothing else", () => {
  // A peer sending four hundred kills with one malformed among them must not lose the other 399.
  const out = sanitizeKills([kill({ mob: "a bat" }), null, "nonsense", 7, [], kill({ mob: "a rat" }), { }]);
  assert.deepEqual(out.map((k) => k.mob), ["a bat", "a rat"]);
});

test("nothing at all is an empty list, not a throw", () => {
  assert.deepEqual(sanitizeKills([]), []);
});
