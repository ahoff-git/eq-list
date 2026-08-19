/**
 * window-drag.ts — dragging a frameless window by its titlebar, with Windows-style snapping.
 *
 * Our windows are `frame: false`, and the CSS `-webkit-app-region: drag` that used to move them is
 * Chromium's own move loop, not the OS's: the window follows the cursor and that is all it does. No
 * snap zones, no preview, no pulling a maximized window loose — every habit a Windows user has for
 * placing a window silently did nothing here (see
 * [ADR 0108](../specs/decisions/0108-a-frameless-window-snaps-like-a-framed-one.md)). So the drag is
 * ours to run, and the behaviour has to be built rather than inherited.
 *
 * The division of labour: **the renderer owns the gesture** (it is the only side that sees the
 * pointer go down, move and come up — `useWindowDrag`), and **main owns the window** (it is the only
 * side that can read the cursor in screen coordinates, ask a display for its work area, and set
 * bounds). So the renderer sends three things — grabbed, moved, released — and never a coordinate:
 * every position here comes from `screen.getCursorScreenPoint()`, which is already in the same DIP
 * space as `getBounds`/`setBounds` and so cannot be thrown off by a window's CSS `zoom` or a
 * monitor's scale factor — the two things that made the obvious `screenX` version drift.
 *
 * The arithmetic — which zone the cursor is in, what rectangle that means, where a window pulled
 * loose from a maximize should sit — is in [window-snap.ts](../src/shared/window-snap.ts) and tested
 * on its own.
 */
import { BrowserWindow, screen } from "electron";
import {
  draggedTo,
  gripOn,
  movedFar,
  regrippedTo,
  snapRect,
  snapZoneAt,
  type DragEnd,
  type Point,
  type Rect,
  type SnapZone,
} from "../src/shared/window-snap";
import { createLogger } from "../src/shared/logging";

const log = createLogger("window-drag");

/**
 * How long a drag may go without a word from the renderer before main drops it.
 *
 * A drag is only ended by the renderer that started it, so a renderer that dies mid-drag (the case
 * [ADR 0105](../specs/decisions/0105-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md)
 * is about) would otherwise leave the snap preview on screen for good. Generous, because the timer
 * is re-armed by every pointer move and the cost of firing early is a drag that stops following:
 * ten seconds of a held button with a perfectly still mouse is not a gesture anyone is making.
 */
const DRAG_IDLE_MS = 10_000;

/**
 * The snap preview: a flat translucent rectangle where the window would land, which is what Windows
 * shows and the only part of snapping that is visible *before* you commit to it.
 */
const PREVIEW = { color: "#5b8cff", opacity: 0.28 } as const;

interface Drag {
  win: BrowserWindow;
  /** Where the cursor sits inside the window, so the window keeps that grip as it follows. */
  grip: Point;
  /** The cursor where the press landed — a drag doesn't begin until it leaves this spot. */
  pressedAt: Point;
  /** The window as the press found it. An Escape puts it back exactly here. */
  from: Rect;
  fromMaximized: boolean;
  /** The window's un-snapped rectangle: `from`, or what it was pulled loose to. */
  normal: Rect;
  /**
   * The size the drag is carrying, asserted on every pulse rather than read back off the window.
   *
   * Not a tidiness: a window crossing between monitors of different scale factors is **rescaled by
   * Windows** as it goes, so its own bounds are the one thing that can't be trusted mid-drag.
   * Reading them back fed that rescale into the next pulse and kept it — measured on a real
   * 125%/100% pair, a float dragged from one monitor to the other arrived a fifth smaller and
   * snapped to 768×826 where the half was 960×1032. Carrying the size instead makes every pulse
   * re-assert it, so the drag ends the size it began.
   */
  size: { width: number; height: number };
  /** Has the cursor travelled far enough to be a drag rather than a click? */
  moved: boolean;
  /** The zone the preview is currently showing, so it's only moved when it changes. */
  zone: SnapZone | null;
  /** Pulses seen. Only for the debug log, where "the drag stopped following" is the hard bug. */
  pulses: number;
  idle: NodeJS.Timeout | null;
}

let drag: Drag | null = null;

/**
 * Where a snapped window came from, so dragging it out restores the size it had.
 *
 * A half or a quarter is, to the OS, an ordinary resize — nothing but this remembers that the
 * window did not choose that size. (A *maximize* needs no entry: Electron's own `unmaximize` knows
 * the way back.) A `WeakMap`, so a closed window's entry goes with it.
 */
const loose = new WeakMap<BrowserWindow, Rect>();

/** Begin dragging this window: the press landed on its titlebar. */
export function startWindowDrag(win: BrowserWindow | null): void {
  endWindowDrag("keep"); // whatever came before, this press is the live gesture
  if (!win || win.isDestroyed() || !win.isMovable()) return;
  const cursor = screen.getCursorScreenPoint();
  const from = win.getBounds();
  drag = {
    win,
    grip: gripOn(cursor, from),
    pressedAt: cursor,
    from,
    fromMaximized: win.isMaximized(),
    normal: from,
    size: { width: from.width, height: from.height },
    moved: false,
    zone: null,
    pulses: 0,
    idle: null,
  };
  armIdle();
  log.debug("drag started", from, win.isMaximized() ? "(maximized)" : "");
}

/** The pointer moved. Follow it, and show where letting go would put the window. */
export function moveWindowDrag(): void {
  const d = drag;
  if (!d) return;
  if (d.win.isDestroyed()) {
    endWindowDrag("keep");
    return;
  }
  armIdle();
  d.pulses += 1;
  const cursor = screen.getCursorScreenPoint();
  if (!d.moved) {
    if (!movedFar(d.pressedAt, cursor)) return;
    d.moved = true;
    pullLoose(d, cursor);
  }
  d.win.setBounds(draggedTo(cursor, d.grip, d.size));
  showZone(d, cursor);
}

/**
 * The gesture is over.
 *
 * - `snap` — released: land in the zone under the cursor, or stay put if there isn't one.
 * - `cancel` — Escape: put the window back exactly where the press found it, as Windows does.
 * - `keep` — the gesture was lost rather than finished (focus went elsewhere, the renderer died):
 *   leave the window where it got to. Snapping on a drag nobody released would place a window off
 *   a gesture the user never completed.
 */
export function endWindowDrag(how: DragEnd): void {
  const d = drag;
  drag = null;
  hideSnapPreview();
  if (!d) return;
  if (d.idle) clearTimeout(d.idle);
  log.debug(`drag ended (${how}) after ${d.pulses} moves, zone=${d.zone ?? "none"}`);
  if (d.win.isDestroyed()) return;
  if (how === "cancel") {
    restore(d);
    return;
  }
  if (how !== "snap" || !d.moved) return;
  // The cursor at the moment of release is what decides, not the last move we were told about.
  const cursor = screen.getCursorScreenPoint();
  const workArea = screen.getDisplayNearestPoint(cursor).workArea;
  const zone = zoneFor(d.win, cursor, workArea);
  if (zone) snapTo(d, zone, workArea);
}

/** Whether a drag is in flight — so a second press, or a stale move, can't fight it. */
export function isDragging(): boolean {
  return !!drag;
}

/** Undo a cancelled drag. A window that was maximized is maximized again, not sized to its frame. */
function restore(d: Drag): void {
  if (d.fromMaximized) d.win.maximize();
  else d.win.setBounds(d.from);
}

/**
 * Pull a maximized or snapped window loose, the moment the drag proper begins.
 *
 * Dragging a maximized window in Windows restores it under the pointer; without this the window
 * would slide around the desktop still maximized — which is neither a move nor a maximize. The size
 * to come back to is the one this module remembered when it snapped the window, or, for an ordinary
 * maximize, whatever `unmaximize` restores (Electron kept that itself).
 */
function pullLoose(d: Drag, cursor: Point): void {
  const win = d.win;
  const wasSnapped = loose.get(win);
  if (!d.fromMaximized && !wasSnapped) return; // an ordinary window is already loose
  const big = win.getBounds();
  if (d.fromMaximized) win.unmaximize(); // also flips the titlebar's ❐ back to ▢
  loose.delete(win);
  const size = wasSnapped ?? win.getBounds();
  win.setBounds(regrippedTo(cursor, big, { width: size.width, height: size.height }));
  // The grip has to be re-read: the window under the cursor is a different size than it was.
  d.normal = win.getBounds();
  d.size = { width: d.normal.width, height: d.normal.height };
  d.grip = gripOn(cursor, d.normal);
}

/** The zone under the cursor, or null. A window that can't be resized has no zone to be put in. */
function zoneFor(win: BrowserWindow, cursor: Point, workArea: Rect): SnapZone | null {
  if (!win.isResizable()) return null;
  const zone = snapZoneAt(cursor, workArea);
  return zone === "maximize" && !win.isMaximizable() ? null : zone;
}

/** Keep the preview on the zone the cursor is in — creating, moving or dropping it as that changes. */
function showZone(d: Drag, cursor: Point): void {
  const workArea = screen.getDisplayNearestPoint(cursor).workArea;
  const zone = zoneFor(d.win, cursor, workArea);
  if (zone === d.zone) return;
  d.zone = zone;
  log.debug("snap zone", zone ?? "none", "at", cursor);
  if (zone) showSnapPreview(snapRect(zone, workArea));
  else hideSnapPreview();
}

/** Land the window in a zone, remembering what to give back if it's dragged out again. */
function snapTo(d: Drag, zone: SnapZone, workArea: Rect): void {
  const win = d.win;
  if (zone === "maximize") {
    loose.delete(win); // from here `unmaximize` is the way back, and it needs no help
    win.maximize();
    return;
  }
  if (win.isMaximized()) win.unmaximize(); // a rectangle can't be set on a maximized window
  // `normal`, not the current bounds: the window is mid-drag, so where it happens to be is
  // wherever the cursor left it, and the size to restore is the one it had before the drag.
  if (!loose.has(win)) loose.set(win, d.normal);
  win.setBounds(snapRect(zone, workArea));
}

/** Re-arm the "did the renderer go away mid-drag" timer — see `DRAG_IDLE_MS`. */
function armIdle(): void {
  const d = drag;
  if (!d) return;
  if (d.idle) clearTimeout(d.idle);
  d.idle = setTimeout(() => {
    log.warn("drag went quiet — dropping it (nothing has moved the pointer for a long time)");
    endWindowDrag("keep");
  }, DRAG_IDLE_MS);
}

let preview: BrowserWindow | null = null;

/**
 * Show (or move) the snap preview.
 *
 * Deliberately a window with **nothing loaded**: it is one flat colour, so a renderer would only
 * add a page that could fail to paint or stop answering while sitting on top of the game — the
 * failure [ADR 0105](../specs/decisions/0105-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md)
 * is about. It is also unfocusable and click-through, so at its worst it is a coloured rectangle
 * that cannot take a click, and it is destroyed the moment the drag ends.
 */
function showSnapPreview(rect: Rect): void {
  try {
    if (!preview || preview.isDestroyed()) {
      preview = new BrowserWindow({
        ...rect,
        show: false,
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        focusable: false, // never take focus off the window being dragged
        skipTaskbar: true,
        hasShadow: false,
        backgroundColor: PREVIEW.color,
        opacity: PREVIEW.opacity,
      });
      preview.setIgnoreMouseEvents(true, { forward: true });
      preview.setAlwaysOnTop(true, "screen-saver");
    }
    preview.setBounds(rect);
    if (!preview.isVisible()) preview.showInactive();
  } catch (e) {
    log.warn("could not show the snap preview:", (e as Error).message);
    preview = null;
  }
}

/**
 * Take the preview away. Exported because it must be possible to say "off the screen, now" from
 * outside a drag — a crash in main leaves whatever windows the throw interrupted.
 *
 * `destroy()`, not `close()`: it has no renderer to ask and nothing to save.
 */
export function hideSnapPreview(): void {
  if (preview && !preview.isDestroyed()) preview.destroy();
  preview = null;
}
