/**
 * ipc.ts — registers the request/response IPC handlers backing window.eql.
 * Handlers stay thin: they translate a call into a store/wiki/watcher method.
 * One-way main→renderer events (list/settings/loot/status) are wired in main.ts.
 */
import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import { CH } from "../src/shared/ipc-channels";
import { p99ZoneUrl } from "../src/shared/constants";
import { WIKI_BASE } from "./wiki/api";
import { createMainWindow, createMapWindow, applyOverlaySettings, getMainWindow } from "./windows";
import { resetPositions } from "./window-state";
import type { Store } from "./store";
import type { WikiClient } from "./wiki";
import type { LogWatcher } from "./log-watcher";
import type { CombatTracker } from "./combat-stats";
import type { CombatHistory } from "./combat-history";
import type { XpTracker } from "./xp-progress";
import type { HpTracker } from "./hp-estimate";
import type { KillLog } from "./kill-log";
import type { MobKnowledgeStore } from "./mob-knowledge";
import type { Lookup } from "./lookup";
import type { ShoppingListEntry, WikiPage, DeepPartial, Settings, Rect, AppInfo, LocEvent, AwariPayload, AwariInbound, AwariStatus, AwariPeer } from "../src/shared/types";
import type { MobObservation } from "../src/shared/mob-stats";

export interface IpcContext {
  store: Store;
  wiki: WikiClient;
  combat: CombatTracker;
  history: CombatHistory;
  xp: XpTracker;
  hp: HpTracker;
  killLog: KillLog;
  mobs: MobKnowledgeStore;
  lookup: Lookup;
  /** Path to the debug log file. */
  logFile: string;
  /** The player's current zone (tracked from the log in main.ts). */
  getCurrentZone: () => string | null;
  /** The player's last logged location (tracked from the log in main.ts). */
  getCurrentLoc: () => LocEvent | null;
  /** Diagnostics for the Help section (hotkey registration, …). */
  getAppInfo: () => AppInfo;
  /** Push an event to every window (owned by main.ts). */
  broadcast: (channel: string, payload: unknown) => void;
  watcher: LogWatcher;
}

export function registerIpc({ store, wiki, watcher, combat, history, xp, hp, killLog, mobs, lookup, logFile, getCurrentZone, getCurrentLoc, getAppInfo, broadcast }: IpcContext): void {
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
  ipcMain.handle(CH.locGet, () => getCurrentLoc());
  ipcMain.handle(CH.combatGet, () => combat.snapshot());
  ipcMain.handle(CH.combatReset, () => {
    combat.reset();
    return combat.snapshot();
  });
  ipcMain.handle(CH.combatSessions, () => history.sessions());
  ipcMain.handle(CH.combatFights, (_e, sessionId: string) => history.fights(sessionId));
  ipcMain.handle(CH.combatZones, () => history.zones());
  ipcMain.handle(CH.combatBests, () => history.bests());
  ipcMain.handle(CH.xpGet, () => xp.state());
  // The one figure the log can't give us, supplied by the player (see xp-progress.ts).
  ipcMain.handle(CH.xpSet, (_e, intoLevel: number, level?: number) => xp.set(intoLevel, level));
  ipcMain.handle(CH.hpGet, () => hp.state());
  ipcMain.handle(CH.hpSet, (_e, max: number) => hp.set(max));
  ipcMain.handle(CH.hpSetRegen, (_e, perTick: number) => hp.setRegen(perTick));
  ipcMain.handle(CH.killsAll, (_e, zone?: string) => killLog.kills(zone));
  ipcMain.handle(CH.killsClear, () => killLog.clear());
  ipcMain.handle(CH.mobsAll, (_e, zone?: string) => mobs.all(zone));
  ipcMain.handle(CH.mobsMine, (_e, zone?: string) => mobs.mine(zone));
  ipcMain.handle(CH.mobsReport, (_e, by: string, observations: MobObservation[]) => mobs.report(by, observations));
  ipcMain.handle(CH.mobsForgetPeers, () => mobs.forgetPeers());
  ipcMain.handle(CH.combatClearHistory, () => {
    history.clear();
    return history.sessions();
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
  // Open (or focus) the sibling map window.
  ipcMain.handle(CH.winOpenMap, () => {
    const win = createMapWindow(store.getSettings().overlay);
    win.show();
    win.focus();
  });
  // Open the map window and tell it to view a zone (and optionally drop a marker).
  ipcMain.handle(CH.mapOpenAt, (_e, zone: string, loc?: { y: number; x: number }, label?: string) => {
    const win = createMapWindow(store.getSettings().overlay);
    win.show();
    win.focus();
    const send = () => win.webContents.send(CH.mapViewZone, { zone, loc, label });
    if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
    else send();
  });
  // Open a zone's map page on the Project 1999 wiki (host fixed, so it's safe).
  ipcMain.handle(CH.mapOpenP99, (_e, zone: string) => shell.openExternal(p99ZoneUrl(zone)));

  // ── awari peer networking broker (see ADR 0012) ──
  // The always-alive main window owns the single WebRTC connection; the main process
  // is a pure relay. Any window's send → the owner publishes it; the owner's inbound
  // peer messages + status → fanned out to every window (the map, and anything else).
  ipcMain.on(CH.awariOutbound, (_e, payload: AwariPayload) => getMainWindow()?.webContents.send(CH.awariPublish, payload));
  ipcMain.on(CH.awariInbound, (_e, msg: AwariInbound) => broadcast(CH.awariMessage, msg));
  ipcMain.on(CH.awariStatus, (_e, status: AwariStatus) => broadcast(CH.awariStatusChanged, status));
  ipcMain.on(CH.awariPeers, (_e, peers: AwariPeer[]) => broadcast(CH.awariPeersChanged, peers));

  ipcMain.on(CH.winMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  // Hide to tray (single-window app): keep the process alive so the tray/hotkey can reshow.
  ipcMain.on(CH.winHide, (e) => BrowserWindow.fromWebContents(e.sender)?.hide());
  // Transient opacity (the "full opacity" toggle) — doesn't touch the saved setting.
  ipcMain.on(CH.winSetOpacity, (e, value: number) =>
    BrowserWindow.fromWebContents(e.sender)?.setOpacity(Math.max(0.2, Math.min(1, value))),
  );
  ipcMain.on(CH.winSetAlwaysOnTop, (e, enabled: boolean) =>
    BrowserWindow.fromWebContents(e.sender)?.setAlwaysOnTop(!!enabled, "screen-saver"),
  );
  ipcMain.on(CH.winClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close());
  // Forget saved position and recenter the window (for a "lost" window).
  ipcMain.handle(CH.winResetPositions, () => {
    resetPositions();
    getMainWindow()?.center();
  });
}
