/**
 * error-reporting.ts — renderer errors go to the log, never onto the screen.
 *
 * Next's dev error overlay paints a full-viewport black backdrop and takes focus. In a
 * browser tab that's a debugging aid; here every window is frameless, transparent and
 * always-on-top over the game, so a stray error blacks out the monitor mid-fight. The
 * overlay is hidden outright (`HIDE_DEV_OVERLAY` in electron/windows.ts) and this is what
 * replaces it: errors are logged instead.
 *
 * `warn`/`error` are never gated, so this reaches the debug log without the debug
 * setting on — the renderer console is piped into the main process (`pipeRendererConsole`
 * in electron/windows.ts), which mirrors it to the file behind tray → "Open debug log".
 */
import { createLogger } from "@/shared/logging";

const log = createLogger("renderer");

let installed = false;

/**
 * Route uncaught errors and rejected promises to the log. Safe to call from every window
 * and more than once — React's StrictMode double-mounts, and a second listener would just
 * log everything twice.
 */
export function installErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // `error` also fires for failed <img>/<script> loads, where there's no Error to unwrap —
  // hence the message fallback.
  window.addEventListener("error", (e) => log.error("uncaught", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => log.error("unhandled rejection", e.reason));
}

/** Report an error a React boundary caught, tagged with the window it came from. */
export function reportCrash(where: string, error: Error & { digest?: string }): void {
  log.error(`crash in ${where}`, error);
}
