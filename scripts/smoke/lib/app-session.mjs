/**
 * app-session.mjs — attaching to a running instance's control window ready for a check to use.
 */
import { createCollector } from "./collector.mjs";
import { createDriver } from "./driver.mjs";

/**
 * The control window with error collection running (plus the overlay window's, which starts with it),
 * and a driver for moving around. `close()` lets go of every session; it does not touch the app.
 */
export async function attachMain(app) {
  const page = await app.page("");
  const collector = createCollector();
  await collector.attach(page);
  const sessions = [page];
  try {
    const overlay = await app.page("alert", 5000);
    await collector.attach(overlay, "alert");
    sessions.push(overlay);
  } catch {
    /* the overlay window is a sibling, not a precondition */
  }
  return { page, collector, driver: createDriver(page), close: () => sessions.forEach((s) => s.close()) };
}
