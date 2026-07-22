/**
 * windows.ts — creates the two windows and knows how to load the renderer.
 *
 *  main    — normal framed control panel (search, list, settings)
 *  overlay — frameless, transparent, always-on-top float that lights up on drops
 *
 * In dev the renderer is the `next dev` server; in prod it's the exported bundle
 * served over app:// (see protocol.ts). The window's role is passed to the
 * preload via an --eql-role argument.
 *
 * Windows restore their last position (window-state.ts) and are shown without
 * stealing focus — the overlay especially must never yank focus from the game.
 * DevTools only open when EQL_DEVTOOLS is set, not on every dev run.
 */
import { BrowserWindow } from "electron";
import path from "node:path";
import { savedBounds, rememberBounds, setOverlayOpen, isQuitting } from "./window-state";
import type { OverlaySettings } from "../src/shared/types";

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
let overlayWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    return mainWindow;
  }
  const bounds = savedBounds("main");
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 700,
    ...(bounds ?? {}),
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: "EQ List",
    backgroundColor: "#0e1013",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=main"],
    },
  });
  rememberBounds("main", mainWindow);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  load(mainWindow, "");
  if (process.env.EQL_DEVTOOLS) mainWindow.webContents.openDevTools({ mode: "detach" });
  return mainWindow;
}

export function createOverlayWindow(overlay: OverlaySettings): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.showInactive(); // re-show (may have been hidden) without taking focus
    setOverlayOpen(true);
    return overlayWindow;
  }
  const bounds = savedBounds("overlay");
  overlayWindow = new BrowserWindow({
    width: 340,
    height: 480,
    ...(bounds ?? {}),
    minWidth: 220,
    minHeight: 160,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: overlay.alwaysOnTop,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=overlay"],
    },
  });
  rememberBounds("overlay", overlayWindow);
  applyOverlaySettings(overlay);
  // Show without focus so the game keeps input; the overlay is a passive float.
  overlayWindow.once("ready-to-show", () => {
    overlayWindow?.showInactive();
    setOverlayOpen(true);
  });
  overlayWindow.on("closed", () => {
    overlayWindow = null;
    // Only "user closed it" counts as closed; app-quit should keep it remembered open.
    if (!isQuitting()) setOverlayOpen(false);
  });
  load(overlayWindow, "overlay");
  return overlayWindow;
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

/** Push opacity / always-on-top / click-through onto the live overlay window. */
export function applyOverlaySettings(overlay: OverlaySettings): void {
  const win = overlayWindow;
  if (!win || win.isDestroyed()) return;
  win.setOpacity(overlay.opacity);
  win.setAlwaysOnTop(overlay.alwaysOnTop, "screen-saver");
  // forward:true still lets pointer move events through so hover styles work
  win.setIgnoreMouseEvents(overlay.clickThrough, { forward: true });
}
