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
import path from "node:path";

import { createSaver, readJson } from "./json-store";
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
  /**
   * Which windows were left maximized. Kept beside — not instead of — the bounds above,
   * which stay the size to restore *to*, exactly as a normal window behaves.
   */
  maximized?: Partial<Record<Role, boolean>>;
}

// Lazily loaded so we don't touch app.getPath before `ready`.
let state: WindowState | null = null;
let quitting = false;

function file(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}
function get(): WindowState {
  if (!state) {
    state = readJson<WindowState>(file(), {});
  }
  return state;
}

/**
 * `restart`, unlike every other store: a drag fires "moved" continuously and only where the window
 * *stops* is worth keeping, so each frame pushes the write back rather than letting one land mid-drag.
 * The path is a function because `app.getPath` can't be called before `ready`.
 */
const saver = createSaver(file, "window positions", get, 300, { pretty: true, restart: true });

/** A window is usable if it overlaps some display's work area. */
function isOnScreen(b: Bounds): boolean {
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea;
    return b.x < wa.x + wa.width && b.x + b.width > wa.x && b.y < wa.y + wa.height && b.y + b.height > wa.y;
  });
}

/**
 * Shrink bounds that are bigger than the monitor they sit on. Position is left alone — an overlay
 * hanging off the edge is a legitimate place to put it — but a window wider or taller than its
 * display is never what the user chose: it's either a leftover from a bigger monitor that's since
 * been unplugged, or the DPI inflation that used to grow the window on every launch (see
 * `restoreBounds` in windows.ts). Restoring that verbatim leaves the window's own controls
 * off-screen, with no way to resize a frameless window back.
 */
function fitToDisplay(b: Bounds): Bounds {
  const wa = screen.getDisplayMatching(b).workArea;
  return { ...b, width: Math.min(b.width, wa.width), height: Math.min(b.height, wa.height) };
}

/** Saved bounds for a role, or null if none/off-screen (so the caller centers). */
export function savedBounds(role: Role): Bounds | null {
  const b = get()[role];
  return b && isOnScreen(b) ? fitToDisplay(b) : null;
}

/** Same bounds for our purposes if nothing moved by more than a pixel — see `save` below. */
function nearlySame(a: Bounds | undefined, b: Bounds): boolean {
  return !!a && (["x", "y", "width", "height"] as const).every((k) => Math.abs(a[k] - b[k]) <= 1);
}

/** Persist this window's bounds whenever it moves/resizes/closes. */
export function rememberBounds(role: Role, win: BrowserWindow): void {
  const save = (immediate = false) => {
    if (win.isDestroyed()) return;
    // Ignore maximized/minimized frames; keep the last "normal" size to restore to.
    if (win.isMaximized() || win.isMinimized()) return;
    const next = win.getBounds();
    // A fractionally-scaled display reads bounds back a pixel off what was set, so restoring a
    // window can report a "new" size it never had. Saving that noise would creep a pixel a launch.
    if (nearlySame(get()[role], next)) return;
    get()[role] = next;
    if (immediate) saver.flush();
    else saver.save();
  };
  win.on("moved", () => save());
  win.on("resized", () => save());
  win.on("close", () => save(true)); // flush before the window (and maybe the app) goes away
}

/** Remember that a window was left maximized, so it opens that way next time. */
export function setMaximized(role: Role, on: boolean): void {
  const s = get();
  s.maximized = { ...s.maximized, [role]: on };
  saver.save();
}

/** Was this window maximized when we last saw it? */
export function wasMaximized(role: Role): boolean {
  return !!get().maximized?.[role];
}

/** True once the app has begun quitting — lets close handlers skip "user closed" logic. */
export function isQuitting(): boolean {
  return quitting;
}

/** Remember whether the map window is open (so the next launch can restore it). */
export function setMapOpen(open: boolean): void {
  get().mapOpen = open;
  saver.save();
}

/** Whether the map window was open when we last recorded it. */
export function wasMapOpen(): boolean {
  return !!get().mapOpen;
}

/** Called on app before-quit: mark quitting and flush any pending write synchronously. */
export function beginQuit(): void {
  quitting = true;
  saver.flush();
}

/** Forget saved positions (used by "reset window positions"). */
export function resetPositions(): void {
  const s = get();
  delete s.main;
  delete s.overlay;
  delete s.map;
  // A window "lost" behind a maximized frame is exactly what this button is for.
  delete s.maximized;
  saver.flush();
}
