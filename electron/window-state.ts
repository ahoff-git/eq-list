/**
 * window-state.ts — remembers window positions and whether the map window was open,
 * persisted to `userData/window-state.json`.
 *
 * Kept separate from settings on purpose: bounds change on every drag/resize, and
 * routing that through the reactive settings store would spam settings:changed
 * (which restyles the overlay and re-checks the watcher). This is plain state with
 * no broadcasts. Bounds are validated against the current displays so a window
 * saved on a now-disconnected monitor doesn't reopen off-screen.
 *
 * Writes on move/resize are debounced, but on window close and on app quit they
 * flush synchronously — otherwise the app exits before the timer fires and the
 * last size is lost (the window appears to "reset" every launch).
 */
import { app, screen, type BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Role = "main" | "overlay" | "map";

interface WindowState {
  main?: Bounds;
  overlay?: Bounds;
  map?: Bounds;
  /** Whether the (on-demand) map window was open, so we can reopen it next launch. */
  mapOpen?: boolean;
}

// Lazily loaded so we don't touch app.getPath before `ready`.
let state: WindowState | null = null;
let writeTimer: NodeJS.Timeout | null = null;
let quitting = false;

function file(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}
function get(): WindowState {
  if (!state) {
    try {
      state = JSON.parse(fs.readFileSync(file(), "utf8")) as WindowState;
    } catch {
      state = {};
    }
  }
  return state;
}
function writeNow(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  try {
    fs.writeFileSync(file(), JSON.stringify(get(), null, 2), "utf8");
  } catch {
    /* best effort */
  }
}
function persist(): void {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(writeNow, 300);
}

/** A window is usable if it overlaps some display's work area. */
function isOnScreen(b: Bounds): boolean {
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    return b.x < wa.x + wa.width && b.x + b.width > wa.x && b.y < wa.y + wa.height && b.y + b.height > wa.y;
  });
}

/** Saved bounds for a role, or null if none/off-screen (so the caller centers). */
export function savedBounds(role: Role): Bounds | null {
  const b = get()[role];
  return b && isOnScreen(b) ? b : null;
}

/** Persist this window's bounds whenever it moves/resizes/closes. */
export function rememberBounds(role: Role, win: BrowserWindow): void {
  const save = (immediate = false) => {
    if (win.isDestroyed()) return;
    // Ignore maximized/minimized frames; keep the last "normal" size to restore to.
    if (win.isMaximized() || win.isMinimized()) return;
    get()[role] = win.getBounds();
    if (immediate) writeNow();
    else persist();
  };
  win.on("moved", () => save());
  win.on("resized", () => save());
  win.on("close", () => save(true)); // flush before the window (and maybe the app) goes away
}

/** True once the app has begun quitting — lets close handlers skip "user closed" logic. */
export function isQuitting(): boolean {
  return quitting;
}

/** Remember whether the map window is open (so the next launch can restore it). */
export function setMapOpen(open: boolean): void {
  get().mapOpen = open;
  persist();
}

/** Whether the map window was open when we last recorded it. */
export function wasMapOpen(): boolean {
  return !!get().mapOpen;
}

/** Called on app before-quit: mark quitting and flush any pending write synchronously. */
export function beginQuit(): void {
  quitting = true;
  writeNow();
}

/** Forget saved positions (used by "reset window positions"). */
export function resetPositions(): void {
  const s = get();
  delete s.main;
  delete s.overlay;
  delete s.map;
  writeNow();
}
