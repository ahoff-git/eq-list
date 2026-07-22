/**
 * main.ts — Electron entry point. Boots the store, wiki client and log watcher,
 * registers IPC, opens the control window, and fans out main→renderer events:
 *   - store changes  → every window re-renders the same list/settings
 *   - loot events     → broadcast raw, then matched entries after the store applies them
 *   - settings changes → overlay restyled + watcher re-targeted when the log path moves
 */
import { app, BrowserWindow, globalShortcut } from "electron";
import path from "node:path";
import fs from "node:fs";
import { registerAppProtocolScheme, handleAppProtocol } from "./protocol";
import { createStore } from "./store";
import { createWikiClient } from "./wiki";
import { createLogWatcher } from "./log-watcher";
import { createSessionStats } from "./session-stats";
import { createOcr } from "./ocr";
import { createLookup } from "./lookup";
import { registerIpc } from "./ipc";
import { createMainWindow, createOverlayWindow, getMainWindow, getOverlayWindow, applyOverlaySettings } from "./windows";
import { wasOverlayOpen, setOverlayOpen, beginQuit } from "./window-state";
import { CH } from "../src/shared/ipc-channels";
import { OVERLAY_HOTKEY, LOOKUP_HOTKEY } from "../src/shared/constants";
import { createLogger, setLogSink } from "../src/shared/logging";
import type { Settings, AppInfo } from "../src/shared/types";

const log = createLogger("main");

// Must run before `ready`.
registerAppProtocolScheme();

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/** Mirror the debug toggle into the env flag that logging.ts reads. */
function syncDebugFlag(settings: Settings): void {
  if (settings.debug) process.env.EQL_DEBUG = "1";
  else delete process.env.EQL_DEBUG;
}

/** Route screengrab-OCR'd text into the control window's Search box. */
function routeSearchText(text: string): void {
  const win = getMainWindow() ?? createMainWindow();
  win.show();
  win.focus();
  const send = () => win.webContents.send(CH.searchPrefill, text);
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
  else send();
}

const DEEP_LINK_SCHEME = "eqlist";

/** Bring the control window to the front (or make one) — for deep links / relaunch. */
function focusMainWindow(): void {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  } else {
    createMainWindow();
  }
}

// Single instance: a second launch — including an eqlist:// link from a web page —
// focuses the running app instead of starting a duplicate.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
  app.on("second-instance", focusMainWindow);
  app.on("open-url", (event) => {
    event.preventDefault();
    focusMainWindow();
  });

  app.whenReady().then(() => {
    handleAppProtocol(path.join(app.getAppPath(), "out"));

  const userData = app.getPath("userData");

  // Mirror logs to a file so debug output is visible without a terminal. Fresh each
  // launch; only what passes the debug gate is written (warn/error always).
  const logFile = path.join(userData, "eqlist-debug.log");
  try {
    fs.writeFileSync(logFile, `EQ List log — ${new Date().toISOString()}\n`);
  } catch {
    /* ignore */
  }
  setLogSink((level, parts) => {
    try {
      const line = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${level.toUpperCase()} ${line}\n`);
    } catch {
      /* best effort */
    }
  });

  const store = createStore(userData);
  const wiki = createWikiClient(path.join(userData, "wiki-cache"));
  const watcher = createLogWatcher();
  const stats = createSessionStats();
  const ocr = createOcr(path.join(userData, "tesseract-cache"));
  const lookup = createLookup(ocr, routeSearchText);

  let currentZone: string | null = null;
  let appInfo: AppInfo = { hotkeys: [], logFile };

  syncDebugFlag(store.getSettings());
  registerIpc({ store, wiki, watcher, stats, lookup, logFile, getCurrentZone: () => currentZone, getAppInfo: () => appInfo });

  let watchKey = "";
  function startWatcher(): void {
    const s = store.getSettings();
    watchKey = `${s.logDir}|${s.activeLogFile}`;
    watcher.start(s.logDir, s.activeLogFile);
  }

  store.onList((list) => broadcast(CH.listChanged, list));
  store.onSettings((settings) => {
    syncDebugFlag(settings);
    broadcast(CH.settingsChanged, settings);
    applyOverlaySettings(settings.overlay);
    // Only re-target the watcher when the log location actually changed.
    if (`${settings.logDir}|${settings.activeLogFile}` !== watchKey) startWatcher();
  });
  watcher.onStatus((status) => broadcast(CH.watcherStatusChanged, status));
  watcher.onZone((event) => {
    if (event.zone === currentZone) return;
    currentZone = event.zone;
    broadcast(CH.zoneChanged, currentZone);
  });
  watcher.onLoot((event) => {
    broadcast(CH.lootEvent, event);
    for (const entry of store.applyLoot(event)) {
      broadcast(CH.lootMatched, { event, entry });
    }
  });
  watcher.onKill((event) => stats.recordKill(event.target, event.at));
  watcher.onXp((event) => stats.recordXp(event));
  stats.onChange((snapshot) => broadcast(CH.statsChanged, snapshot));

  // Global hotkey to show/hide the overlay — always works, even when the overlay
  // is click-through or the game has focus, so the float can never get "stuck".
  function toggleOverlay(): void {
    const win = getOverlayWindow();
    if (win && !win.isDestroyed()) {
      if (win.isVisible()) {
        win.hide();
        setOverlayOpen(false);
      } else {
        win.showInactive(); // don't steal focus from the game
        setOverlayOpen(true);
      }
    } else {
      createOverlayWindow(store.getSettings().overlay);
    }
  }
  const overlayReg = globalShortcut.register(OVERLAY_HOTKEY.accelerator, toggleOverlay);
  if (!overlayReg) log.warn("could not register overlay hotkey:", OVERLAY_HOTKEY.accelerator);
  const lookupReg = globalShortcut.register(LOOKUP_HOTKEY.accelerator, () => lookup.open());
  if (!lookupReg) log.warn("could not register lookup hotkey:", LOOKUP_HOTKEY.accelerator);
  appInfo = {
    logFile,
    hotkeys: [
      { action: "Toggle overlay", label: OVERLAY_HOTKEY.label, registered: overlayReg },
      { action: "Screengrab item lookup", label: LOOKUP_HOTKEY.label, registered: lookupReg },
    ],
  };

  createMainWindow();
  // Reopen the overlay if it was showing when the app last closed.
  if (wasOverlayOpen()) createOverlayWindow(store.getSettings().overlay);
  startWatcher();
  log.debug("app ready");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

  // Flush window state synchronously and mark quitting before windows tear down.
  app.on("before-quit", () => beginQuit());
  app.on("will-quit", () => globalShortcut.unregisterAll());

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
