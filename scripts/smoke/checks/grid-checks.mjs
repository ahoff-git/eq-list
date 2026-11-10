/**
 * grid-checks.mjs — running the manual checklist's table assertions against a grid that is on screen.
 *
 * Each assertion is a small named function: it asks the page to *observe* (page-scripts.mjs), then
 * hands the facts to a pure judge (grid-judges.mjs) and returns `{ assertion, status, evidence }`.
 * `checkGrid` runs the ones an expectation asks for, in an order that does no damage to the ones after it
 * (menus first, then page-size and sort changes), closing every menu and popover in between.
 */
import {
  gridsInPage,
  observeColumnMenuInPage,
  observeManageColumnsInPage,
  observePagerInPage,
  observePagingInPage,
  observeSortThenPageInPage,
} from "../lib/page-scripts.mjs";
import { injectNoPager, injectStuckArrow } from "../lib/faults.mjs";
import { findGrid } from "./grid-expectations.mjs";
import {
  judgeColumnMenus,
  judgeFooterVisible,
  judgeManageColumns,
  judgePager,
  judgePaging,
  judgeSortThenPage,
} from "./grid-judges.mjs";

const result = (assertion, { ok, evidence }) => ({ assertion, status: ok ? "pass" : "fail", evidence });
const skipped = (assertion, why) => ({ assertion, status: "skip", evidence: [why] });

/** Menus and panels hang off the page until dismissed; the next assertion must start with none open. */
async function dismiss(driver) {
  await driver.pressEscape();
  await driver.pressEscape();
}

/** How many columns of a kind have their menu opened: "a handful" in the checklist's words, kept small for time. */
const MENUS_PER_KIND = 2;

export async function assertColumnMenu(driver, index, kind, { filter = "offered" } = {}) {
  const name = `column menu (${kind})`;
  const factsList = [];
  for (let nth = 0; nth < MENUS_PER_KIND; nth++) {
    const facts = await driver.run(observeColumnMenuInPage, index, kind, nth);
    await dismiss(driver);
    factsList.push(facts);
    if (facts.error) break; // fewer than `MENUS_PER_KIND` columns of this kind are in view
  }
  // A table with no numeric column in view has nothing to say about a numeric filter; that is not a failure.
  if (kind === "number" && factsList[0].error?.startsWith("no number column")) return skipped(name, factsList[0].error);
  return result(name, judgeColumnMenus(kind, factsList, { filter }));
}

export async function assertManageColumns(driver, index, extras) {
  const facts = await driver.run(observeManageColumnsInPage, index);
  await dismiss(driver);
  return result("manage columns", judgeManageColumns(facts, extras));
}

export async function assertPager(driver, index, { fillsPanel, removePager }) {
  if (removePager) await injectNoPager(driver);
  const facts = await driver.run(observePagerInPage, index);
  await dismiss(driver);
  const verdicts = [judgePager(facts)];
  if (fillsPanel && facts.present) verdicts.push(judgeFooterVisible(facts));
  return result("pager footer", { ok: verdicts.every((v) => v.ok), evidence: verdicts.flatMap((v) => v.evidence) });
}

export async function assertPaging(driver, index, { stickArrow }) {
  if (stickArrow) await injectStuckArrow(driver);
  const facts = await driver.run(observePagingInPage, index);
  await dismiss(driver);
  return result("▶ ◀ and rows per page", judgePaging(facts));
}

export async function assertSortThenPage(driver, index) {
  const facts = await driver.run(observeSortThenPageInPage, index);
  await dismiss(driver);
  // One page of rows is not a failure of paging; it means this run's data cannot exercise it.
  if (facts.error?.startsWith("only one page")) return skipped("sort then page", facts.error);
  return result("sort then page", judgeSortThenPage(facts));
}

/**
 * Every assertion an expectation asks for, against the grid it names. Returns a list of
 * `{ assertion, status, evidence }`; a grid that is not showing yields a single result — a skip if the
 * expectation allows it to be absent, a failure if the view was supposed to have one.
 */
export async function checkGrid(driver, expectation, faults) {
  const grids = await driver.run(gridsInPage);
  const index = findGrid(grids, expectation);
  if (index < 0) {
    const why = `no such grid showing (the view has ${grids.length}: ${grids.map((fields) => fields.slice(0, 3).join("/")).join("; ") || "none"})`;
    return [expectation.optional ? skipped("grid present", why) : { assertion: "grid present", status: "fail", evidence: [why] }];
  }
  // Each fault is aimed at one named grid, so a run with several faults still has one cause per red row.
  const ctx = {
    fillsPanel: expectation.fillsPanel,
    removePager: Boolean(expectation.pagerFaultTarget) && faults.has("no-pager"),
    stickArrow: Boolean(expectation.paging) && faults.has("arrow-stuck"),
  };
  const results = [
    { assertion: "grid present", status: "pass", evidence: [`${grids[index].length} columns in view`] },
    await assertColumnMenu(driver, index, "text", { filter: expectation.columnFilter }),
    await assertColumnMenu(driver, index, "number", { filter: expectation.columnFilter }),
    await assertManageColumns(driver, index, expectation.extras),
    await assertPager(driver, index, ctx),
  ];
  if (expectation.paging) results.push(await assertPaging(driver, index, ctx));
  if (expectation.sortThenPage) results.push(await assertSortThenPage(driver, index));
  return results;
}
