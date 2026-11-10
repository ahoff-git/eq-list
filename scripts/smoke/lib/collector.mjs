/**
 * collector.mjs — listening to a window for the things it reports going wrong.
 *
 * `attach` subscribes to a page's console errors, uncaught exceptions and error-level log entries
 * (findings.mjs decides what counts), and stamps each with where in the sweep it happened: the
 * sweep calls `step()` as it moves, so "TypeError in Now → Buffs" is something a report can say.
 *
 * Chrome keeps the console messages and exceptions a page produced before anyone was listening, and
 * `Runtime.enable` replays them, so attaching *after* the window has loaded still catches its startup.
 */
import { findingFromEvent } from "./findings.mjs";

const EVENTS = ["Runtime.consoleAPICalled", "Runtime.exceptionThrown", "Log.entryAdded"];

export function createCollector() {
  let where = "startup";
  const findings = [];

  return {
    findings,
    /** The sweep step now under way. */
    step(label) {
      where = label;
    },
    /** Start listening to a page. `name` prefixes the step for windows other than the control window. */
    async attach(session, name = "") {
      for (const method of EVENTS) {
        session.on(method, (params) => {
          const finding = findingFromEvent(method, params);
          if (finding) findings.push({ ...finding, where: name ? `[${name}] ${where}` : where });
        });
      }
      await session.send("Runtime.enable");
      await session.send("Log.enable");
    },
  };
}
