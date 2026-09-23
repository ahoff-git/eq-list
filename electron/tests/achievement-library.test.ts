/**
 * Tests for `achievement-library.ts`'s stock criteria wording — specifically the "Citadel Cleared"
 * kill criteria, whose match text has to be exactly what the log says rather than a clean label
 * (see `killCriterion`'s own doc comment).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_STYLES } from "../../src/shared/alert-styles";
import { matchesLine } from "../../src/shared/achievement-progress";
import { STOCK_ACHIEVEMENTS } from "../../src/shared/achievement-library";
import type { CastAlertSettings } from "../../src/shared/types";

const T0 = Date.parse("2026-08-17T12:00:00.000Z");
const at = new Date(T0).toISOString();
const settings = () =>
  ({ enabled: true, includeSelf: false, color: "#e5534b", position: "top", styles: [...BUILT_IN_STYLES] }) as unknown as CastAlertSettings;

function criterion(achievementId: string, criterionId: string) {
  const achievement = STOCK_ACHIEVEMENTS.find((a) => a.id === achievementId);
  const c = achievement?.criteria.find((c) => c.id === criterionId);
  assert.ok(c, `${achievementId}/${criterionId} should exist`);
  return c!;
}

test("Citadel Cleared's Goblin Warlord criterion matches the real kill line, which keeps its indefinite article", () => {
  // named-mobs.generated.ts scrapes this mob's own in-game name as "A Goblin Warlord" — unlike every
  // other boss in this achievement (Borxx, Sludge Dankmire, The Goblin King, Goblin Elite Guard),
  // none of which carry an article. A criterion built from the bare label alone could never fire.
  const c = criterion("stock:runnyeye-cleared", "goblin-warlord");
  assert.equal(c.label, "Goblin Warlord", "the checklist label should stay clean");
  assert.equal(matchesLine(c, settings(), { message: "You have slain a Goblin Warlord!", at }, T0), true);
});

test("Citadel Cleared's other bosses match their own article-free names, unaffected by the Goblin Warlord fix", () => {
  assert.equal(
    matchesLine(criterion("stock:runnyeye-cleared", "borxx"), settings(), { message: "You have slain Borxx!", at }, T0),
    true,
  );
  assert.equal(
    matchesLine(
      criterion("stock:runnyeye-cleared", "goblin-king"),
      settings(),
      { message: "You have slain The Goblin King!", at },
      T0,
    ),
    true,
  );
});
