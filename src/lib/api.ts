import type { EqlApi } from "@/shared/types";
import { getWebApi } from "@/lib/web-api";

/**
 * The preload bridge lives on `window.eql` (see electron/preload.ts). It's absent during Next's
 * static prerender (no `window` at all — `api()` returns `null`) and in a plain browser, where
 * `api()` falls back to the web implementation (`src/lib/web-api.ts`) instead of `window.eql` —
 * itself a real `EqlApi`, so every existing `api()?.foo()` call site keeps working unchanged.
 * `EqlApi.platform.capabilities` is what tells a caller which host it got.
 */
declare global {
  interface Window {
    eql?: EqlApi;
  }
}

export function api(): EqlApi | null {
  if (typeof window === "undefined") return null;
  return window.eql ?? getWebApi();
}

/**
 * Clear everything the app calls "this session" — one tracker now owns all of it
 * (see ADR 0019), so both "reset" buttons can only ever mean the same thing.
 */
export function resetSession(): void {
  void api()?.combat.reset();
}
