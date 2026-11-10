/**
 * faults.mjs — deliberate breakage, so each check can be shown to go red.
 *
 * A suite that cannot fail is worth nothing, and "it passed" proves nothing until you have seen it
 * not pass. `npm run smoke -- --inject-fault <name>` breaks one thing from *inside the suite* — never by
 * editing the app — and the check that owns it must then fail. Faults are applied by the checks (each
 * names the ones it honours); this file is only the list, the parser, and the page-side injectors.
 *
 *   --inject-fault console-error,no-pager      (comma-separated)
 */
export const FAULTS = {
  "console-error": "write a console.error in the page while the sweep is on Character → Faction (sweep: page errors must fail)",
  exception: "throw an uncaught exception in the page while the sweep is on Character → Faction (sweep: page errors must fail)",
  "broken-text": "put the word NaN on screen while the sweep is on Character → Faction (sweep: broken values must fail)",
  "crash-shown": "put a crash boundary on screen while the sweep is on Character → Faction (sweep: every section must fail)",
  "no-pager": "remove Faction Standings' pager footer before it is checked (grid: pager footer must fail)",
  "arrow-stuck": "swallow the click on Faction Hits' ▶ arrow, as the unstable sortModel did (faction hits: paging must fail)",
  "skip-flush": "end the app with no chance to save instead of quitting it (persistence and session-end must fail)",
  "hang-main": "freeze the app's main process part-way through the IPC fuzz (ipc-fuzz must fail)",
};

/** `"a,b"` → a Set of fault names; an unknown name is an error, since a typo would otherwise "pass". */
export function parseFaults(text) {
  const names = String(text ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const unknown = names.filter((name) => !Object.hasOwn(FAULTS, name));
  if (unknown.length) throw new Error(`unknown fault ${unknown.join(", ")} — known: ${Object.keys(FAULTS).join(", ")}`);
  return new Set(names);
}

// --- page-side injectors (run through `driver.run`, so self-contained) ----------------------------

function consoleErrorInPage() {
  console.error("smoke: injected console error");
}

function exceptionInPage() {
  setTimeout(() => {
    throw new Error("smoke: injected uncaught exception");
  }, 0);
}

function brokenTextInPage() {
  const note = document.createElement("div");
  note.textContent = "Damage NaN";
  document.querySelector(".panel").appendChild(note);
}

function crashBoundaryInPage() {
  const crash = document.createElement("div");
  crash.className = "crash";
  crash.textContent = "Something went wrong in the Faction tab. (injected by the smoke suite)";
  document.querySelector(".panel").appendChild(crash);
}

function removePagerInPage() {
  document.querySelectorAll(".panel .MuiTablePagination-root").forEach((pager) => pager.remove());
}

/** Swallow the next-page click before React sees it: the page cannot advance, as with the old sortModel bug. */
function stickNextArrowInPage() {
  const next = document.querySelector('.panel .MuiTablePagination-actions button[aria-label="Go to next page"]');
  next?.addEventListener("click", (event) => event.stopImmediatePropagation(), true);
}

export const injectConsoleError = (driver) => driver.run(consoleErrorInPage);
export const injectException = (driver) => driver.run(exceptionInPage);
export const injectBrokenText = (driver) => driver.run(brokenTextInPage);
export const injectCrashBoundary = (driver) => driver.run(crashBoundaryInPage);
export const injectNoPager = (driver) => driver.run(removePagerInPage);
export const injectStuckArrow = (driver) => driver.run(stickNextArrowInPage);
