/**
 * page-scripts.mjs — the code that runs *inside* the renderer, and the one-line way to send it there.
 *
 * Each function is plain JavaScript that is stringified and evaluated in the page, so it must be
 * **self-contained**: no imports, and nothing from this module but the three helpers in `PREAMBLE`
 * (`pause`, `gridAt`, `snapshotGrid`), which `inPage` sends along with it. They only *observe and
 * click* — what to make of an observation is decided by pure functions in `checks/grid-judges.mjs`,
 * which are unit-tested; these are proven by running them.
 *
 * Selectors are the ones the real DOM showed (MUI X DataGrid v9 and the app's own tab bar).
 */

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The `index`th data grid showing in the open panel. */
function gridAt(index) {
  return [...document.querySelectorAll(".panel .MuiDataGrid-root")].filter((grid) => grid.offsetParent !== null)[index];
}

/** The first row's text and the pager's label, the two things a page change moves. */
function snapshotGrid(grid) {
  return {
    first: grid.querySelector(".MuiDataGrid-row")?.textContent.trim().slice(0, 80) ?? "",
    label: grid.querySelector(".MuiTablePagination-displayedRows")?.textContent.trim() ?? "",
  };
}

/**
 * The helpers above, as source, put in front of every script sent to the page. The functions below
 * refer to them by name; sent alone, a function would arrive without the things it calls.
 */
const PREAMBLE = [pause, gridAt, snapshotGrid].map(String).join("\n");

/** The expression that calls `fn` in the page with JSON-able `args`. Pair with `session.evaluate`. */
export const inPage = (fn, ...args) => `(() => {\n${PREAMBLE}\nreturn (${fn})(${args.map((a) => JSON.stringify(a)).join(",")});\n})()`;

/** Resolve once the DOM has been quiet for `quietMs`, or after `maxMs` — a live clock never goes quiet. */
export function settleInPage(quietMs, maxMs) {
  return new Promise((resolve) => {
    let timer;
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(true);
    };
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, quietMs);
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
    timer = setTimeout(done, quietMs);
    setTimeout(done, maxMs);
  });
}

/** The labels of a tab row (`.app > .tabs…`), read from its off-screen ghost, which always lists every tab. */
export function tabLabelsInPage(rowSelector) {
  const ghost = document.querySelector(`${rowSelector} > .tab-ghost`);
  if (!ghost) return null;
  const labels = [...ghost.children].map((child) => child.textContent.trim());
  labels.pop(); // the sample "»N" button the ghost carries to measure
  return labels;
}

/**
 * Click the `index`th tab of a row, opening the » menu when the window is too narrow to show it.
 * Returns "clicked", "disabled", or why it could not.
 */
export function clickTabInPage(rowSelector, index) {
  const row = document.querySelector(rowSelector);
  if (!row) return "no such row";
  const visible = [...row.children].filter((child) => child.matches("button.tab"));
  let target = visible[index];
  if (!target) {
    const more = row.querySelector(":scope > .tab-more > button.tab");
    if (!more) return "not shown and no » menu";
    more.click();
    target = [...row.querySelectorAll(":scope > .tab-more .tab-menu-item")][index - visible.length];
    if (!target) return "not in the » menu";
  }
  if (target.disabled) return "disabled";
  target.click();
  return "clicked";
}

/** Which tab of the row is active, by position — `-1` when the active one is folded into the » menu. */
export function activeTabInPage(rowSelector) {
  const row = document.querySelector(rowSelector);
  if (!row) return -2;
  return [...row.children].filter((child) => child.matches("button.tab")).findIndex((button) => button.classList.contains("active"));
}

/** The visible view-switch buttons in the open panel (`.segmented` groups), as labels. */
export function viewLabelsInPage() {
  const labels = [...document.querySelectorAll(".panel .segmented > button, .panel .segmented > [role=tab]")]
    .filter((button) => button.offsetParent !== null && !button.disabled)
    .map((button) => button.textContent.trim())
    .filter(Boolean);
  return [...new Set(labels)];
}

/** Click the visible view-switch button with exactly this label. */
export function clickViewInPage(label) {
  const button = [...document.querySelectorAll(".panel .segmented > button, .panel .segmented > [role=tab]")].find(
    (b) => b.offsetParent !== null && b.textContent.trim() === label,
  );
  if (!button) return false;
  button.click();
  return true;
}

/** What is wrong with the screen right now that no console message would say: a crash boundary showing. */
export function crashShownInPage() {
  const crash = document.querySelector(".crash");
  return crash ? crash.textContent.trim().slice(0, 160) : null;
}

/** How many data grids are showing in the panel, and what each one's columns are called. */
export function gridsInPage() {
  return [...document.querySelectorAll(".panel .MuiDataGrid-root")]
    .filter((grid) => grid.offsetParent !== null)
    .map((grid) => [...grid.querySelectorAll(".MuiDataGrid-columnHeader")].map((header) => header.getAttribute("data-field")));
}

/** Open the column menu of the `nth` header of `kind` ("text" | "number") that has one, and read it. */
export async function observeColumnMenuInPage(gridIndex, kind, nth) {
  const grid = gridAt(gridIndex);
  if (!grid) return { error: "grid not found" };
  const header = [...grid.querySelectorAll(".MuiDataGrid-columnHeader")].filter((h) => {
    const numeric = h.classList.contains("MuiDataGrid-columnHeader--numeric");
    return (kind === "number" ? numeric : !numeric) && h.querySelector(".MuiDataGrid-menuIcon button");
  })[nth];
  if (!header) return { error: `no ${kind} column with a menu button in view` };
  header.querySelector(".MuiDataGrid-menuIcon button").click();
  await pause(350);
  const items = [...document.querySelectorAll("[role=menu] [role=menuitem]")];
  const menuItems = items.map((item) => item.textContent.trim());
  const filter = items.find((item) => /^filter/i.test(item.textContent.trim()));
  let filterOperator = null;
  if (filter) {
    filter.click();
    await pause(500);
    filterOperator = document.querySelector(".MuiDataGrid-filterFormOperatorInput [role=combobox]")?.textContent.trim() ?? null;
  }
  return { kind, field: header.getAttribute("data-field"), menuItems, filterOperator };
}

/** Open Manage columns from any header's menu and list every column with whether it is ticked. */
export async function observeManageColumnsInPage(gridIndex) {
  const grid = gridAt(gridIndex);
  if (!grid) return { error: "grid not found" };
  const header = [...grid.querySelectorAll(".MuiDataGrid-columnHeader")].find((h) => h.querySelector(".MuiDataGrid-menuIcon button"));
  if (!header) return { error: "no header with a menu button in view" };
  header.querySelector(".MuiDataGrid-menuIcon button").click();
  await pause(350);
  const manage = [...document.querySelectorAll("[role=menuitem]")].find((item) => /manage columns/i.test(item.textContent));
  if (!manage) return { error: "the column menu has no Manage columns" };
  manage.click();
  await pause(600);
  const panel = document.querySelector(".MuiDataGrid-columnsManagement");
  if (!panel) return { error: "Manage columns did not open a panel" };
  const columns = [...panel.querySelectorAll("label")].map((label) => ({
    label: label.textContent.trim(),
    checked: Boolean(label.querySelector("input")?.checked),
  }));
  return { columns };
}

/** The pager: whether there is one, its "1–25 of 300" text, the current page size, and every size offered. */
export async function observePagerInPage(gridIndex) {
  const grid = gridAt(gridIndex);
  const pager = grid?.querySelector(".MuiTablePagination-root");
  if (!pager) return { present: false };
  const select = pager.querySelector("[role=combobox]");
  const displayed = pager.querySelector(".MuiTablePagination-displayedRows")?.textContent.trim() ?? "";
  const current = select?.textContent.trim() ?? "";
  let options = [];
  if (select) {
    select.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await pause(400);
    options = [...document.querySelectorAll("[role=option]")].map((option) => option.textContent.trim());
  }
  const footer = grid.querySelector(".MuiDataGrid-footerContainer")?.getBoundingClientRect();
  return { present: true, displayed, current, options, footerInViewport: Boolean(footer) && footer.bottom <= window.innerHeight + 1 && footer.top >= 0 };
}

/**
 * Next page, back, and a different page size — what the manual checklist's "the ▶ arrow actually
 * moves" asks. Starts from whatever page size the grid opened on, and puts nothing back: the caller
 * leaves the view when it is done.
 */
export async function observePagingInPage(gridIndex) {
  const grid = gridAt(gridIndex);
  if (!grid) return { error: "grid not found" };
  const button = (name) => grid.querySelector(`.MuiTablePagination-actions button[aria-label="Go to ${name} page"]`);
  const start = snapshotGrid(grid);
  if (!button("next") || button("next").disabled) return { error: "only one page of rows, nothing to page through", start };
  button("next").click();
  await pause(1200);
  const next = snapshotGrid(grid);
  button("previous")?.click();
  await pause(1200);
  const back = snapshotGrid(grid);
  // A different page size: the smallest option that is not the current one.
  const select = grid.querySelector(".MuiTablePagination-root [role=combobox]");
  const current = Number(select?.textContent.trim());
  select?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await pause(400);
  const sizes = [...document.querySelectorAll("[role=option]")].map((option) => Number(option.textContent.trim())).filter(Number.isFinite);
  const chosen = Math.min(...sizes.filter((size) => size !== current));
  [...document.querySelectorAll("[role=option]")].find((option) => Number(option.textContent.trim()) === chosen)?.click();
  await pause(1200);
  const resized = snapshotGrid(grid);
  return { start, next, back, resized, current, chosen };
}

/**
 * Sort a column by clicking its header, step to the next page, and see whether the sort and the page
 * both held — the regression where an unstable `sortModel` made every page click re-sort and snap
 * back to page 1. Also whether sorting while on page 2 returns to page 1.
 */
export async function observeSortThenPageInPage(gridIndex) {
  const grid = gridAt(gridIndex);
  if (!grid) return { error: "grid not found" };
  const header = [...grid.querySelectorAll(".MuiDataGrid-columnHeader--sortable")].find(
    (h) => h.querySelector(".MuiDataGrid-columnHeaderTitleContainer") && !h.classList.contains("MuiDataGrid-columnHeader--numeric"),
  );
  if (!header) return { error: "no sortable text column in view" };
  const field = header.getAttribute("data-field");
  const headerNow = () => grid.querySelector(`.MuiDataGrid-columnHeader[data-field="${field}"]`);
  headerNow().querySelector(".MuiDataGrid-columnHeaderTitleContainer").click();
  await pause(1200);
  const sorted = { ...snapshotGrid(grid), sort: headerNow().getAttribute("aria-sort") };
  const next = grid.querySelector('.MuiTablePagination-actions button[aria-label="Go to next page"]');
  if (!next || next.disabled) return { error: "only one page of rows, nothing to page through", sorted };
  next.click();
  await pause(1500);
  const paged = { ...snapshotGrid(grid), sort: headerNow().getAttribute("aria-sort") };
  // Sort the other way while on page 2: a re-sort changes every page, so it should land on page 1.
  headerNow().querySelector(".MuiDataGrid-columnHeaderTitleContainer").click();
  await pause(1200);
  const resorted = { ...snapshotGrid(grid), sort: headerNow().getAttribute("aria-sort") };
  return { field, sorted, paged, resorted };
}
