/**
 * main.ts — Electron entry point. Boots the store, wiki client and log watcher,
 * registers IPC, opens the control window, and fans out main→renderer events:
 *   - store changes  → every window re-renders the same list/settings
 *   - loot events     → broadcast raw, then matched entries after the store applies them
 *   - settings changes → overlay restyled + watcher re-targeted when the log path moves
 */
import { app, BrowserWindow, globalShortcut, shell, Tray, Menu, nativeImage } from "electron";
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
import { createMainWindow, createMapWindow, getMainWindow, getMapWindow, applyOverlaySettings } from "./windows";
import { resetPositions, beginQuit, wasMapOpen } from "./window-state";
import { CH } from "../src/shared/ipc-channels";
import { OVERLAY_HOTKEY, LOOKUP_HOTKEY } from "../src/shared/constants";
import { createLogger, setLogSink, formatLogParts } from "../src/shared/logging";
import type { Settings, AppInfo, LocEvent } from "../src/shared/types";

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
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${level.toUpperCase()} ${formatLogParts(parts)}\n`);
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
  let currentLoc: LocEvent | null = null;
  let appInfo: AppInfo = { hotkeys: [], logFile };

  syncDebugFlag(store.getSettings());
  registerIpc({
    store,
    wiki,
    watcher,
    stats,
    lookup,
    logFile,
    getCurrentZone: () => currentZone,
    getCurrentLoc: () => currentLoc,
    getAppInfo: () => appInfo,
    broadcast,
  });

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
    tray?.setContextMenu(buildTrayMenu()); // keep the "Debug logging" checkbox in sync
    // Only re-target the watcher when the log location actually changed.
    if (`${settings.logDir}|${settings.activeLogFile}` !== watchKey) startWatcher();
  });
  watcher.onStatus((status) => broadcast(CH.watcherStatusChanged, status));
  watcher.onZone((event) => {
    if (event.zone === currentZone) return;
    currentZone = event.zone;
    broadcast(CH.zoneChanged, currentZone);
  });
  watcher.onLoc((event) => {
    currentLoc = event;
    broadcast(CH.locChanged, currentLoc);
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

  // Global hotkey to show/hide the app window — always works even when the game has
  // focus, so the float can never get "stuck" behind the game.
  function toggleWindow(): void {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isVisible() && !win.isMinimized()) {
        win.hide();
      } else {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    } else {
      createMainWindow(store.getSettings().overlay);
    }
  }
  const overlayReg = globalShortcut.register(OVERLAY_HOTKEY.accelerator, toggleWindow);
  if (!overlayReg) log.warn("could not register window hotkey:", OVERLAY_HOTKEY.accelerator);

  // System tray: show/hide + the dev-only options (kept out of the in-app UI).
  let tray: Tray | null = null;
  function buildTrayMenu(): Menu {
    const s = store.getSettings();
    return Menu.buildFromTemplate([
      { label: "Show / Hide EQ List", click: () => toggleWindow() },
      { type: "separator" },
      {
        label: "Debug logging",
        type: "checkbox",
        checked: s.debug,
        click: (item) => store.updateSettings({ debug: item.checked }),
      },
      { label: "Open debug log", click: () => void shell.openPath(logFile) },
      {
        label: "Open developer tools",
        click: () => {
          // Open devtools for every real window (main + map) so per-window logs —
          // e.g. the map's ping broadcast — are visible in their own console.
          const wins = [getMainWindow(), getMapWindow()].filter(
            (w): w is BrowserWindow => !!w && !w.isDestroyed(),
          );
          if (!wins.length) wins.push(createMainWindow(store.getSettings().overlay));
          for (const w of wins) w.webContents.openDevTools({ mode: "detach" });
        },
      },
      {
        label: "Reset window position",
        click: () => {
          resetPositions();
          const win = getMainWindow() ?? createMainWindow(store.getSettings().overlay);
          win.center();
          win.show();
          win.focus();
        },
      },
      { type: "separator" },
      { label: "Quit EQ List", click: () => { beginQuit(); app.quit(); } },
    ]);
  }
  function createTray(): void {
    const iconPath = path.join(app.getAppPath(), "out", "favicon.ico");
    let image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) image = nativeImage.createEmpty();
    tray = new Tray(image);
    tray.setToolTip("EQ List");
    tray.setContextMenu(buildTrayMenu());
    tray.on("click", () => toggleWindow());
  }
  const lookupReg = globalShortcut.register(LOOKUP_HOTKEY.accelerator, () => lookup.open());
  if (!lookupReg) log.warn("could not register lookup hotkey:", LOOKUP_HOTKEY.accelerator);
  appInfo = {
    logFile,
    hotkeys: [
      { action: "Show / hide window", label: OVERLAY_HOTKEY.label, registered: overlayReg },
      { action: "Screengrab item lookup", label: LOOKUP_HOTKEY.label, registered: lookupReg },
    ],
  };

  createMainWindow(store.getSettings().overlay);
  // Restore the map window if it was open last session.
  if (wasMapOpen()) createMapWindow(store.getSettings().overlay);
  createTray();
  startWatcher();
  log.debug("app ready");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(store.getSettings().overlay);
  });
});

  // Flush window state synchronously and mark quitting before windows tear down.
  app.on("before-quit", () => beginQuit());
  app.on("will-quit", () => globalShortcut.unregisterAll());

  // Single-window app with a tray: the ✕ hides to tray, so don't quit when the
  // window closes — the tray (or the hotkey) brings it back. Quit is via the tray.
  app.on("window-all-closed", () => {
    /* stay resident in the tray */
  });
}
