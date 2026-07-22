/**
 * ipc.ts — registers the request/response IPC handlers backing window.eql.
 * Handlers stay thin: they translate a call into a store/wiki/watcher method.
 * One-way main→renderer events (list/settings/loot/status) are wired in main.ts.
 */
import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import { CH } from "../src/shared/ipc-channels";
import { WIKI_BASE } from "./wiki/api";
import { createMainWindow, applyOverlaySettings, getMainWindow } from "./windows";
import { resetPositions } from "./window-state";
import type { Store } from "./store";
import type { WikiClient } from "./wiki";
import type { LogWatcher } from "./log-watcher";
import type { SessionTracker } from "./session-stats";
import type { Lookup } from "./lookup";
import type { ShoppingListEntry, WikiPage, DeepPartial, Settings, Rect, AppInfo } from "../src/shared/types";

export interface IpcContext {
  store: Store;
  wiki: WikiClient;
  stats: SessionTracker;
  lookup: Lookup;
  /** Path to the debug log file. */
  logFile: string;
  /** The player's current zone (tracked from the log in main.ts). */
  getCurrentZone: () => string | null;
  /** Diagnostics for the Help section (hotkey registration, …). */
  getAppInfo: () => AppInfo;
  watcher: LogWatcher;
}

export function registerIpc({ store, wiki, watcher, stats, lookup, logFile, getCurrentZone, getAppInfo }: IpcContext): void {
  // ── shopping list ──
  ipcMain.handle(CH.listGet, () => store.getList());
  ipcMain.handle(CH.listAdd, (_e, input) => store.addEntry(input));
  ipcMain.handle(CH.listAddFromPage, (_e, page: WikiPage) => store.addFromPage(page));
  ipcMain.handle(CH.listUpdate, (_e, id: string, patch: Partial<ShoppingListEntry>) => store.updateEntry(id, patch));
  ipcMain.handle(CH.listRemove, (_e, id: string) => store.removeEntry(id));
  ipcMain.handle(CH.listClear, () => store.clearList());
  ipcMain.handle(CH.listSetRuns, (_e, originKey: string, runs: number) => store.setQuestRuns(originKey, runs));

  // ── settings ──
  ipcMain.handle(CH.settingsGet, () => store.getSettings());
  ipcMain.handle(CH.settingsUpdate, (_e, patch: DeepPartial<Settings>) => store.updateSettings(patch));
  ipcMain.handle(CH.settingsPickLogDir, async () => {
    const res = await dialog.showOpenDialog({
      title: "Select your EverQuest Logs folder",
      defaultPath: store.getSettings().logDir || undefined,
      properties: ["openDirectory"],
    });
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
  });

  // ── wiki ──
  ipcMain.handle(CH.wikiSearch, (_e, term: string) => wiki.search(term));
  ipcMain.handle(CH.wikiGetPage, (_e, title: string) => wiki.getPage(title));
  ipcMain.handle(CH.wikiSearchZones, (_e, term: string) => wiki.searchZones(term));
  ipcMain.handle(CH.wikiQuestsByZone, (_e, zone: string) => wiki.questsByZone(zone));
  // Open a wiki page in the user's browser. `target` is a wikiPath ("/Bone_Chips")
  // or a title ("Bone Chips"); host is validated so only eqlwiki links open.
  ipcMain.handle(CH.wikiOpen, (_e, target: string) => {
    const rel = target.startsWith("/") ? target : `/${target.replace(/ /g, "_")}`;
    const url = `${WIKI_BASE}${rel}`;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && parsed.hostname === "eqlwiki.com") return shell.openExternal(url);
    } catch {
      /* malformed target — ignore */
    }
    return Promise.resolve();
  });

  // ── watcher / zone / stats ──
  ipcMain.handle(CH.watcherStatus, () => watcher.status());
  ipcMain.handle(CH.zoneGet, () => getCurrentZone());
  ipcMain.handle(CH.statsGet, () => stats.snapshot());
  ipcMain.handle(CH.statsReset, () => {
    stats.reset(); // emits change → broadcast; also return the fresh snapshot to the caller
    return stats.snapshot();
  });

  // ── screengrab lookup + app info ──
  ipcMain.handle(CH.lookupCapture, (e, rect: Rect, view: { width: number; height: number }) =>
    lookup.capture(rect, view, e.sender),
  );
  ipcMain.handle(CH.lookupOpen, () => lookup.open());
  ipcMain.handle(CH.lookupCancel, () => lookup.cancel());
  ipcMain.handle(CH.appInfo, () => getAppInfo());
  ipcMain.handle(CH.appOpenLog, () => shell.openPath(logFile));

  // ── window control ──
  // "Open overlay" now just surfaces the single app window (kept for the API shape).
  ipcMain.handle(CH.overlayOpen, () => {
    const win = createMainWindow(store.getSettings().overlay);
    win.show();
    win.focus();
  });
  ipcMain.handle(CH.overlaySetClickThrough, (_e, enabled: boolean) => {
    store.updateSettings({ overlay: { clickThrough: enabled } });
    applyOverlaySettings(store.getSettings().overlay);
  });

  ipcMain.on(CH.winMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  // Hide to tray (single-window app): keep the process alive so the tray/hotkey can reshow.
  ipcMain.on(CH.winHide, (e) => BrowserWindow.fromWebContents(e.sender)?.hide());
  // Transient opacity (the "full opacity" toggle) — doesn't touch the saved setting.
  ipcMain.on(CH.winSetOpacity, (e, value: number) =>
    BrowserWindow.fromWebContents(e.sender)?.setOpacity(Math.max(0.2, Math.min(1, value))),
  );
  ipcMain.on(CH.winClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close());
  // Forget saved position and recenter the window (for a "lost" window).
  ipcMain.handle(CH.winResetPositions, () => {
    resetPositions();
    getMainWindow()?.center();
  });
}
