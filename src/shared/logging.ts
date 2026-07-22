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

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogSink = (level: LogLevel, parts: unknown[]) => void;

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
    (console[level] ?? console.log)(tag, ...args);
    sink?.(level, [tag, ...args]);
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
