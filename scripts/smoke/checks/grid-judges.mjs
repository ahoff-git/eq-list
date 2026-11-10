/**
 * grid-judges.mjs — deciding whether what the page showed is right, for the data grids.
 *
 * Pure. `lib/page-scripts.mjs` observes the real DOM and hands back plain facts; these functions turn a
 * fact into `{ ok, evidence }`. They hold the rules `specs/testing/manual-qa.md` used to ask a person to
 * check by eye (ADRs 0230, 0232, 0234, 0249, 0251), and grid-judges.test.mjs pins each one — including
 * the facts a *broken* grid would produce, so a judge that can no longer say no is caught.
 */

const verdict = (ok, ...evidence) => ({ ok, evidence: evidence.filter(Boolean) });

/** `"26–50 of 300"` → `{ from: 26, to: 50, of: 300 }`, or `undefined` when it is not that shape. */
export function parseDisplayed(text) {
  const match = /^(\d[\d,]*)\s*[–-]\s*(\d[\d,]*)\s+of\s+(\d[\d,]*)$/.exec(text ?? "");
  if (!match) return /^0\s*[–-]\s*0\s+of\s+0$/.test(text ?? "") ? { from: 0, to: 0, of: 0 } : undefined;
  const [from, to, of] = match.slice(1).map((n) => Number(n.replace(/,/g, "")));
  return { from, to, of };
}

const NUMERIC_OPERATOR = /^(=|!=|>|>=|<|<=)$/;

/**
 * One column's menu. It must offer a way to sort both ways, except that the direction a column is
 * already sorted in is shown as "Unsort" in its place (a column opening on A→Z offers Sort by DESC and
 * Unsort, not Sort by ASC). A Filter, where the column has one, must open on an operator that suits the
 * column: "contains" for a name, a comparison for a number (ADR 0230). A column may have no Filter at all
 * — a timestamp, a quantity — so that is reported here, not failed; `judgeColumnMenus` asks that *some*
 * column of the kind offers one.
 */
export function judgeColumnMenu(facts) {
  const has = (pattern) => facts.menuItems.some((item) => pattern.test(item));
  const asc = has(/^sort by asc/i);
  const desc = has(/^sort by desc/i);
  const unsort = has(/^unsort/i);
  const sorts = (asc || desc) && (asc || unsort) && (desc || unsort);
  const filter = has(/^filter/i);
  const operatorSuits = facts.kind === "number" ? NUMERIC_OPERATOR.test(facts.filterOperator ?? "") : /contains/i.test(facts.filterOperator ?? "");
  const suits = !filter || operatorSuits;
  const offers = facts.menuItems.join(" / ") || "nothing";
  let evidence;
  if (!sorts) evidence = `${facts.field}: cannot be sorted both ways — it offers ${offers}`;
  else if (!suits) evidence = `${facts.field}: a ${facts.kind} column's filter opens on "${facts.filterOperator}"; it offers ${offers}`;
  else if (filter) evidence = `${facts.field}: ${offers}; filter opens on "${facts.filterOperator}"`;
  else evidence = `${facts.field}: ${offers} (no Filter on this column)`;
  return { sorts, filter, ok: sorts && suits, evidence };
}

/**
 * Several columns of one kind. Every one must sort and none may open its filter on the wrong operator;
 * at least one must offer a Filter at all (some columns are deliberately not filterable) — or, with
 * `{ filter: "absent" }`, none may. An `error` entry means there was no such column in view, which is
 * only a problem if there were none at all.
 */
export function judgeColumnMenus(kind, factsList, { filter = "offered" } = {}) {
  const observed = factsList.filter((facts) => !facts.error);
  if (!observed.length) return verdict(false, factsList[0]?.error ?? `no ${kind} column with a menu button in view`);
  const judged = observed.map(judgeColumnMenu);
  const problems = judged.filter((j) => !j.ok).map((j) => j.evidence);
  if (problems.length) return verdict(false, ...problems);
  const evidence = judged.map((j) => j.evidence);
  if (filter === "absent") {
    // A grid paged on the server cannot filter what it has not fetched (Loot Drops, ADR 0250/0251): the
    // menu must not offer a Filter that would quietly narrow only the page on screen.
    const offered = judged.filter((j) => j.filter).length;
    return offered ? verdict(false, `${offered} of ${judged.length} ${kind} columns offer a Filter on a grid that is paged on the server`, ...evidence) : verdict(true, ...evidence);
  }
  if (!judged.some((j) => j.filter)) return verdict(false, `none of ${judged.length} ${kind} columns offers a Filter`, ...evidence);
  return verdict(true, ...evidence);
}

/** There is a footer with the page range and a rows-per-page choice of at least three sizes (ADR 0249). */
export function judgePager(facts) {
  if (!facts.present) return verdict(false, "no pager footer");
  if (!parseDisplayed(facts.displayed)) return verdict(false, `the pager reads "${facts.displayed}", not "1–25 of N"`);
  const sizes = facts.options.map(Number).filter(Number.isFinite);
  if (sizes.length < 3) return verdict(false, `rows per page offers ${JSON.stringify(facts.options)}`);
  if (!sizes.includes(Number(facts.current))) return verdict(false, `rows per page shows ${facts.current}, which is not among ${sizes.join("/")}`);
  return verdict(true, `${facts.displayed}; rows per page ${sizes.join("/")}`);
}

/** A grid that fills the window keeps its footer on screen rather than pushing it past the bottom (ADR 0248). */
export function judgeFooterVisible(facts) {
  return facts.footerInViewport ? verdict(true, "footer on screen") : verdict(false, "the pager footer is outside the window");
}

/**
 * Manage columns lists the columns the default view does not show (ADR 0251). `expected` names the
 * extras the checklist promises, as patterns; each must exist and be unticked. With none named, at
 * least one unticked column must exist.
 */
export function judgeManageColumns(facts, expected = []) {
  if (facts.error) return verdict(false, facts.error);
  const unchecked = facts.columns.filter((c) => !c.checked);
  const absent = expected.filter((pattern) => !unchecked.some((c) => pattern.test(c.label)));
  if (absent.length) return verdict(false, `expected unticked: ${absent.map(String).join(", ")}; unticked are ${unchecked.map((c) => c.label).join(", ") || "none"}`);
  if (!unchecked.length) return verdict(false, "every column is already ticked, so there is nothing extra to offer");
  const shown = unchecked.slice(0, 6).map((c) => c.label).join(", ");
  return verdict(true, `${unchecked.length} unticked of ${facts.columns.length} (${shown}${unchecked.length > 6 ? ", …" : ""})`);
}

const startOf = (label) => parseDisplayed(label)?.from;

/**
 * The ▶ arrow moves to a different set of rows, ◀ comes back to the first, and a new page size
 * changes how many a page shows (ADR 0232/0234). Judged on the *first row* and the pager's own range,
 * because that is what the regression broke: a grid that quietly re-sorted on every page click showed
 * the same first page however often the arrow was pressed.
 */
export function judgePaging(facts) {
  if (facts.error) return verdict(false, facts.error);
  const { start, next, back, resized, chosen } = facts;
  const problems = [];
  if (!(startOf(next.label) > 1)) problems.push(`▶ left the pager at "${next.label}" (was "${start.label}")`);
  if (next.first === start.first) problems.push(`▶ did not change the first row ("${start.first}")`);
  if (back.first !== start.first || startOf(back.label) !== 1) problems.push(`◀ did not return to the first page ("${back.label}", first row "${back.first}")`);
  const shown = parseDisplayed(resized.label);
  const expectedTo = shown ? Math.min(chosen, shown.of) : undefined;
  if (!shown || shown.from !== 1 || shown.to !== expectedTo) problems.push(`choosing ${chosen} rows per page left the pager at "${resized.label}"`);
  return problems.length ? verdict(false, ...problems) : verdict(true, `▶ "${start.label}" → "${next.label}" and back; ${chosen} per page → "${resized.label}"`);
}

/**
 * Sort a column, then page: the sort survives the page click and the page actually advances; and
 * sorting again from page 2 goes back to page 1 (a re-sort changes what is on every page).
 */
export function judgeSortThenPage(facts) {
  if (facts.error) return verdict(false, facts.error);
  const { sorted, paged, resorted } = facts;
  const problems = [];
  if (!/^(ascending|descending)$/.test(sorted.sort ?? "")) problems.push(`clicking the header left it "${sorted.sort}"`);
  if (!(startOf(paged.label) > 1)) problems.push(`after sorting, ▶ left the pager at "${paged.label}" — the page snapped back`);
  if (paged.first === sorted.first) problems.push(`after sorting, ▶ did not change the first row`);
  if (paged.sort !== sorted.sort) problems.push(`paging changed the sort from ${sorted.sort} to ${paged.sort}`);
  if (startOf(resorted.label) !== 1) problems.push(`sorting from page 2 left the pager at "${resorted.label}" instead of page 1`);
  return problems.length ? verdict(false, ...problems) : verdict(true, `${facts.field} ${sorted.sort}: "${sorted.label}" → "${paged.label}"; re-sort → "${resorted.label}"`);
}

/**
 * Many per-grid verdicts, one table-wide result: a failure anywhere is a failure, a run in which no
 * grid could be asserted on is a skip (not a pass), and anything else passes with how many it covered.
 */
export function rollUp(label, perGrid) {
  const ran = perGrid.filter((r) => r.status !== "skip");
  const failed = ran.filter((r) => r.status === "fail");
  const evidence = perGrid.map((r) => `${r.status.toUpperCase().padEnd(4)} ${r.grid}: ${r.evidence.join("; ")}`);
  if (failed.length) return { status: "fail", summary: `${failed.length} of ${ran.length} failed: ${failed.map((r) => r.grid).join(", ")}`, evidence };
  if (!ran.length) return { status: "skip", summary: `no ${label} grid had anything to assert on`, evidence };
  const skipped = perGrid.length - ran.length;
  return { status: "pass", summary: `${ran.length} grid${ran.length === 1 ? "" : "s"}${skipped ? `, ${skipped} not applicable` : ""}`, evidence };
}
