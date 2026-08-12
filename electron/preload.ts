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
    refresh: () => ipcRenderer.invoke(CH.wikiRefresh),
  },
  loot: {
    recent: (limit) => ipcRenderer.invoke(CH.lootRecent, limit),
    prices: () => ipcRenderer.invoke(CH.lootPrices),
    onEvent: (cb) => on(CH.lootEvent, cb),
    onMatched: (cb) => on(CH.lootMatched, cb),
  },
  alerts: {
    onCast: (cb) => on(CH.castAlert, cb),
    test: (watchId) => ipcRenderer.invoke(CH.alertsTest, watchId),
    placeLocation: () => ipcRenderer.invoke(CH.alertPlaceStart),
    onPlaceBegin: (cb) => on(CH.alertPlaceBegin, cb),
    placed: (point) => ipcRenderer.send(CH.alertPlaceDone, point),
  },
  log: {
    import: () => ipcRenderer.invoke(CH.logImport),
  },
  update: {
    current: () => ipcRenderer.invoke(CH.updateCurrent),
    onAvailable: (cb) => on(CH.updateAvailable, cb),
    open: () => ipcRenderer.invoke(CH.updateOpen),
    dismiss: () => ipcRenderer.invoke(CH.updateDismiss),
  },
  display: {
    list: () => ipcRenderer.invoke(CH.displaysList),
  },
  watcher: {
    status: () => ipcRenderer.invoke(CH.watcherStatus),
    onStatus: (cb) => on(CH.watcherStatusChanged, cb),
  },
  zone: {
    current: () => ipcRenderer.invoke(CH.zoneGet),
    onChanged: (cb) => on(CH.zoneChanged, cb),
  },
  loc: {
    current: () => ipcRenderer.invoke(CH.locGet),
    onChanged: (cb) => on(CH.locChanged, cb),
  },
  combat: {
    get: () => ipcRenderer.invoke(CH.combatGet),
    reset: () => ipcRenderer.invoke(CH.combatReset),
    onChanged: (cb) => on(CH.combatChanged, cb),
    sessions: () => ipcRenderer.invoke(CH.combatSessions),
    fights: (sessionId) => ipcRenderer.invoke(CH.combatFights, sessionId),
    searchFights: (term) => ipcRenderer.invoke(CH.combatSearchFights, term),
    zones: () => ipcRenderer.invoke(CH.combatZones),
    bests: () => ipcRenderer.invoke(CH.combatBests),
    clearHistory: () => ipcRenderer.invoke(CH.combatClearHistory),
  },
  mobs: {
    all: (zone) => ipcRenderer.invoke(CH.mobsAll, zone),
    mine: (zone) => ipcRenderer.invoke(CH.mobsMine, zone),
    report: (by, observations) => ipcRenderer.invoke(CH.mobsReport, by, observations),
    forgetPeers: () => ipcRenderer.invoke(CH.mobsForgetPeers),
  },
  kills: {
    all: (zone) => ipcRenderer.invoke(CH.killsAll, zone),
    clear: (scope) => ipcRenderer.invoke(CH.killsClear, scope),
    onChanged: (cb) => on(CH.killsChanged, cb),
  },
  hp: {
    get: () => ipcRenderer.invoke(CH.hpGet),
    set: (max) => ipcRenderer.invoke(CH.hpSet, max),
    setRegen: (perTick) => ipcRenderer.invoke(CH.hpSetRegen, perTick),
    onChanged: (cb) => on(CH.hpChanged, cb),
  },
  xp: {
    get: () => ipcRenderer.invoke(CH.xpGet),
    set: (intoLevel, level) => ipcRenderer.invoke(CH.xpSet, intoLevel, level),
    onChanged: (cb) => on(CH.xpChanged, cb),
  },
  lookup: {
    open: () => ipcRenderer.invoke(CH.lookupOpen),
    capture: (rect, view) => ipcRenderer.invoke(CH.lookupCapture, rect, view),
    cancel: () => ipcRenderer.invoke(CH.lookupCancel),
  },
  app: {
    info: () => ipcRenderer.invoke(CH.appInfo),
    openLog: () => ipcRenderer.invoke(CH.appOpenLog),
    onDataChanged: (cb) => on(CH.dataChanged, cb),
  },
  search: {
    onPrefill: (cb) => on(CH.searchPrefill, cb),
    show: (text) => ipcRenderer.invoke(CH.searchShow, text),
  },
  nav: {
    onCommand: (cb) => on(CH.navCommand, cb),
  },
  travel: {
    route: (sourceId, from, to, options) => ipcRenderer.invoke(CH.travelRoute, sourceId, from, to, options),
  },
  map: {
    open: () => ipcRenderer.invoke(CH.winOpenMap),
    openAt: (zone, loc, label) => ipcRenderer.invoke(CH.mapOpenAt, zone, loc, label),
    onViewZone: (cb) => on(CH.mapViewZone, cb),
    emphasize: (emphasis) => ipcRenderer.send(CH.mapEmphasize, emphasis),
    onEmphasis: (cb) => on(CH.mapEmphasis, cb),
    openP99: (zone) => ipcRenderer.invoke(CH.mapOpenP99, zone),
    sources: () => ipcRenderer.invoke(CH.mapSources),
    load: (sourceId, zoneFile) => ipcRenderer.invoke(CH.mapLoad, sourceId, zoneFile),
    names: (sourceId) => ipcRenderer.invoke(CH.mapNames, sourceId),
  },
  awari: {
    send: (payload) => ipcRenderer.send(CH.awariOutbound, payload),
    onMessage: (cb) => on(CH.awariMessage, cb),
    onStatus: (cb) => on(CH.awariStatusChanged, cb),
    onPeers: (cb) => on(CH.awariPeersChanged, cb),
    onPublish: (cb) => on(CH.awariPublish, cb),
    reportMessage: (msg) => ipcRenderer.send(CH.awariInbound, msg),
    reportStatus: (status) => ipcRenderer.send(CH.awariStatus, status),
    reportPeers: (peers) => ipcRenderer.send(CH.awariPeers, peers),
  },
  win: {
    minimize: () => ipcRenderer.send(CH.winMinimize),
    toggleMaximize: () => ipcRenderer.send(CH.winToggleMaximize),
    onMaximizeChanged: (cb) => on(CH.winMaximizeChanged, cb),
    hide: () => ipcRenderer.send(CH.winHide),
    setOpacity: (value) => ipcRenderer.send(CH.winSetOpacity, value),
    setAlwaysOnTop: (enabled) => ipcRenderer.send(CH.winSetAlwaysOnTop, enabled),
    close: () => ipcRenderer.send(CH.winClose),
    resetPositions: () => ipcRenderer.invoke(CH.winResetPositions),
  },
};

contextBridge.exposeInMainWorld("eql", api);
