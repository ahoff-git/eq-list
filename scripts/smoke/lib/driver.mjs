/**
 * driver.mjs — moving around the control window the way a person does: tabs, view switches, keys.
 *
 * It wraps one page session. Every step is bounded — a click that never lands or a panel that never
 * settles is a *reported* problem, not a script that hangs (an un-timed sweep once did, which looked
 * exactly like the app hanging).
 */
import { sleep } from "./cdp.mjs";
import {
  activeTabInPage,
  clickTabInPage,
  clickViewInPage,
  crashShownInPage,
  inPage,
  settleInPage,
  tabLabelsInPage,
  viewLabelsInPage,
} from "./page-scripts.mjs";

export const AREA_ROW = ".app > .tabs:not(.sections)";
export const SECTION_ROW = ".app > .tabs.sections";

/** How long a step may take before it is a finding, and how long the page gets to go quiet after one. */
const STEP_TIMEOUT_MS = 20_000;
const SETTLE_QUIET_MS = 500;
const SETTLE_MAX_MS = 3500;

export function createDriver(session) {
  /** Run a page script with a step-sized timeout. */
  const run = (fn, ...args) => session.evaluate(inPage(fn, ...args), { timeoutMs: STEP_TIMEOUT_MS });

  const settle = () => session.evaluate(inPage(settleInPage, SETTLE_QUIET_MS, SETTLE_MAX_MS), { timeoutMs: SETTLE_MAX_MS + STEP_TIMEOUT_MS });

  /** A real key press on whatever has focus — what closes a menu or a popover. */
  async function pressEscape() {
    for (const type of ["keyDown", "keyUp"]) {
      await session.send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    }
    await sleep(200);
  }

  /** Click a tab and confirm it took, trying again once: a click can land on a row that is mid-redraw. */
  async function openTab(rowSelector, index) {
    let outcome = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      outcome = await run(clickTabInPage, rowSelector, index);
      if (outcome !== "clicked") return outcome;
      await sleep(250);
      const active = await run(activeTabInPage, rowSelector);
      if (active === index || active === -1) return "clicked"; // -1: the active tab is folded into the » menu
    }
    return `clicked, but tab ${index} never became active`;
  }

  return {
    run,
    settle,
    pressEscape,
    areaLabels: () => run(tabLabelsInPage, AREA_ROW),
    sectionLabels: () => run(tabLabelsInPage, SECTION_ROW),
    /** Go to area `a`'s section `s` (positions in `AREAS`) and let the panel settle. Returns "clicked" or why not. */
    async goTo(a, s) {
      const area = await openTab(AREA_ROW, a);
      if (area !== "clicked") return `area: ${area}`;
      await sleep(200);
      const section = await openTab(SECTION_ROW, s);
      if (section !== "clicked") return `section: ${section}`;
      await settle();
      return "clicked";
    },
    views: () => run(viewLabelsInPage),
    async openView(label) {
      const found = await run(clickViewInPage, label);
      await settle();
      return found;
    },
    crash: () => run(crashShownInPage),
    text: () => session.evaluate("document.body.innerText", { timeoutMs: STEP_TIMEOUT_MS }),
  };
}
