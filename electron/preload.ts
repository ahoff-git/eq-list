/**
 * preload.ts — exposes the typed `window.eql` bridge (EqlApi) to the renderer.
 * The renderer never touches ipcRenderer or Node directly; everything crosses
 * here. `invoke` maps to request/response calls, `on` to main→renderer events
 * (each returns an unsubscribe fn), and `send` to fire-and-forget window control.
 */
import { contextBridge, ipcRenderer } from "electron";
import { CH } from "../src/shared/ipc-channels";
import type { EqlApi, Unsubscribe } from "../src/shared/types";

function on<T>(channel: string, cb: (payload: T) => void): Unsubscribe {
  const listener = (_e: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

/** Which window this is, from the --eql-role argument set when it was created. */
function role(): "main" | "overlay" {
  const arg = process.argv.find((a) => a.startsWith("--eql-role="));
  return arg?.split("=")[1] === "overlay" ? "overlay" : "main";
}

const api: EqlApi = {
  list: {
    get: () => ipcRenderer.invoke(CH.listGet),
    add: (input) => ipcRenderer.invoke(CH.listAdd, input),
    addFromPage: (page) => ipcRenderer.invoke(CH.listAddFromPage, page),
    update: (id, patch) => ipcRenderer.invoke(CH.listUpdate, id, patch),
    remove: (id) => ipcRenderer.invoke(CH.listRemove, id),
    clear: () => ipcRenderer.invoke(CH.listClear),
    setRuns: (originKey, runs) => ipcRenderer.invoke(CH.listSetRuns, originKey, runs),
    onChanged: (cb) => on(CH.listChanged, cb),
  },
  settings: {
    get: () => ipcRenderer.invoke(CH.settingsGet),
    update: (patch) => ipcRenderer.invoke(CH.settingsUpdate, patch),
    pickLogDir: () => ipcRenderer.invoke(CH.settingsPickLogDir),
    onChanged: (cb) => on(CH.settingsChanged, cb),
  },
  wiki: {
    search: (term) => ipcRenderer.invoke(CH.wikiSearch, term),
    getPage: (title) => ipcRenderer.invoke(CH.wikiGetPage, title),
    searchZones: (term) => ipcRenderer.invoke(CH.wikiSearchZones, term),
    questsByZone: (zone) => ipcRenderer.invoke(CH.wikiQuestsByZone, zone),
    openInBrowser: (target) => ipcRenderer.invoke(CH.wikiOpen, target),
  },
  loot: {
    onEvent: (cb) => on(CH.lootEvent, cb),
    onMatched: (cb) => on(CH.lootMatched, cb),
  },
  watcher: {
    status: () => ipcRenderer.invoke(CH.watcherStatus),
    onStatus: (cb) => on(CH.watcherStatusChanged, cb),
  },
  zone: {
    current: () => ipcRenderer.invoke(CH.zoneGet),
    onChanged: (cb) => on(CH.zoneChanged, cb),
  },
  stats: {
    get: () => ipcRenderer.invoke(CH.statsGet),
    reset: () => ipcRenderer.invoke(CH.statsReset),
    onChanged: (cb) => on(CH.statsChanged, cb),
  },
  lookup: {
    open: () => ipcRenderer.invoke(CH.lookupOpen),
    capture: (rect, view) => ipcRenderer.invoke(CH.lookupCapture, rect, view),
    cancel: () => ipcRenderer.invoke(CH.lookupCancel),
  },
  app: {
    info: () => ipcRenderer.invoke(CH.appInfo),
    openLog: () => ipcRenderer.invoke(CH.appOpenLog),
  },
  search: {
    onPrefill: (cb) => on(CH.searchPrefill, cb),
  },
  nav: {
    onCommand: (cb) => on(CH.navCommand, cb),
  },
  overlay: {
    open: () => ipcRenderer.invoke(CH.overlayOpen),
    setClickThrough: (enabled) => ipcRenderer.invoke(CH.overlaySetClickThrough, enabled),
  },
  win: {
    role: () => Promise.resolve(role()),
    minimize: () => ipcRenderer.send(CH.winMinimize),
    hide: () => ipcRenderer.send(CH.winHide),
    setOpacity: (value) => ipcRenderer.send(CH.winSetOpacity, value),
    close: () => ipcRenderer.send(CH.winClose),
    resetPositions: () => ipcRenderer.invoke(CH.winResetPositions),
  },
};

contextBridge.exposeInMainWorld("eql", api);
