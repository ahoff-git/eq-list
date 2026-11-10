/**
 * Tests for `achievement-library.ts`'s stock criteria wording — specifically that every raw-line
 * criterion is read from the *start* of the line, so another player's chat that merely quotes the
 * game's sentence can't complete an achievement (ADR 0383). The shape the chat takes is real: a
 * guildmate's `Ramada tells General1:2, 'You have gained a level! Welcome to level 50! woohoo!'`
 * completed the old "Half Century" for a character that was nowhere near level 50.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_STYLES } from "../../src/shared/alerts/alert-styles";
import { matchesLine } from "../../src/shared/achievements/achievement-progress";
import { STOCK_ACHIEVEMENTS } from "../../src/shared/achievements/achievement-library";
import type { AchievementCriterion, CastAlertSettings } from "../../src/shared/types";

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

const says = (c: ReturnType<typeof criterion>, message: string) => matchesLine(c, settings(), { message, at }, T0);

test("every stock raw-line criterion is anchored to the start of the line", () => {
  const lineCriteria = STOCK_ACHIEVEMENTS.flatMap((a) => a.criteria).filter(
    (c: AchievementCriterion) => (c.kind === "watch" || c.kind === "count") && c.watch?.onLine,
  );
  assert.ok(lineCriteria.length > 0, "there should be raw-line criteria to check");
  for (const c of lineCriteria) {
    const anchored = c.watch?.conditions?.some((cond) => cond.field === "line" && cond.op === "starts" && !cond.exclude);
    assert.ok(anchored, `${c.id} reads its line as a substring, so chat that quotes it would complete it`);
  }
});

test("First Blood takes the player's own kill credit, not a bystander's kill or a quotation of one", () => {
  const c = criterion("stock:first-blood", "kill");
  assert.equal(says(c, "You have slain a giant rattlesnake!"), true); // a real line
  assert.equal(says(c, "a giant rattlesnake has been slain by Bob!"), false);
  assert.equal(says(c, "Bob tells the guild, 'You have slain a dragon!'"), false);
  assert.equal(says(c, "Guard Kolar says, 'You have slain my brother, fiend!'"), false);
});

test("Oops takes the player's own death line, not a quotation of it", () => {
  const c = criterion("stock:die", "die");
  assert.equal(says(c, "You have been slain by Minotaur Lord!"), true); // a real line
  assert.equal(says(c, "Bob tells General1:2, 'You have been slain by a gnoll lol'"), false);
});

test("Persona Non Grata takes the floor line, and neither the ceiling line nor chat quoting it", () => {
  const c = criterion("stock:faction-enemy", "hated");
  assert.equal(says(c, "Your faction standing with Sabertooths of Blackburrow could not possibly get any worse."), true); // a real line
  assert.equal(says(c, "Your faction standing with Guards of Qeynos could not possibly get any better."), false);
  assert.equal(says(c, "Your faction standing with Guards of Qeynos has been adjusted by -3."), false);
  assert.equal(
    says(c, "Bob tells the guild, 'Your faction standing with Guards of Qeynos could not possibly get any worse.'"),
    false,
  );
});

test("The Long Road takes the player's own level-up, not another player's chat about one", () => {
  const c = criterion("stock:level-60", "level-60");
  assert.equal(says(c, "You have gained a level! Welcome to level 60!"), true);
  assert.equal(says(c, "You have gained a level! Welcome to level 59!"), false);
  assert.equal(says(c, "You have gained a level! Welcome to level 600!"), false);
  // The shape of the line that completed Half Century by mistake, with 60 in place of 50.
  assert.equal(says(c, "Ramada tells General1:2, 'You have gained a level! Welcome to level 60! woohoo!'"), false);
});
