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
import { savedBounds, rememberBounds, setMapOpen, isQuitting } from "./window-state";
import { clampUiScale } from "../src/shared/constants";
import { CH } from "../src/shared/ipc-channels";
import { createLogger } from "../src/shared/logging";
import type { OverlaySettings } from "../src/shared/types";

const log = createLogger("windows");

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

const DEV = !!process.env.EQL_DEV;
const DEV_URL = "http://localhost:3000";
const APP_URL = "app://local";
const PRELOAD = path.join(__dirname, "preload.js");

/** The app/taskbar icon — the same .ico the tray and web favicon use, packaged in out/. */
function windowIcon(): string {
  return path.join(app.getAppPath(), "out", "favicon.ico");
}

/** The scale last applied, so a window opened or reloaded later can catch up to it. */
let uiScale: number | null = null;

function load(win: BrowserWindow, route: string): void {
  // The zoom factor belongs to the frame, so a fresh load resets it — re-apply on every
  // navigation rather than only when the setting changes, or a reopened window (the map is
  // created on demand) comes back at full size while the setting says otherwise.
  win.webContents.on("did-finish-load", () => {
    if (uiScale !== null) applyUiScale(uiScale, win);
  });
  if (DEV) {
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
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=main"],
    },
  });
  rememberBounds("main", mainWindow);
  pipeRendererConsole(mainWindow, "main");
  if (overlay) applyOverlaySettings(overlay);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
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
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=map"],
    },
  });
  rememberBounds("map", mapWindow);
  pipeRendererConsole(mapWindow, "map");
  setMapOpen(true); // so the next launch restores it (see main.ts startup)
  if (overlay) mapWindow.setAlwaysOnTop(overlay.alwaysOnTop, "screen-saver");
  mapWindow.once("ready-to-show", () => mapWindow?.show());
  mapWindow.on("closed", () => {
    mapWindow = null;
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
export function createAlertWindow(): BrowserWindow {
  if (alertWindow && !alertWindow.isDestroyed()) return alertWindow;
  const { bounds } = screen.getPrimaryDisplay();
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
  alertWindow.on("closed", () => {
    alertWindow = null;
  });
  load(alertWindow, "alert");
  // `showInactive` so appearing never pulls focus off the game.
  alertWindow.once("ready-to-show", () => alertWindow?.showInactive());
  return alertWindow;
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
    setTimeout(cover, 60); // some Electron builds only honor the resize once realized
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
 * Push opacity / always-on-top onto the app window, and the interface scale onto **every**
 * window — the map is a sibling window and should shrink with the rest of the app, not
 * separately.
 */
export function applyOverlaySettings(overlay: OverlaySettings): void {
  applyUiScale(overlay.fontScale);
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  win.setOpacity(overlay.opacity);
  win.setAlwaysOnTop(overlay.alwaysOnTop, "screen-saver");
}

/**
 * Scale a window's whole rendering. `setZoomFactor` is per-`webContents` and survives until
 * the frame navigates, so it's re-applied when a window loads as well as when the setting
 * changes.
 */
export function applyUiScale(scale: number, win?: BrowserWindow): void {
  const factor = clampUiScale(scale);
  uiScale = factor;
  const targets = win ? [win] : BrowserWindow.getAllWindows();
  for (const target of targets) {
    if (!target.isDestroyed()) target.webContents.setZoomFactor(factor);
  }
  log.debug("ui scale", factor, "on", targets.length, win ? "(one window)" : "window(s)");
}
