/**
 * Black-box tests for the category walk — the thing that finds pages we have never heard of.
 *
 * The bug this exists to prevent is silent and expensive: a roster built by *listing*
 * `Category:Items` misses every page filed only in one of its thirty subcategories, and a missing
 * title is not a failure anybody sees — it is a page that is never fetched, never shared, and never
 * counted as absent ([ADR 0177](../../specs/decisions/0177-the-item-list-is-a-walk-not-a-listing.md)).
 *
 * So the properties pinned here are the ones that make the walk *complete* and *bounded*: it
 * descends, it survives a graph with cycles in it, it pauses between every request rather than
 * between categories, it stops when told, and it never returns fewer pages because a category
 * happened to fail. Plus the **seeds** themselves
 * ([ADR 0178](../../specs/decisions/0178-a-mob-page-is-worth-its-own-fetch.md)), since losing one
 * costs a whole tab's worth of data and breaks nothing that would fail here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { exploreCategories, EXPLORE_SEEDS, MAX_CATEGORIES } from "../wiki/explore";

/** A fake wiki: a category graph, listed one slice at a time so continuations can be modelled. */
function rig(
  graph: Record<string, { pages?: string[]; subcats?: string[] }>,
  opts: { perSlice?: number; fail?: string[]; stopAfter?: number } = {},
) {
  const perSlice = opts.perSlice ?? 500;
  const fail = new Set(opts.fail ?? []);
  const log = { requests: [] as string[], waits: [] as number[] };
  let calls = 0;

  const deps = {
    async listCategory(category: string, cursor?: string) {
      log.requests.push(cursor ? `${category}@${cursor}` : category);
      calls++;
      if (fail.has(category)) throw new Error("the wiki said no");
      const node = graph[category] ?? {};
      const pages = node.pages ?? [];
      const from = cursor ? Number(cursor) : 0;
      const slice = pages.slice(from, from + perSlice);
      const next = from + perSlice;
      return {
        pages: slice,
        // Subcategories come with the first slice only, as MediaWiki would return them in sort
        // order — a walk that only read them off the last slice would be a walk that never descended.
        subcats: cursor ? [] : (node.subcats ?? []),
        cursor: next < pages.length ? String(next) : undefined,
      };
    },
    async wait(ms: number) {
      log.waits.push(ms);
    },
    stopped: () => opts.stopAfter !== undefined && calls >= opts.stopAfter,
  };
  return { deps, log };
}

test("it descends into subcategories — the 680 items a flat listing cannot see", async () => {
  const { deps } = rig({
    "Category:Items": { pages: ["Rusty Axe"], subcats: ["Category:Equipment"] },
    "Category:Equipment": { pages: ["Cloth Cape"], subcats: ["Category:Fingers"] },
    "Category:Fingers": { pages: ["Mistmoore Heirloom Ring"] },
  });

  const out = await exploreCategories(["Category:Items"], deps, 10);

  assert.deepEqual(out.titles, ["Cloth Cape", "Mistmoore Heirloom Ring", "Rusty Axe"]);
  assert.equal(out.categories.length, 3, "it reached all three, not just the seed");
  assert.equal(out.truncated, false);
});

test("a category cycle terminates instead of walking for ever", async () => {
  // This wiki's categories are a graph, not a tree: Weapons and Equipment each reach the other's
  // children. A walk that assumed a tree would revisit until the budget ran out.
  const { deps, log } = rig({
    "Category:Items": { pages: ["A"], subcats: ["Category:Weapons"] },
    "Category:Weapons": { pages: ["B"], subcats: ["Category:Equipment"] },
    "Category:Equipment": { pages: ["C"], subcats: ["Category:Weapons", "Category:Items"] },
  });

  const out = await exploreCategories(["Category:Items"], deps, 10);

  assert.deepEqual(out.titles, ["A", "B", "C"]);
  assert.equal(out.categories.length, 3);
  assert.equal(log.requests.length, 3, "each category was listed exactly once");
});

test("the gap goes around every request, not every category", async () => {
  // `Category:Items` is twenty-three continuations on the live wiki. Gating per category would fire
  // all twenty-three back to back inside what ADR 0153 promised was a page-a-second trickle.
  const { deps, log } = rig({ "Category:Items": { pages: ["A", "B", "C", "D", "E"] } }, { perSlice: 2 });

  await exploreCategories(["Category:Items"], deps, 250);

  assert.equal(log.requests.length, 3, "five pages at two a slice is three requests");
  assert.deepEqual(log.waits, [250, 250], "a gap between them, and none before the first");
});

test("a category the wiki won't list costs that category and not the walk", async () => {
  const { deps } = rig(
    {
      "Category:Items": { pages: ["A"], subcats: ["Category:Broken", "Category:Fine"] },
      "Category:Broken": { pages: ["never seen"] },
      "Category:Fine": { pages: ["B"] },
    },
    { fail: ["Category:Broken"] },
  );

  const out = await exploreCategories(["Category:Items"], deps, 10);

  assert.deepEqual(out.titles, ["A", "B"]);
  assert.deepEqual(out.failed, ["Category:Broken"]);
});

test("stopping the run stops the walk inside it", async () => {
  // The walk happens *during* a harvest, so Stop has to reach it — otherwise pressing it during the
  // roster phase appears to do nothing for a minute and a half.
  const { deps, log } = rig(
    {
      "Category:Items": { pages: ["A"], subcats: ["Category:Two"] },
      "Category:Two": { pages: ["B"], subcats: ["Category:Three"] },
      "Category:Three": { pages: ["C"] },
    },
    { stopAfter: 2 },
  );

  const out = await exploreCategories(["Category:Items"], deps, 10);

  assert.equal(log.requests.length, 2, "it stopped rather than finishing the graph");
  assert.ok(!out.titles.includes("C"));
});

test("a runaway graph is capped rather than followed", async () => {
  // The guard against a re-parented category tree turning a bounded walk unbounded. Reaching this
  // means something is wrong, so it says so via `truncated` rather than returning a short list that
  // looks complete.
  const graph: Record<string, { pages?: string[]; subcats?: string[] }> = {};
  for (let i = 0; i < MAX_CATEGORIES + 50; i++) {
    graph[`Category:${i}`] = { pages: [`Page ${i}`], subcats: [`Category:${i + 1}`] };
  }
  const { deps } = rig(graph);

  const out = await exploreCategories(["Category:0"], deps, 0);

  assert.equal(out.truncated, true);
  assert.equal(out.categories.length, MAX_CATEGORIES);
});

test("the same page in two categories is one title", async () => {
  // Items are filed under a slot *and* a class *and* an era, so the overlap is the normal case
  // rather than an edge one — 141,377 memberships across 715 categories on the live wiki.
  const { deps } = rig({
    "Category:Items": { subcats: ["Category:Fingers", "Category:Cleric Equipment"] },
    "Category:Fingers": { pages: ["Mistmoore Heirloom Ring"] },
    "Category:Cleric Equipment": { pages: ["Mistmoore Heirloom Ring"] },
  });

  const out = await exploreCategories(["Category:Items"], deps, 10);

  assert.deepEqual(out.titles, ["Mistmoore Heirloom Ring"]);
});

test("both seeds are walked — items and NPCs", async () => {
  // The seeds are the things this app reads pages *for*
  // ([ADR 0178](../../specs/decisions/0178-a-mob-page-is-worth-its-own-fetch.md)). Asserted rather
  // than assumed because dropping `Category:NPCs` would cost the Hunt tab every drop rate the wiki
  // has — the rates are on the mob page and nowhere else — and nothing else here would notice.
  assert.deepEqual(EXPLORE_SEEDS, ["Category:Items", "Category:NPCs"]);

  const { deps } = rig({
    "Category:Items": { pages: ["Rusty Axe"] },
    "Category:NPCs": { pages: ["A Bloodgill Goblin"], subcats: ["Category:Named"] },
    "Category:Named": { pages: ["Lord Yelinak"] },
  });

  const out = await exploreCategories(EXPLORE_SEEDS, deps, 10);

  assert.deepEqual(out.titles, ["A Bloodgill Goblin", "Lord Yelinak", "Rusty Axe"]);
  assert.equal(out.complete, true);
});

test("one seed failing doesn't cost the other", async () => {
  const { deps } = rig(
    { "Category:Items": { pages: ["Rusty Axe"] }, "Category:NPCs": { pages: ["never seen"] } },
    { fail: ["Category:NPCs"] },
  );

  const out = await exploreCategories(EXPLORE_SEEDS, deps, 10);

  assert.deepEqual(out.titles, ["Rusty Axe"]);
  assert.deepEqual(out.failed, ["Category:NPCs"]);
  // But the walk is **not** complete, so the caller won't stamp it as this week's answer and the
  // next run tries again. A category that merely doesn't exist answers empty rather than failing, so
  // only transient refusals land here and there is nothing to loop on.
  assert.equal(out.complete, false);
});

test("a refused listing is a failure, not an empty category", async () => {
  // The distinction the API forces on us, measured: a category that doesn't exist answers
  // `categorymembers: []`, while a refused request omits the block entirely. Folding those together
  // is how a wiki having a bad minute becomes a permanently short roster — so a walk that hit one
  // must not be recorded as this week's answer.
  const { deps } = rig(
    { "Category:Items": { pages: ["A"], subcats: ["Category:Empty"] }, "Category:Empty": {} },
    { fail: ["Category:Items"] },
  );

  const out = await exploreCategories(["Category:Items"], deps, 10);

  assert.deepEqual(out.failed, ["Category:Items"]);
  assert.equal(out.complete, false);
});

test("a genuinely empty category is an answer, and doesn't spoil the walk", async () => {
  const { deps } = rig({
    "Category:Items": { pages: ["A"], subcats: ["Category:Empty"] },
    "Category:Empty": {},
  });

  const out = await exploreCategories(["Category:Items"], deps, 10);

  assert.deepEqual(out.titles, ["A"]);
  assert.deepEqual(out.failed, []);
  assert.equal(out.complete, true);
});
