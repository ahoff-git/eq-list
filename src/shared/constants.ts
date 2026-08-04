/**
 * constants.ts — small shared constants used by both processes.
 */

/**
 * Global hotkey to show/hide the overlay. Works even when the overlay is
 * click-through or unfocused, so it's always possible to dismiss the float.
 * `accelerator` is the Electron globalShortcut form; `label` is for the UI.
 */
/**
 * Interface scale. **100% is full size and the only direction is down**: the app sits on top
 * of the game, where the useful adjustment is "take up less room", never "take up more".
 *
 * Applied as the window's zoom factor rather than a font size — the CSS is px-based
 * throughout, so scaling text alone would leave every padding, icon and border at full size
 * and the layout would come apart. Zoom scales the whole window, which is what "smaller" means
 * here (see ADR 0026).
 */
export const UI_SCALE = { min: 0.6, max: 1, step: 0.05 } as const;

/**
 * The **map window's** range, which unlike the overlay's may go *above* 100%. ADR 0026 capped the
 * scale at full size because an overlay wants to take up less room than the game, not more — but
 * the map is the opposite: it's a picture you lean into, and a dungeon corridor at 100% on a big
 * monitor is smaller than it needs to be.
 */
export const MAP_UI_SCALE = { min: 0.6, max: 2, step: 0.05 } as const;

export type ScaleRange = { min: number; max: number; step: number };

/** Clamp a stored or user-supplied scale into a range, rounded to whole percent. */
export function clampScale(scale: number, range: ScaleRange): number {
  if (!Number.isFinite(scale)) return range.max;
  return Math.min(range.max, Math.max(range.min, Math.round(scale * 100) / 100));
}

/** Clamp into the overlay's range (60%–100%). */
export function clampUiScale(scale: number): number {
  return clampScale(scale, UI_SCALE);
}

export const OVERLAY_HOTKEY = {
  accelerator: "CommandOrControl+Shift+O",
  label: "Ctrl/Cmd+Shift+O",
} as const;

/** Global hotkey to start a screengrab item lookup (region-select → OCR → wiki). */
export const LOOKUP_HOTKEY = {
  accelerator: "CommandOrControl+Shift+L",
  label: "Ctrl/Cmd+Shift+L",
} as const;

// ─── External endpoints ───────────────────────────────────────────────────────
// One home for cross-cutting external URLs so they're named, not sprinkled through
// the code. (The eqlwiki API base lives with its client in `electron/wiki/api.ts`
// as `WIKI_BASE`; the awari bootstrap default lives in `src/lib/awari/net.ts`.)

/** GitHub repository — source of the published installer / releases. */
export const GITHUB_REPO_URL = "https://github.com/ahoff-git/eq-list";
/** Newest release (the landing page's download target). */
export const LATEST_RELEASE_URL = `${GITHUB_REPO_URL}/releases/latest`;

/** Project 1999 wiki base — where unmapped zones link out for their maps. */
export const P99_WIKI_BASE = "https://wiki.project1999.com";
/** A zone's P99 map page (spaces → underscores, path-encoded). */
export function p99ZoneUrl(zone: string): string {
  return `${P99_WIKI_BASE}/${encodeURIComponent(zone.trim().replace(/ /g, "_"))}`;
}
