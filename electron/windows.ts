/**
 * windows.ts — creates the app's single window and knows how to load the renderer.
 *
 * There is one window: a frameless, translucent, resizable float (the "overlay"
 * look) that hosts the whole app (list, hunt, search, session, settings). It can be
 * pinned always-on-top and hidden to the tray. In dev the renderer is the `next dev`
 * server; in prod it's the exported bundle served over app:// (see protocol.ts).
 *
 * The window restores its last position (window-state.ts). DevTools only open when
 * EQL_DEVTOOLS is set, not on every dev run.
 */
import { app, BrowserWindow, screen } from "electron";
import path from "node:path";
import { savedBounds, rememberBounds, setMapOpen, isQuitting, setMaximized, wasMaximized, type Bounds } from "./window-state";
import { CH } from "../src/shared/ipc-channels";
import { createLogger } from "../src/shared/logging";
import type { OverlaySettings } from "../src/shared/types";

/**
 * Bridge a window's renderer console into the main-process log, so renderer output
 * (e.g. map ping broadcasts) shows up in the same terminal + debug file as everything
 * else — renderer logs otherwise live only in that window's DevTools. Chromium levels
 * (Electron 33: 0=verbose, 1=info, 2=warning, 3=error) map onto the logger: warn/error
 * always print, log/info/debug are gated by the main debug flag (on in dev), which
 * mirrors the renderer's own gate so the two ends agree on what's noise.
 */
function pipeRendererConsole(win: BrowserWindow, role: string): void {
  const rlog = createLogger(`renderer:${role}`);
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 3) rlog.error(message);
    else if (level === 2) rlog.warn(message);
    else rlog.debug(message);
  });
}

/**
 * Keep a frameless window's own maximize/restore button honest, and remember the state.
 *
 * A framed window gets this from the OS; ours draw their own titlebar, so the renderer has
 * to be told — including after a reload, which starts the button from scratch. Maximizing
 * from any source (our button, a double-click on the drag region, Win+Up, the taskbar) comes
 * back through the same two window events, so the button can never disagree with reality.
 */
function reportMaximize(role: "main" | "map", win: BrowserWindow): void {
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send(CH.winMaximizeChanged, win.isMaximized());
  };
  win.on("maximize", () => {
    setMaximized(role, true);
    send();
  });
  win.on("unmaximize", () => {
    setMaximized(role, false);
    send();
  });
  win.webContents.on("did-finish-load", send);
}

/** Open maximized if that's how it was left — the same courtesy a normal window extends. */
function restoreMaximized(role: "main" | "map", win: BrowserWindow): void {
  if (wasMaximized(role)) win.maximize();
}

/**
 * Put a restored window on exactly its saved bounds. The constructor can't be trusted with them.
 *
 * On a mixed-DPI setup Electron sizes a new window using the *primary* display's scale factor, so a
 * window reopened on a 125%-scaled monitor opens 1.25× too big (asking for 602×815 measured 754×1022).
 * Those inflated bounds are what got saved on close, so the window grew on every single launch — the
 * "windows resize themselves each time" bug. Re-asserting the bounds once the window exists lands it
 * where the user left it; same fix, same reason, as `coverDisplay` below.
 *
 * Call this *before* `restoreMaximized`, so a window that opens maximized still has the right size to
 * restore down to.
 */
function restoreBounds(win: BrowserWindow, bounds: Bounds | null): void {
  if (!bounds) return;
  const apply = () => {
    // Never fight a maximize: saved bounds are the size to restore *to*, not the size to be.
    if (!win.isDestroyed() && !win.isMaximized()) win.setBounds(bounds);
  };
  apply(); // now, so the window is never shown at the wrong size
  win.once("ready-to-show", apply); // and again once realized, which some builds need
}

const DEV = !!process.env.EQL_DEV;
const DEV_URL = "http://localhost:3000";
const APP_URL = "app://local";
const PRELOAD = path.join(__dirname, "preload.js");

/**
 * How long after creating a full-display window to re-assert its bounds.
 *
 * Both the alert overlay and the screengrab selector have to cover exactly one monitor, and on a
 * mixed-DPI setup Electron reports the bounds in the *primary* display's scale factor until the
 * window is realized — so the first `setBounds` can land the window half off-screen. Re-asserting
 * once the frame exists fixes it; a beat later than "ready-to-show", because some builds only honour
 * the resize then. Short enough not to be visible, long enough to be after realization.
 */
const REALIZE_DELAY_MS = 60;

/** The app/taskbar icon — the same .ico the tray and web favicon use, packaged in out/. */
function windowIcon(): string {
  return path.join(app.getAppPath(), "out", "favicon.ico");
}

/**
 * Note there's no zoom handling here any more. The interface scale is a CSS `zoom` applied by
 * each window's own renderer (`useUiScale`): Chromium's `setZoomFactor` is per **origin**, and
 * every window is served from one, so it could only ever hold a single scale for all of them —
 * which is why the map's A−/A+ used to move the main window too.
 */

/**
 * Next's dev error overlay, hidden in every window we own (the *why* is [ADR 0052]:
 * full-viewport UI on a frameless always-on-top window reads as the game blacking out,
 * and the overlay takes keyboard focus with it).
 *
 * This has to be injected from the main process rather than written in `globals.css`,
 * because the case that most needs hiding is the one a stylesheet can't cover: on a
 * **compile error** Next serves a document with no app bundle at all, so app CSS — the
 * rule included — never loads, and the overlay mounts straight onto `<body>` and focuses
 * itself. Injected per document, since `insertCSS` is dropped on navigation and `next dev`
 * reloads on its own.
 */
const HIDE_DEV_OVERLAY = "[data-nextjs-dev-overlay], nextjs-portal { display: none !important }";

function load(win: BrowserWindow, route: string): void {
  if (DEV) {
    win.webContents.on("dom-ready", () => void win.webContents.insertCSS(HIDE_DEV_OVERLAY));
    void win.loadURL(`${DEV_URL}/${route}`);
  } else {
    void win.loadURL(`${APP_URL}/${route ? `${route}/` : ""}index.html`);
  }
}

let mainWindow: BrowserWindow | null = null;
let mapWindow: BrowserWindow | null = null;
let alertWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
export function getMapWindow(): BrowserWindow | null {
  return mapWindow;
}
export function getAlertWindow(): BrowserWindow | null {
  return alertWindow;
}

export function createMainWindow(overlay?: OverlaySettings): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  const bounds = savedBounds("main");
  mainWindow = new BrowserWindow({
    width: 460,
    height: 780,
    ...(bounds ?? {}),
    minWidth: 340,
    minHeight: 420,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    title: "EQ List",
    icon: windowIcon(),
    alwaysOnTop: overlay?.alwaysOnTop ?? true,
    // Set the saved opacity up front so the window opens at the right translucency (no flash),
    // then the renderer owns it — see `applyOverlaySettings`.
    opacity: overlay?.opacity ?? 1,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=main"],
    },
  });
  restoreBounds(mainWindow, bounds);
  rememberBounds("main", mainWindow);
  reportMaximize("main", mainWindow);
  pipeRendererConsole(mainWindow, "main");
  if (overlay) applyOverlaySettings(overlay);
  mainWindow.once("ready-to-show", () => {
    if (mainWindow) restoreMaximized("main", mainWindow);
    mainWindow?.show();
  });
  // Mouse thumb buttons (and some keyboards) fire browser back/forward as an
  // app-command; forward it so the renderer can walk its own page history instead
  // of the OS trying to navigate a non-existent browser.
  mainWindow.on("app-command", (_e, cmd) => {
    if (cmd === "browser-backward") mainWindow?.webContents.send(CH.navCommand, "back");
    else if (cmd === "browser-forward") mainWindow?.webContents.send(CH.navCommand, "forward");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  load(mainWindow, "");
  if (process.env.EQL_DEVTOOLS) mainWindow.webContents.openDevTools({ mode: "detach" });
  return mainWindow;
}

/**
 * The map window — a sibling float (frameless, translucent, resizable, always-on-top)
 * that shows the current zone's map with the player's live location. Opened on
 * demand from the main window's 🗺 button; it receives zone/loc via the same
 * main→renderer broadcasts as every other window. Closing it destroys it (unlike the
 * main window's hide-to-tray) — it's a secondary surface.
 */
export function createMapWindow(overlay?: OverlaySettings): BrowserWindow {
  if (mapWindow && !mapWindow.isDestroyed()) {
    mapWindow.show();
    mapWindow.focus();
    return mapWindow;
  }
  const bounds = savedBounds("map");
  mapWindow = new BrowserWindow({
    width: 680,
    height: 720,
    ...(bounds ?? {}),
    minWidth: 320,
    minHeight: 320,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    title: "EQ List — Map",
    icon: windowIcon(),
    alwaysOnTop: overlay?.alwaysOnTop ?? true,
    // Its own saved opacity, set up front for the same reason as the main window's (no flash),
    // and owned by the renderer from then on.
    opacity: overlay?.mapOpacity ?? 1,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=map"],
    },
  });
  restoreBounds(mapWindow, bounds);
  rememberBounds("map", mapWindow);
  reportMaximize("map", mapWindow);
  pipeRendererConsole(mapWindow, "map");
  setMapOpen(true); // so the next launch restores it (see main.ts startup)
  if (overlay) mapWindow.setAlwaysOnTop(overlay.alwaysOnTop, "screen-saver");
  mapWindow.once("ready-to-show", () => {
    if (mapWindow) restoreMaximized("map", mapWindow);
    mapWindow?.show();
  });
  const created = mapWindow;
  created.on("closed", () => {
    // Only if it's still this window: reopening while the old one is closing would otherwise
    // let the stale `closed` null out the new reference (the bug the alert overlay hit).
    if (mapWindow === created) mapWindow = null;
    // A user-initiated close forgets the window; a close during app quit keeps the
    // "was open" flag so we can reopen it next launch.
    if (!isQuitting()) setMapOpen(false);
  });
  load(mapWindow, "map");
  if (process.env.EQL_DEVTOOLS) mapWindow.webContents.openDevTools({ mode: "detach" });
  return mapWindow;
}

/**
 * The cast-alert overlay — a frameless, transparent, click-through window pinned above
 * everything and stretched over the primary display, so a dispel-prep banner (and the red
 * border flash) appears *on top of the game*, not buried in the app window behind it.
 *
 * It never takes focus and never eats a click (`setIgnoreMouseEvents`), so it can't disrupt
 * play — which is also why it can't beep (a never-focused window can't unlock audio): the
 * always-alive main window owns the sound, this window owns the visuals. Created only while
 * cast alerts are enabled (see `main.ts`); when empty it's fully transparent, so it's invisible.
 */
export function createAlertWindow(displayId?: number): BrowserWindow {
  const display = alertDisplay(displayId);
  // Already up: a monitor change just moves it. Tearing it down and building another raced with
  // its own teardown — `closed` fires after the replacement is created, and the handler used to
  // null out whichever window was current, so the new overlay became unreachable and the alert
  // kept appearing on the old monitor until some other setting rebuilt it.
  if (alertWindow && !alertWindow.isDestroyed()) {
    coverDisplay(alertWindow, display);
    return alertWindow;
  }
  const { bounds } = display;
  alertWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false, // never steal focus from the game
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=alert"],
    },
  });
  alertWindow.setAlwaysOnTop(true, "screen-saver");
  alertWindow.setIgnoreMouseEvents(true, { forward: true }); // click-through: every click passes to the game
  // Best-effort: keep showing over a borderless-fullscreen game and across virtual desktops.
  alertWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pipeRendererConsole(alertWindow, "alert");
  const created = alertWindow;
  // Only clear the reference if it's still *this* window — see the note above about the race.
  created.on("closed", () => {
    if (alertWindow === created) alertWindow = null;
  });
  load(created, "alert");
  // `showInactive` so appearing never pulls focus off the game.
  created.once("ready-to-show", () => {
    created.showInactive();
    coverDisplay(created, alertDisplay(displayId));
  });
  coverDisplay(created, display);
  return created;
}

/** The monitor to cover: the chosen one, or primary when it's unset or gone (unplugged). */
function alertDisplay(displayId?: number): Electron.Display {
  return (
    (displayId !== undefined && screen.getAllDisplays().find((d) => d.id === displayId)) ||
    screen.getPrimaryDisplay()
  );
}

/**
 * Make a window cover exactly one display. The constructor can't be trusted with this: a window
 * created for a secondary or HiDPI monitor inherits the *primary* display's work-area size, so
 * the overlay ends up the wrong size and the banner lands off-screen or half-way across. Same
 * fix as the screengrab selector — re-assert the bounds after creation, once the window is
 * realized, and once more a beat later, since some Electron builds only honour it then.
 */
function coverDisplay(win: BrowserWindow, display: Electron.Display): void {
  const apply = () => {
    if (!win.isDestroyed()) win.setBounds(display.bounds);
  };
  apply();
  setTimeout(apply, REALIZE_DELAY_MS);
}

/** Tear down the alert overlay (when cast alerts are turned off) — nothing to show, no window. */
export function closeAlertWindow(): void {
  if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();
  alertWindow = null;
}

/**
 * A frameless, transparent, fullscreen window over ONE display for the screengrab
 * region selector. One is created per display (lookup.ts manages the set) so you
 * can grab from any monitor, including a non-rectangular layout (monitors at
 * different heights) — each window covers exactly its own display. It takes focus
 * for the drag + Escape.
 */
export function createLookupWindow(bounds: { x: number; y: number; width: number; height: number }): BrowserWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    // Must stay resizable/movable so the setBounds below can take effect —
    // the constructor mis-sizes windows created on a secondary/HiDPI monitor
    // (they inherit the PRIMARY display's work-area size), so we re-assert the
    // target display's full bounds after creation and once it's ready.
    resizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=select"],
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  const cover = () => {
    if (!win.isDestroyed()) win.setBounds(bounds);
  };
  cover();
  win.once("ready-to-show", () => {
    cover();
    win.show();
    setTimeout(cover, REALIZE_DELAY_MS); // some builds only honour the resize once realized
  });
  load(win, "select");
  return win;
}

/**
 * Surface `text` in the control window's Search box, creating/showing that window first.
 * The one path anything outside the control window uses to hand it something to look up —
 * the screengrab OCR result, and a clicked name in the map window (which has no search of
 * its own). Waits for the load when the window was only just created, since a send to a
 * loading frame is dropped.
 */
export function showInSearch(text: string): void {
  const win = getMainWindow() ?? createMainWindow();
  win.show();
  win.focus();
  const send = () => win.webContents.send(CH.searchPrefill, text);
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
  else send();
}

/**
 * Push always-on-top onto the app window, and the interface scale onto **every** window — the
 * map is a sibling window and should shrink with the rest of the app, not separately.
 *
 * Opacity is deliberately **not** set here. It has a transient override (the titlebar's ◐ "fully
 * opaque" toggle) that lives in the renderer, and re-applying the saved value on every settings
 * change used to clobber it — the ◐ would read "on" while the window quietly went translucent. Each
 * window opens at its own saved opacity (constructor: `opacity` / `mapOpacity`) and its renderer
 * owns it from then on.
 */
export function applyOverlaySettings(overlay: OverlaySettings): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(overlay.alwaysOnTop, "screen-saver");
}

