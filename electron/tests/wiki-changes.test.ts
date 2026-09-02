/**
 * Black-box tests for reading the wiki's own account of what it changed
 * ([ADR 0181](../../specs/decisions/0181-the-wiki-says-what-changed.md)).
 *
 * This replaces two guesses with a fact, so the things worth pinning are the ways a fact can be
 * mishandled: acting on news a copy already contains, moving the cursor past changes never seen, and
 * — the one that would be silent and expensive — treating "we have not been told" as evidence of
 * freshness on an install that has never been in a position to be told.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { belongsToRoster, planChanges, trackingCurrent } from "../wiki/changes";
import type { WikiChange } from "../wiki/api";

const change = (title: string, timestamp: string, type = "edit"): WikiChange => ({ title, timestamp, type });

/** `heldAt` from a plain map of title → ISO pull date. */
const ctx = (held: Record<string, string>, roster: string[] = Object.keys(held)) => ({
  heldAt: (title: string) => (held[title] ? Date.parse(held[title]) : undefined),
  inRoster: (title: string) => roster.includes(title),
});

test("a page edited after we pulled it is superseded", () => {
  const plan = planChanges(
    [change("Rusty Axe", "2026-09-01T00:00:00Z")],
    ctx({ "Rusty Axe": "2026-08-01T00:00:00Z" }),
  );
  assert.deepEqual(plan.stale, ["Rusty Axe"]);
});

test("a page edited *before* we pulled it is not", () => {
  // The comparison is against our copy's own date, not the cursor. Somebody opening a page by hand,
  // or a peer sending a newer copy, already answered the news — re-fetching it is pure waste.
  const plan = planChanges(
    [change("Rusty Axe", "2026-08-01T00:00:00Z")],
    ctx({ "Rusty Axe": "2026-09-01T00:00:00Z" }),
  );
  assert.deepEqual(plan.stale, []);
});

test("a change to something we don't hold but do want is not news", () => {
  // It is already a gap the planner will fill; marking it again would say nothing.
  const plan = planChanges([change("Cloth Cape", "2026-09-01T00:00:00Z")], ctx({}, ["Cloth Cape"]));
  assert.deepEqual(plan.stale, []);
  assert.deepEqual(plan.unknown, []);
});

test("a title the roster has never heard of is a candidate, not an addition", () => {
  // Deciding needs the page's categories, which is a request this module has no business making.
  const plan = planChanges([change("Mistmoore Heirloom Ring", "2026-09-01T00:00:00Z", "new")], ctx({}, []));
  assert.deepEqual(plan.unknown, ["Mistmoore Heirloom Ring"]);
  assert.deepEqual(plan.stale, []);
});

test("the cursor is the newest change seen, whatever order they arrive in", () => {
  const plan = planChanges(
    [
      change("A", "2026-09-01T10:00:00Z"),
      change("B", "2026-09-02T09:00:00Z"),
      change("C", "2026-08-30T23:00:00Z"),
    ],
    ctx({}, ["A", "B", "C"]),
  );
  assert.equal(plan.cursor, "2026-09-02T09:00:00Z");
});

test("an empty batch leaves the cursor alone", () => {
  // Moving it to "now" would skip whatever was edited between the last change and the poll — a hole
  // exactly where we stopped looking, and one nothing would ever report.
  assert.equal(planChanges([], ctx({})).cursor, undefined);
});

test("an unreadable timestamp cannot become the cursor, but still invalidates", () => {
  const plan = planChanges(
    [change("Rusty Axe", "not a date"), change("Cloth Cape", "2026-09-01T00:00:00Z")],
    ctx({ "Rusty Axe": "2026-08-01T00:00:00Z", "Cloth Cape": "2026-08-01T00:00:00Z" }),
  );
  assert.equal(plan.cursor, "2026-09-01T00:00:00Z");
  assert.ok(plan.stale.includes("Rusty Axe"), "unreadable means unknown, which means re-fetch");
});

test("a delete is handled as an ordinary change, and resolves itself", () => {
  // Rare (12 in a month, measured). Re-fetching a deleted page 404s and lands in `failed`, which is
  // the right outcome reached without a second code path that would almost never run.
  const plan = planChanges(
    [change("Gone Page", "2026-09-01T00:00:00Z", "log")],
    ctx({ "Gone Page": "2026-08-01T00:00:00Z" }),
  );
  assert.deepEqual(plan.stale, ["Gone Page"]);
});

test("one page edited five times is one re-fetch", () => {
  const plan = planChanges(
    ["2026-09-01T01:00:00Z", "2026-09-01T02:00:00Z", "2026-09-01T03:00:00Z"].map((t) => change("Busy", t)),
    ctx({ Busy: "2026-08-01T00:00:00Z" }),
  );
  assert.deepEqual(plan.stale, ["Busy"]);
});

// ─── Which new pages are ours ────────────────────────────────────────────────

test("a new page joins the roster when the walk would have found it", () => {
  const cats = new Map([
    ["Mistmoore Heirloom Ring", ["Category:Fingers", "Category:Classic Era"]],
    ["Some Spell", ["Category:Spells"]],
  ]);
  const walked = new Set(["Category:Items", "Category:Fingers", "Category:NPCs"]);

  assert.deepEqual(belongsToRoster([...cats.keys()], cats, walked), ["Mistmoore Heirloom Ring"]);
});

test("a title we know nothing about is not assumed in", () => {
  assert.deepEqual(belongsToRoster(["Mystery"], new Map(), new Set(["Category:Items"])), []);
});

// ─── When silence means something ────────────────────────────────────────────

test("never having polled is not evidence that nothing changed", () => {
  // The one that would be silent and expensive: without this, a fresh install would keep pages for
  // ninety days on the strength of news it was never in a position to receive.
  assert.equal(trackingCurrent(undefined, Date.parse("2026-09-02T00:00:00Z"), 90 * 864e5), false);
});

test("a cursor older than the wiki remembers is not evidence either", () => {
  const now = Date.parse("2026-09-02T00:00:00Z");
  assert.equal(trackingCurrent("2026-01-01T00:00:00Z", now, 90 * 864e5), false);
  assert.equal(trackingCurrent("2026-08-30T00:00:00Z", now, 90 * 864e5), true);
});

test("an unreadable cursor reads as untracked", () => {
  assert.equal(trackingCurrent("nonsense", Date.now(), 90 * 864e5), false);
});
