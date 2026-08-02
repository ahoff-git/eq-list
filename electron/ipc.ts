/**
 * ipc.ts — registers the request/response IPC handlers backing window.eql.
 * Handlers stay thin: they translate a call into a store/wiki/watcher method.
 * One-way main→renderer events (list/settings/loot/status) are wired in main.ts.
 */
import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import { CH } from "../src/shared/ipc-channels";
import { p99ZoneUrl } from "../src/shared/constants";
import { characterFromLogFile } from "../src/shared/log-parser";
import { createLogger } from "../src/shared/logging";
import { WIKI_BASE } from "./wiki/api";
import { importLog } from "./log-import";
import { createMapWindow, getAlertWindow, getMainWindow, showInSearch } from "./windows";
import { resetPositions } from "./window-state";
import type { Store } from "./store";
import type { WikiClient } from "./wiki";
import type { LogWatcher } from "./log-watcher";
import type { CombatTracker } from "./combat-stats";
import type { CombatHistory } from "./combat-history";
import type { XpTracker } from "./xp-progress";
import type { HpTracker } from "./hp-estimate";
import type { KillLog } from "./kill-log";
import type { LootLog } from "./loot-log";
import type { UpdateChecker } from "./update-check";
import type { MobKnowledgeStore } from "./mob-knowledge";
import type { Lookup } from "./lookup";
import type { ShoppingListEntry, WikiPage, DeepPartial, Settings, Rect, AppInfo, LocEvent, AwariPayload, AwariInbound, AwariStatus, AwariPeer, CastAlertEvent } from "../src/shared/types";
import type { MobObservation } from "../src/shared/mob-stats";

const log = createLogger("ipc");

export interface IpcContext {
  store: Store;
  wiki: WikiClient;
  combat: CombatTracker;
  history: CombatHistory;
  xp: XpTracker;
  hp: HpTracker;
  killLog: KillLog;
  lootLog: LootLog;
  updates: UpdateChecker;
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

export function registerIpc({ store, wiki, watcher, combat, history, xp, hp, killLog, lootLog, updates, mobs, lookup, logFile, getCurrentZone, getCurrentLoc, getAppInfo, broadcast }: IpcContext): void {
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

  // Fire a sample cast alert (the Settings "Test" button) down the real broadcast path,
  // so it shows in every window and beeps just like a live one. Uses a watched spell name
  // when there is one, so the test looks like what you'd actually see.
  ipcMain.handle(CH.alertsTest, () => {
    const watch = store.getSettings().castAlerts.watches.find((w) => w.enabled && w.spell.trim());
    getAlertWindow()?.moveTop(); // you're on the Settings tab, so raise the overlay above it
    broadcast(CH.castAlert, {
      caster: "Test",
      spell: watch?.spell.trim() || "Fear",
      at: new Date().toISOString(),
    } satisfies CastAlertEvent);
  });

  // "Eat" a log file: digest it into the kill log (→ mob knowledge). The kill log flags your
  // own kills by character name, so name it for THIS log's character during the import, then
  // restore the live watcher's character afterwards.
  ipcMain.handle(CH.logImport, async () => {
    const res = await dialog.showOpenDialog({
      title: "Choose an EverQuest log to digest",
      properties: ["openFile"],
      filters: [
        { name: "EQ logs", extensions: ["txt"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (res.canceled || !res.filePaths.length) return null;
    const file = res.filePaths[0];
    const live = characterFromLogFile(watcher.status().file) ?? "";
    try {
      killLog.setPlayer(characterFromLogFile(file) ?? "");
      const result = importLog(file, killLog);
      killLog.flush();
      log.debug("digested log", { file, ...result });
      // The import lands out-of-band (no live loc/zone event to piggyback on), so nudge every
      // open window to refetch kills + mob knowledge — otherwise the new data only shows on reopen.
      broadcast(CH.killsChanged, undefined);
      return { file, ...result };
    } catch (e) {
      log.warn("log import failed:", (e as Error).message);
      return null;
    } finally {
      killLog.setPlayer(live); // restore the live character's identity for ongoing watching
    }
  });

  // ── wiki ──
  ipcMain.handle(CH.wikiSearch, (_e, term: string) => wiki.search(term));
  ipcMain.handle(CH.wikiGetPage, (_e, title: string) => wiki.getPage(title));
  ipcMain.handle(CH.wikiSearchZones, (_e, term: string) => wiki.searchZones(term));
  ipcMain.handle(CH.wikiQuestsByZone, (_e, zone: string) => wiki.questsByZone(zone));
  ipcMain.handle(CH.wikiRefresh, () => wiki.refresh());
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
  ipcMain.handle(CH.killsClear, () => {
    killLog.clear();
    broadcast(CH.killsChanged, undefined);
  });
  // The loot feed's history — tracked in the main process, so the tab shows drops from before
  // it was opened, then follows live ones over CH.lootEvent.
  ipcMain.handle(CH.lootRecent, (_e, limit?: number) => lootLog.recent(limit));
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
  ipcMain.handle(CH.searchShow, (_e, text: string) => showInSearch(text));
  ipcMain.handle(CH.lookupCancel, () => lookup.cancel());
  ipcMain.handle(CH.appInfo, () => getAppInfo());
  ipcMain.handle(CH.appOpenLog, () => shell.openPath(logFile));

  // ── update notification ──
  // The renderer draws the banner; the URL/commit stay in the main process. `current` lets a
  // tab that mounted after the check still catch the notice.
  ipcMain.handle(CH.updateCurrent, () => {
    const info = updates.latest();
    return info ? { url: info.url } : null;
  });
  ipcMain.handle(CH.updateOpen, () => {
    const info = updates.latest();
    if (info && isGithubUrl(info.url)) void shell.openExternal(info.url);
    updates.markSeen(); // acting on it counts as seen — don't nag for this build again
  });
  ipcMain.handle(CH.updateDismiss, () => updates.markSeen());

  // ── window control ──
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

/** Only ever open a github.com https link — the release URL comes from the API, so pin the host. */
function isGithubUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "github.com" || u.hostname.endsWith(".github.com"));
  } catch {
    return false;
  }
}
