/**
 * Black-box tests for crossing tradeskill guides with what you hold (`src/shared/tradeskills/
 * held-materials.ts`). Only need re-running if that file changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { alternativesAt, guideSteps, heldOf, holdingsOf } from "../../src/shared/tradeskills/held-materials";
import type { JudgedBlock } from "../../src/shared/tradeskills/tradeskill-era";

const link = (name: string) => ({ link: name, text: name });

test("holdings fold grades and case, and keep each peer's count apart", () => {
  const h = holdingsOf(
    [{ baseName: "Bone Chips", count: 643 }, { baseName: "bone chips", count: 4 }],
    [{ by: "Bob", item: "Bone Chips", count: 20 }, { by: "Ann", item: "Bone Chips", count: 50 }, { by: "Bob", item: "Bone Chips", count: 5 }],
  );
  assert.deepEqual(heldOf(h, "Bone Chips +2"), { mine: 647, peers: [{ by: "Ann", count: 50 }, { by: "Bob", count: 25 }] });
  assert.equal(heldOf(h, "Rat Whiskers"), undefined);
});

const guides: { name: string; blocks: JudgedBlock[] }[] = [
  {
    name: "Recommended",
    blocks: [
      {
        kind: "list",
        items: [
          { runs: [link("Skull Ale")], skill: { from: 100, to: 135 }, needs: [{ name: "Cyclops Skull", qty: 1 }, { name: "Short Beer", qty: 2 }] },
          { runs: [link("Shut Thing")], skill: { from: 100, to: 135 }, needs: [{ name: "Bone Chips", qty: 1 }], shut: { era: "velious" } as never },
        ],
      },
      {
        kind: "table",
        header: ["Recipe", "Ingredients"],
        rows: [
          { cells: [[link("Bone Paste")], [link("Bone Chips")]], skill: { from: 90, to: 140 }, needs: [{ name: "Bone Chips", qty: 3 }, { name: "Water Flask", qty: 1 }, { name: "File Mold", qty: 2, total: true }] },
          { cells: [[link("Fish Pie")], [link("Fish Scales")]], skill: { from: 120, to: 160 }, needs: [{ name: "Fish Scales", qty: 1 }] },
        ],
      },
    ],
  },
];

test("guide steps: every span-and-materials step from lists and tables, out-of-era ones left out", () => {
  const steps = guideSteps(guides);
  assert.deepEqual(steps.map((s) => s.label), ["Skull Ale", "Bone Paste", "Fish Pie"]);
});

test("alternatives at your skill count peers' shared holdings, and keep yours apart", () => {
  const holdings = holdingsOf(
    [{ baseName: "Bone Chips", count: 643 }, { baseName: "Water Flask", count: 40 }, { baseName: "Short Beer", count: 10 }, { baseName: "Fish Scales", count: 12 }],
    [{ by: "Bob", item: "Cyclops Skull", count: 99 }, { by: "Ann", item: "Water Flask", count: 30 }],
  );
  const alts = alternativesAt(guideSteps(guides), 110, holdings);
  // Bone Paste: chips 643/3 = 214, flasks 40 of yours → 40; with Ann's 30 more → 70. The File Mold is a
  // one-off and doesn't limit. Skull Ale: none of the skulls are yours (0), but with Bob's 99 the 10
  // beers make 5 combines (2 a combine). Fish Pie starts at 120, so at 110 it isn't a skill-up yet.
  assert.deepEqual(
    alts.map((a) => [a.step.label, a.combines, a.withPeers, a.missing]),
    [
      ["Bone Paste", 40, 70, ["File Mold"]],
      ["Skull Ale", 0, 5, []],
    ],
  );
  assert.deepEqual(alts[1].held.find((h) => h.name === "Cyclops Skull"), { name: "Cyclops Skull", mine: 0, peers: [{ by: "Bob", count: 99 }] });
  assert.deepEqual(alternativesAt(guideSteps(guides), 135, holdings).map((a) => a.step.label), ["Bone Paste", "Fish Pie"], "135 is past Skull Ale's span; 70 combines beats 12");
});

test("a step only a peer can supply still counts", () => {
  const holdings = holdingsOf([], [{ by: "Bob", item: "Fish Scales", count: 30 }]);
  assert.deepEqual(alternativesAt(guideSteps(guides), 130, holdings).map((a) => [a.step.label, a.combines, a.withPeers]), [["Fish Pie", 0, 30]]);
});
