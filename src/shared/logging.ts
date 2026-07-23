/**
 * logging.ts — the one place debug logging is defined.
 *
 * Debug logs are OFF by default and easy to switch on, in either process:
 *   - Electron main / Node:  set env  EQL_DEBUG=1   (any non-empty value)
 *   - Renderer (browser):    run in devtools  window.__EQL_DEBUG__ = true
 *                            or persist it:    localStorage.eqlDebug = "1"
 *
 * Usage:
 *   import { createLogger } from "@/shared/logging";
 *   const log = createLogger("log-watcher");
 *   log.debug("tailing", file);      // silent unless debug is enabled
 *   log.warn("fell back to polling"); // warn/error always print
 *
 * Keep this dependency-free so both the main process and the renderer can import it.
 */

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Read the debug flag freshly each call so it can be toggled at runtime. */
function debugEnabled(): boolean {
  // Node / Electron main
  if (typeof process !== "undefined" && process.env) {
    if (process.env.EQL_DEBUG) return true;
    if (process.env.EQL_DEV) return true; // dev runs are verbose by default
  }
  // Renderer — reach these via globalThis so this file also typechecks under a
  // DOM-less lib (the Electron main process build).
  const g = globalThis as {
    __EQL_DEBUG__?: boolean;
    localStorage?: { getItem(key: string): string | null };
  };
  if (g.__EQL_DEBUG__) return true;
  try {
    if (g.localStorage?.getItem("eqlDebug")) return true;
  } catch {
    /* access can throw in some sandboxes; ignore */
  }
  return false;
}

/**
 * Turn renderer debug logging on/off at runtime (the browser gate `debugEnabled`
 * reads). Bridges the tray's "Debug logging" setting to this file's magic flag, so
 * callers never poke `globalThis.__EQL_DEBUG__` by hand.
 */
export function setRendererDebug(enabled: boolean): void {
  (globalThis as { __EQL_DEBUG__?: boolean }).__EQL_DEBUG__ = enabled;
}

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogSink = (level: LogLevel, parts: unknown[]) => void;

/** One log argument → text: strings as-is, Errors as their stack, everything else as JSON. */
function formatPart(p: unknown): string {
  if (typeof p === "string") return p;
  if (p instanceof Error) return p.stack ?? `${p.name}: ${p.message}`;
  try {
    return JSON.stringify(p) ?? String(p);
  } catch {
    return String(p); // circular / non-serializable — best effort
  }
}

/**
 * Render log arguments to a single line. Logging one pre-formatted string (rather than
 * spreading args into console.*) matters because renderer output is bridged to the main
 * process's terminal via Chromium's `console-message`, which stringifies each arg — a
 * spread object arrives as "[object Object]". As JSON it stays readable. Shared by the
 * console call and the file/terminal sinks so every destination reads identically.
 */
export function formatLogParts(parts: unknown[]): string {
  return parts.map(formatPart).join(" ");
}

// An optional extra destination for emitted logs. The main process points this at
// a file so debug output is visible even when there's no terminal (double-click /
// packaged launches). Only whatever passes the console gate reaches the sink.
let sink: LogSink | null = null;
export function setLogSink(fn: LogSink | null): void {
  sink = fn;
}

/** Create a namespaced logger. `debug`/`info` are gated; `warn`/`error` always print. */
export function createLogger(namespace: string): Logger {
  const tag = `[${namespace}]`;
  const write = (level: LogLevel, args: unknown[]) => {
    const parts = [tag, ...args];
    // Use console.log for debug/info so they're visible at devtools' DEFAULT level —
    // console.debug lands in "Verbose", which is hidden unless explicitly enabled. Log a
    // single formatted string (see formatLogParts) so objects survive the renderer→main
    // console bridge instead of flattening to "[object Object]".
    const fn = level === "warn" ? console.warn : level === "error" ? console.error : console.log;
    fn(formatLogParts(parts));
    sink?.(level, parts);
  };
  return {
    debug: (...args) => {
      if (debugEnabled()) write("debug", args);
    },
    info: (...args) => {
      if (debugEnabled()) write("info", args);
    },
    warn: (...args) => write("warn", args),
    error: (...args) => write("error", args),
  };
}
