/**
 * chrome.mjs — the app's own navigation table, as the sweep walks it.
 *
 * Read from the compiled main-process build (`src/shared/chrome/areas.ts`) rather than copied, so the
 * sweep visits whatever sections the app has *now*. A section added next month is swept the day it
 * lands, with nobody remembering to add it here.
 */
import { load } from "../../lib/cli.mjs";

const { AREAS, SECTION_NAMES } = load("src/shared/chrome/areas.js");

export { AREAS, SECTION_NAMES };
