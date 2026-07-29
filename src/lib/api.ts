import type { EqlApi } from "@/shared/types";

/**
 * The preload bridge lives on `window.eql` (see electron/preload.ts). It's absent
 * during Next's static prerender and in a plain browser, so always go through
 * `api()` and handle null — callers simply no-op when there's no Electron host.
 */
declare global {
  interface Window {
    eql?: EqlApi;
  }
}

export function api(): EqlApi | null {
  return typeof window !== "undefined" && window.eql ? window.eql : null;
}

/**
 * Clear everything the app calls "this session" — one tracker now owns all of it
 * (see ADR 0019), so both "reset" buttons can only ever mean the same thing.
 */
export function resetSession(): void {
  void api()?.combat.reset();
}
