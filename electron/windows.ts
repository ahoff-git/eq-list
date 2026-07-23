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
import { BrowserWindow } from "electron";
import path from "node:path";
import { savedBounds, rememberBounds } from "./window-state";
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

const DEV = !!process.env.EQL_DEV;
const DEV_URL = "http://localhost:3000";
const APP_URL = "app://local";
const PRELOAD = path.join(__dirname, "preload.js");

function load(win: BrowserWindow, route: string): void {
  if (DEV) {
    void win.loadURL(`${DEV_URL}/${route}`);
  } else {
    void win.loadURL(`${APP_URL}/${route ? `${route}/` : ""}index.html`);
  }
}

let mainWindow: BrowserWindow | null = null;
let mapWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
export function getMapWindow(): BrowserWindow | null {
  return mapWindow;
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
  if (overlay) mapWindow.setAlwaysOnTop(overlay.alwaysOnTop, "screen-saver");
  mapWindow.once("ready-to-show", () => mapWindow?.show());
  mapWindow.on("closed", () => {
    mapWindow = null;
  });
  load(mapWindow, "map");
  if (process.env.EQL_DEVTOOLS) mapWindow.webContents.openDevTools({ mode: "detach" });
  return mapWindow;
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

/** Push opacity / always-on-top onto the live window (the single app window). */
export function applyOverlaySettings(overlay: OverlaySettings): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  win.setOpacity(overlay.opacity);
  win.setAlwaysOnTop(overlay.alwaysOnTop, "screen-saver");
}
