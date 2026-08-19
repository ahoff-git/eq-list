"use client";
import { api } from "./api";
import type { KillEmphasis, MapTarget } from "@/shared/types";

/**
 * showOnMap.ts — "show me that on the map", from anywhere in the app.
 *
 * Every window that lists a place ends up wanting the same two gestures, and before this each one
 * wrote them out again: a **click** that opens the map somewhere, and a **hover** that rings a mob's
 * kills on a map that's already open. Six components had their own copy of
 * `api()?.map.emphasize(mob ? { mobs: [mob] } : null)`, and four had their own argument order for
 * `openAt`. Neither is hard; both are the shape where the seventh copy quietly disagrees with the
 * six — a forgotten `null` on the way out leaves the map lit up with nothing pointing at it.
 *
 * The two gestures behave differently on purpose, and that difference is the reason they live
 * together where it can be stated once:
 *
 *   - a **click opens the map**, because you asked for it;
 *   - a **hover never does** — a window that appears because the cursor crossed a name is a window
 *     nobody asked for — so `ringMob` is silently ignored unless the map is already up
 *     ([ADR 0104](../../specs/decisions/0104-a-position-is-read-and-arrives-with-its-evidence.md)
 *     and the map spec's emphasis rules).
 *
 * `api()` is null during prerender and in a plain browser, so every call here is a no-op rather
 * than a crash — which is what lets a component call them without guarding.
 */

/** Open (or focus) the map window, with nothing to say about where to look. */
export function openMapWindow(): void {
  void api()?.map.open();
}

/** Open the map on a target: view its zone, mark its spot, bring up what it is. */
export function showOnMap(target: MapTarget): void {
  void api()?.map.openAt(target.zone, target.loc, target.label, target.focus);
}

/** Pick some kills out on an already-open map. `null` takes the ask back. */
export function ringOnMap(emphasis: KillEmphasis | null): void {
  api()?.map.emphasize(emphasis);
}

/** The common case of the above: one mob's kills, or `null` to stop. */
export function ringMob(mob: string | null): void {
  ringOnMap(mob ? { mobs: [mob] } : null);
}

/**
 * Hover handlers for a row that is *about* a mob: ring its kills while the cursor is on it, and
 * take the ask back on the way out.
 *
 * Spread onto the row (`{...ringOnHover(mob)}`). Every list that has this gesture also keeps a
 * clear on its container as a backstop, because leaving a panel by switching tabs fires no
 * `mouseleave` on the row.
 */
export function ringOnHover(mob: string): { onMouseEnter: () => void; onMouseLeave: () => void } {
  return { onMouseEnter: () => ringMob(mob), onMouseLeave: () => ringMob(null) };
}
