/**
 * ipc-channels.ts — the one list of IPC channel names, shared by the preload
 * bridge and the main-process handlers so the two can never drift apart.
 * `invoke`/`handle` channels are request/response; `*Changed`/`loot*` are
 * one-way events pushed from main to every renderer.
 */
export const CH = {
  // shopping list (invoke)
  listGet: "list:get",
  listAdd: "list:add",
  listAddFromPage: "list:addFromPage",
  listUpdate: "list:update",
  listRemove: "list:remove",
  listClear: "list:clear",
  listSetRuns: "list:setRuns",
  // settings (invoke)
  settingsGet: "settings:get",
  settingsUpdate: "settings:update",
  settingsPickLogDir: "settings:pickLogDir",
  logImport: "log:import",
  alertsTest: "alerts:test",
  // wiki (invoke)
  wikiSearch: "wiki:search",
  wikiGetPage: "wiki:getPage",
  wikiSearchZones: "wiki:searchZones",
  wikiQuestsByZone: "wiki:questsByZone",
  wikiOpen: "wiki:open",
  // watcher / zone / stats (invoke)
  watcherStatus: "watcher:status",
  zoneGet: "zone:get",
  locGet: "loc:get",
  combatGet: "combat:get",
  combatReset: "combat:reset",
  combatSessions: "combat:sessions",
  combatFights: "combat:fights",
  combatZones: "combat:zones",
  combatBests: "combat:bests",
  combatClearHistory: "combat:clearHistory",
  xpGet: "xp:get",
  xpSet: "xp:set",
  hpGet: "hp:get",
  hpSet: "hp:set",
  hpSetRegen: "hp:setRegen",
  killsAll: "kills:all",
  mobsAll: "mobs:all",
  mobsMine: "mobs:mine",
  mobsReport: "mobs:report",
  mobsForgetPeers: "mobs:forgetPeers",
  killsClear: "kills:clear",
  lookupCapture: "lookup:capture",
  lookupOpen: "lookup:open",
  searchShow: "search:show",
  lookupCancel: "lookup:cancel",
  appInfo: "app:info",
  appOpenLog: "app:openLog",
  // window control (invoke + send)
  winOpenMap: "win:openMap",
  mapOpenAt: "map:openAt",
  mapOpenP99: "map:openP99",
  winMinimize: "win:minimize",
  winHide: "win:hide",
  winSetOpacity: "win:setOpacity",
  winSetAlwaysOnTop: "win:setAlwaysOnTop",
  winClose: "win:close",
  winResetPositions: "win:resetPositions",
  // awari peer networking (brokered by the main process; see ADR 0012)
  awariOutbound: "awari:outbound", // any window → main: relay to the owner window
  awariInbound: "awari:inbound", // owner → main: a peer message arrived
  awariStatus: "awari:status", // owner → main: connection status changed
  awariPeers: "awari:peers", // owner → main: the room roster changed
  // events (main → renderer)
  awariPublish: "evt:awariPublish", // main → owner: publish this payload to the room
  awariMessage: "evt:awariMessage", // main → all: a peer message (self excluded)
  awariStatusChanged: "evt:awariStatus", // main → all: connection status
  awariPeersChanged: "evt:awariPeers", // main → all: who else is in the room
  listChanged: "evt:list",
  settingsChanged: "evt:settings",
  lootEvent: "evt:loot",
  lootMatched: "evt:lootMatched",
  castAlert: "evt:castAlert", // main → all: a watched spell began casting
  killsChanged: "evt:killsChanged", // main → all: the kill log changed in bulk (import / clear)

  watcherStatusChanged: "evt:watcherStatus",
  zoneChanged: "evt:zone",
  locChanged: "evt:loc",
  combatChanged: "evt:combat",
  xpChanged: "evt:xp",
  hpChanged: "evt:hp",
  searchPrefill: "evt:searchPrefill",
  navCommand: "evt:navCommand",
  mapViewZone: "evt:mapViewZone",
} as const;

export type Channel = (typeof CH)[keyof typeof CH];
