import { test } from "node:test";
import assert from "node:assert/strict";

import {
  judgeColumnMenu,
  judgeColumnMenus,
  judgeFooterVisible,
  judgeManageColumns,
  judgePager,
  judgePaging,
  judgeSortThenPage,
  parseDisplayed,
  rollUp,
} from "./grid-judges.mjs";

test("the pager's range is read, thousands separators and all", () => {
  assert.deepEqual(parseDisplayed("26–50 of 300"), { from: 26, to: 50, of: 300 });
  assert.deepEqual(parseDisplayed("1–25 of 12,077"), { from: 1, to: 25, of: 12077 });
  assert.deepEqual(parseDisplayed("0–0 of 0"), { from: 0, to: 0, of: 0 });
  assert.equal(parseDisplayed("Rows per page"), undefined);
  assert.equal(parseDisplayed(undefined), undefined);
});

const menu = (over = {}) => ({
  kind: "text",
  field: "faction",
  menuItems: ["Sort by ASC", "Sort by DESC", "Filter", "Hide column", "Manage columns"],
  filterOperator: "contains",
  ...over,
});

test("a column menu with Sort and a text filter is right", () => {
  assert.equal(judgeColumnMenu(menu()).ok, true);
});

test("the direction a column is already sorted in shows as Unsort, and that still counts as sortable both ways", () => {
  const sortedAscending = menu({ menuItems: ["Sort by DESC", "Unsort", "Filter", "Hide column", "Manage columns"] });
  const sortedDescending = menu({ menuItems: ["Sort by ASC", "Unsort", "Filter", "Hide column", "Manage columns"] });
  assert.equal(judgeColumnMenu(sortedAscending).ok, true);
  assert.equal(judgeColumnMenu(sortedDescending).ok, true);
});

test("a menu offering only one direction and no Unsort cannot sort both ways", () => {
  assert.equal(judgeColumnMenu(menu({ menuItems: ["Sort by ASC", "Filter"] })).ok, false);
  assert.equal(judgeColumnMenu(menu({ menuItems: ["Filter", "Hide column"] })).ok, false);
});

test("a number column's filter must open on a comparison, a text column's on contains", () => {
  assert.equal(judgeColumnMenu(menu({ kind: "number", filterOperator: "=" })).ok, true);
  assert.equal(judgeColumnMenu(menu({ kind: "number", filterOperator: "contains" })).ok, false);
  assert.equal(judgeColumnMenu(menu({ kind: "text", filterOperator: ">" })).ok, false);
});

test("a column with no Filter at all is fine on its own — a timestamp has none", () => {
  const timestamp = judgeColumnMenu(menu({ menuItems: ["Sort by ASC", "Unsort", "Hide column", "Manage columns"], filterOperator: null }));
  assert.equal(timestamp.ok, true);
  assert.equal(timestamp.filter, false);
});

test("across several columns: all must sort, and at least one must offer a Filter", () => {
  const noFilter = menu({ menuItems: ["Sort by ASC", "Sort by DESC"], filterOperator: null });
  assert.equal(judgeColumnMenus("text", [noFilter, menu()]).ok, true);
  assert.equal(judgeColumnMenus("text", [noFilter, noFilter]).ok, false, "a table whose every column lost its Filter");
  assert.equal(judgeColumnMenus("text", [menu(), menu({ menuItems: ["Filter"] })]).ok, false, "one column that cannot sort");
});

test("a grid paged on the server offers no Filter at all, and one that grows a Filter is caught", () => {
  const sortOnly = menu({ menuItems: ["Sort by ASC", "Sort by DESC", "Hide column"], filterOperator: null });
  assert.equal(judgeColumnMenus("text", [sortOnly, sortOnly], { filter: "absent" }).ok, true);
  const grew = judgeColumnMenus("text", [sortOnly, menu()], { filter: "absent" });
  assert.equal(grew.ok, false);
  assert.match(grew.evidence[0], /paged on the server/);
  assert.equal(judgeColumnMenus("text", [menu({ menuItems: ["Filter"] })], { filter: "absent" }).ok, false, "it must still sort");
});

test("a kind with no column in view is a failure only when there were none at all", () => {
  assert.equal(judgeColumnMenus("text", [menu(), { error: "no text column with a menu button in view" }]).ok, true);
  const none = judgeColumnMenus("text", [{ error: "no text column with a menu button in view" }]);
  assert.equal(none.ok, false);
  assert.match(none.evidence[0], /no text column/);
});

const pager = (over = {}) => ({ present: true, displayed: "1–25 of 300", current: "25", options: ["10", "25", "50", "100"], ...over });

test("a pager with a range and a choice of sizes is right", () => {
  assert.equal(judgePager(pager()).ok, true);
});

test("no pager, an unreadable range, too few sizes, or a current size not on offer are each wrong", () => {
  assert.equal(judgePager({ present: false }).ok, false);
  assert.equal(judgePager(pager({ displayed: "" })).ok, false);
  assert.equal(judgePager(pager({ options: ["25"] })).ok, false);
  assert.equal(judgePager(pager({ current: "7" })).ok, false);
});

test("a footer pushed past the window is wrong", () => {
  assert.equal(judgeFooterVisible({ footerInViewport: true }).ok, true);
  assert.equal(judgeFooterVisible({ footerInViewport: false }).ok, false);
});

const columns = (...pairs) => ({ columns: pairs.map(([label, checked]) => ({ label, checked })) });

test("Manage columns must offer the promised extras, unticked", () => {
  const facts = columns(["Time", true], ["Faction", true], ["Raw line", false]);
  assert.equal(judgeManageColumns(facts, [/raw line/i]).ok, true);
  assert.equal(judgeManageColumns(facts, [/corrected total/i]).ok, false);
});

test("an extra that is ticked by default is not an extra", () => {
  assert.equal(judgeManageColumns(columns(["Raw line", true], ["Time", true]), [/raw line/i]).ok, false);
});

test("with no extras promised, at least one unticked column must exist", () => {
  assert.equal(judgeManageColumns(columns(["A", true], ["B", false])).ok, true);
  assert.equal(judgeManageColumns(columns(["A", true], ["B", true])).ok, false);
  assert.equal(judgeManageColumns({ error: "Manage columns did not open a panel" }).ok, false);
});

const paging = (over = {}) => ({
  start: { first: "Nov 9 Karana +5", label: "1–50 of 80" },
  next: { first: "Nov 9 Coalition +3", label: "51–80 of 80" },
  back: { first: "Nov 9 Karana +5", label: "1–50 of 80" },
  resized: { first: "Nov 9 Karana +5", label: "1–10 of 80" },
  current: 50,
  chosen: 10,
  ...over,
});

test("a working ▶ ◀ and page-size change is right", () => {
  const v = judgePaging(paging());
  assert.equal(v.ok, true);
});

test("the regression: ▶ that quietly snaps back to page 1 is caught", () => {
  const stuck = judgePaging(paging({ next: { first: "Nov 9 Karana +5", label: "1–50 of 80" } }));
  assert.equal(stuck.ok, false);
  assert.match(stuck.evidence.join(" "), /▶ left the pager at "1–50 of 80"/);
  assert.match(stuck.evidence.join(" "), /did not change the first row/);
});

test("a ◀ that does not return to the first page is caught", () => {
  assert.equal(judgePaging(paging({ back: { first: "Nov 9 Coalition +3", label: "51–80 of 80" } })).ok, false);
});

test("a page-size choice that changes nothing is caught, and one larger than the data is still right", () => {
  assert.equal(judgePaging(paging({ resized: { first: "x", label: "1–50 of 80" } })).ok, false);
  assert.equal(judgePaging(paging({ resized: { first: "x", label: "1–5 of 5" }, chosen: 10 })).ok, true);
});

test("a grid with a single page has nothing to page through, and says so", () => {
  const v = judgePaging({ error: "only one page of rows, nothing to page through" });
  assert.equal(v.ok, false);
});

const sortPage = (over = {}) => ({
  field: "name",
  sorted: { first: "Zraxthril", label: "1–25 of 300", sort: "descending" },
  paged: { first: "Yalroens Head", label: "26–50 of 300", sort: "descending" },
  resorted: { first: "10 Dose", label: "1–25 of 300", sort: "ascending" },
  ...over,
});

test("sort then page, with the sort kept and the page advanced, is right", () => {
  assert.equal(judgeSortThenPage(sortPage()).ok, true);
});

test("a page click that resets to page 1 after a sort is caught", () => {
  const v = judgeSortThenPage(sortPage({ paged: { first: "Zraxthril", label: "1–25 of 300", sort: "descending" } }));
  assert.equal(v.ok, false);
  assert.match(v.evidence.join(" "), /snapped back/);
});

test("a sort lost by paging, or a re-sort that stays on page 2, is caught", () => {
  assert.equal(judgeSortThenPage(sortPage({ paged: { first: "Yalroens", label: "26–50 of 300", sort: "none" } })).ok, false);
  assert.equal(judgeSortThenPage(sortPage({ resorted: { first: "x", label: "26–50 of 300", sort: "ascending" } })).ok, false);
});

test("a roll-up fails on any failure, skips when nothing ran, and otherwise passes with a count", () => {
  const grid = (status, name) => ({ grid: name, status, evidence: ["e"] });
  assert.equal(rollUp("pager", [grid("pass", "A"), grid("fail", "B")]).status, "fail");
  assert.match(rollUp("pager", [grid("pass", "A"), grid("fail", "B")]).summary, /1 of 2 failed: B/);
  assert.equal(rollUp("pager", [grid("skip", "A")]).status, "skip");
  assert.equal(rollUp("pager", []).status, "skip");
  const ok = rollUp("pager", [grid("pass", "A"), grid("pass", "B"), grid("skip", "C")]);
  assert.equal(ok.status, "pass");
  assert.match(ok.summary, /2 grids, 1 not applicable/);
});
