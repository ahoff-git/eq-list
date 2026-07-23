/**
 * constants.ts — small shared constants used by both processes.
 */

/**
 * Global hotkey to show/hide the overlay. Works even when the overlay is
 * click-through or unfocused, so it's always possible to dismiss the float.
 * `accelerator` is the Electron globalShortcut form; `label` is for the UI.
 */
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
