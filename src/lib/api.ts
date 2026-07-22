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
