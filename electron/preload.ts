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
  ui: {
    all: () => ipcRenderer.invoke(CH.uiStateAll),
    set: (key, value) => ipcRenderer.invoke(CH.uiStateSet, key, value),
  },
  wiki: {
    search: (term) => ipcRenderer.invoke(CH.wikiSearch, term),
    getPage: (title) => ipcRenderer.invoke(CH.wikiGetPage, title),
    refreshPage: (title) => ipcRenderer.invoke(CH.wikiRefreshPage, title),
    searchZones: (term) => ipcRenderer.invoke(CH.wikiSearchZones, term),
    questsByZone: (zone) => ipcRenderer.invoke(CH.wikiQuestsByZone, zone),
    outOfEraZones: () => ipcRenderer.invoke(CH.wikiOutOfEraZones),
    openInBrowser: (target) => ipcRenderer.invoke(CH.wikiOpen, target),
    refresh: () => ipcRenderer.invoke(CH.wikiRefresh),
    cachedItems: () => ipcRenderer.invoke(CH.wikiCachedItems),
    harvestStart: (opts) => ipcRenderer.invoke(CH.wikiHarvestStart, opts),
    harvestStop: () => ipcRenderer.invoke(CH.wikiHarvestStop),
    harvestStatus: () => ipcRenderer.invoke(CH.wikiHarvestStatus),
    onHarvest: (cb) => on(CH.wikiHarvestProgress, cb),
  },
  lucy: {
    search: (term) => ipcRenderer.invoke(CH.lucySearch, term),
    getItem: (id) => ipcRenderer.invoke(CH.lucyGetItem, id),
    cachedByName: (name) => ipcRenderer.invoke(CH.lucyCachedByName, name),
    openInBrowser: (target) => ipcRenderer.invoke(CH.lucyOpen, target),
    cachedItems: () => ipcRenderer.invoke(CH.lucyCachedItems),
    nameIndex: () => ipcRenderer.invoke(CH.lucyNameIndex),
  },
  loot: {
    recent: (limit) => ipcRenderer.invoke(CH.lootRecent, limit),
    prices: () => ipcRenderer.invoke(CH.lootPrices),
    items: () => ipcRenderer.invoke(CH.lootItems),
    onEvent: (cb) => on(CH.lootEvent, cb),
    onMatched: (cb) => on(CH.lootMatched, cb),
  },
  alerts: {
    onCast: (cb) => on(CH.castAlert, cb),
    test: (watchId) => ipcRenderer.invoke(CH.alertsTest, watchId),
    preview: (style) => ipcRenderer.invoke(CH.alertsPreview, style),
    placeLocation: () => ipcRenderer.invoke(CH.alertPlaceStart),
    onPlaceBegin: (cb) => on(CH.alertPlaceBegin, cb),
    placed: (point) => ipcRenderer.send(CH.alertPlaceDone, point),
  },
  log: {
    import: () => ipcRenderer.invoke(CH.logImport),
    recent: (bytes) => ipcRenderer.invoke(CH.logRecent, bytes),
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
  records: {
    board: () => ipcRenderer.invoke(CH.recordsBoard),
    onRecord: (cb) => on(CH.recordSet, cb),
    test: () => ipcRenderer.invoke(CH.recordsTest),
    clear: () => ipcRenderer.invoke(CH.recordsClear),
  },
  mobs: {
    all: (zone) => ipcRenderer.invoke(CH.mobsAll, zone),
    mine: (zone) => ipcRenderer.invoke(CH.mobsMine, zone),
    contributors: () => ipcRenderer.invoke(CH.mobsContributors),
    forgetPeers: (id) => ipcRenderer.invoke(CH.mobsForgetPeers, id),
  },
  peers: {
    kills: (zone) => ipcRenderer.invoke(CH.peerKillsAll, zone),
    onChanged: (cb) => on(CH.peerDataChanged, cb),
  },
  kills: {
    all: (zone) => ipcRenderer.invoke(CH.killsAll, zone),
    clear: (scope) => ipcRenderer.invoke(CH.killsClear, scope),
    onChanged: (cb) => on(CH.killsChanged, cb),
  },
  spawns: {
    view: () => ipcRenderer.invoke(CH.spawnsView),
    state: (key, seconds) => ipcRenderer.invoke(CH.spawnsState, key, seconds),
    markNamed: (mob, named) => ipcRenderer.invoke(CH.spawnsMarkNamed, mob, named),
    pad: (key, seconds) => ipcRenderer.invoke(CH.spawnsPad, key, seconds),
    markUp: (key, id) => ipcRenderer.invoke(CH.spawnsMarkUp, key, id),
    markNotUp: (key, id) => ipcRenderer.invoke(CH.spawnsMarkNotUp, key, id),
    markDead: (key, at) => ipcRenderer.invoke(CH.spawnsMarkDead, key, at),
    add: (name, zone, seconds, kind) => ipcRenderer.invoke(CH.spawnsAdd, name, zone, seconds, kind),
    remove: (key) => ipcRenderer.invoke(CH.spawnsRemove, key),
    notify: (key, on) => ipcRenderer.invoke(CH.spawnsNotify, key, on),
    style: (key, styleId) => ipcRenderer.invoke(CH.spawnsStyle, key, styleId),
    showOnScreen: (key, on) => ipcRenderer.invoke(CH.spawnsOnScreen, key, on),
    relearn: (key) => ipcRenderer.invoke(CH.spawnsRelearn, key),
    forgetSightings: (key) => ipcRenderer.invoke(CH.spawnsForgetSightings, key),
    forgetFloor: (key) => ipcRenderer.invoke(CH.spawnsForgetFloor, key),
    setGapDropped: (key, id, dropped) => ipcRenderer.invoke(CH.spawnsDropGap, key, id, dropped),
    stop: (key, id) => ipcRenderer.invoke(CH.spawnsStop, key, id),
    queue: (key, on) => ipcRenderer.invoke(CH.spawnsQueue, key, on),
    repeat: (key, on) => ipcRenderer.invoke(CH.spawnsRepeat, key, on),
    onChanged: (cb) => on(CH.spawnsChanged, cb),
  },
  buffs: {
    view: () => ipcRenderer.invoke(CH.buffsView),
    track: (key, on) => ipcRenderer.invoke(CH.buffsTrack, key, on),
    notify: (key, on) => ipcRenderer.invoke(CH.buffsNotify, key, on),
    showOnScreen: (key, on) => ipcRenderer.invoke(CH.buffsOnScreen, key, on),
    style: (key, styleId) => ipcRenderer.invoke(CH.buffsStyle, key, styleId),
    forget: (key) => ipcRenderer.invoke(CH.buffsForget, key),
    dismiss: (key, target) => ipcRenderer.invoke(CH.buffsDismiss, key, target),
    dismissAll: () => ipcRenderer.invoke(CH.buffsDismissAll),
    onChanged: (cb) => on(CH.buffsChanged, cb),
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
    ready: () => ipcRenderer.invoke(CH.lookupReady),
    capture: (rect, view) => ipcRenderer.invoke(CH.lookupCapture, rect, view),
    cancel: () => ipcRenderer.invoke(CH.lookupCancel),
  },
  app: {
    info: () => ipcRenderer.invoke(CH.appInfo),
    openLog: () => ipcRenderer.invoke(CH.appOpenLog),
    dataHealth: () => ipcRenderer.invoke(CH.dataHealth),
    selfCheck: () => ipcRenderer.invoke(CH.selfCheck),
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
    survey: (sourceId, zone, options) => ipcRenderer.invoke(CH.travelSurvey, sourceId, zone, options),
  },
  map: {
    open: () => ipcRenderer.invoke(CH.winOpenMap),
    openAt: (zone, loc, label, focus) => ipcRenderer.invoke(CH.mapOpenAt, zone, loc, label, focus),
    onViewZone: (cb) => on(CH.mapViewZone, cb),
    emphasize: (emphasis) => ipcRenderer.send(CH.mapEmphasize, emphasis),
    addPins: (pins) => ipcRenderer.send(CH.mapAddPins, pins),
    onPinsAdded: (cb) => on(CH.mapPinsAdded, cb),
    onEmphasis: (cb) => on(CH.mapEmphasis, cb),
    openP99: (zone) => ipcRenderer.invoke(CH.mapOpenP99, zone),
    sources: () => ipcRenderer.invoke(CH.mapSources),
    load: (sourceId, zoneFile) => ipcRenderer.invoke(CH.mapLoad, sourceId, zoneFile),
    names: (sourceId) => ipcRenderer.invoke(CH.mapNames, sourceId),
  },
  awari: {
    send: (payload, to) => ipcRenderer.send(CH.awariOutbound, { payload, to }),
    onMessage: (cb) => on(CH.awariMessage, cb),
    onStatus: (cb) => on(CH.awariStatusChanged, cb),
    onPeers: (cb) => on(CH.awariPeersChanged, cb),
    onPublish: (cb) => on(CH.awariPublish, cb),
    onRejoin: (cb) => on(CH.awariRejoin, cb),
    reportMessage: (msg) => ipcRenderer.send(CH.awariInbound, msg),
    reportStatus: (status) => ipcRenderer.send(CH.awariStatus, status),
    reportPeers: (peers) => ipcRenderer.send(CH.awariPeers, peers),
  },
  peer: {
    offer: () => ipcRenderer.invoke(CH.peerOffer),
    room: () => ipcRenderer.invoke(CH.peerRoom),
    rejoin: () => ipcRenderer.send(CH.peerRejoin),
    mine: (kind) => ipcRenderer.invoke(CH.peerMine, kind),
    ask: (peerId, kind) => ipcRenderer.send(CH.peerAsk, peerId, kind),
    received: (peerId, kind) => ipcRenderer.invoke(CH.peerReceived, peerId, kind),
    clear: (peerId, kind) => ipcRenderer.send(CH.peerClearShares, peerId, kind),
    setPins: (pins) => ipcRenderer.send(CH.peerSetPins, pins),
    onChanged: (cb) => on(CH.peerShareChanged, cb),
    onOffered: (cb) => on(CH.peerOffered, cb),
    onOutdated: (cb) => on(CH.peerOutdated, cb),
  },
  win: {
    minimize: () => ipcRenderer.send(CH.winMinimize),
    toggleMaximize: () => ipcRenderer.send(CH.winToggleMaximize),
    onMaximizeChanged: (cb) => on(CH.winMaximizeChanged, cb),
    hide: () => ipcRenderer.send(CH.winHide),
    getState: () => ipcRenderer.invoke(CH.winGetState),
    saveState: (patch) => ipcRenderer.send(CH.winSaveState, patch),
    setOpacity: (value) => ipcRenderer.send(CH.winSetOpacity, value),
    setAlwaysOnTop: (enabled) => ipcRenderer.send(CH.winSetAlwaysOnTop, enabled),
    setClickThrough: (enabled) => ipcRenderer.send(CH.winSetClickThrough, enabled),
    close: () => ipcRenderer.send(CH.winClose),
    resetPositions: () => ipcRenderer.invoke(CH.winResetPositions),
  },
};

contextBridge.exposeInMainWorld("eql", api);
