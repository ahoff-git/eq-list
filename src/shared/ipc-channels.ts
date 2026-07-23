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
  statsGet: "stats:get",
  statsReset: "stats:reset",
  lookupCapture: "lookup:capture",
  lookupOpen: "lookup:open",
  lookupCancel: "lookup:cancel",
  appInfo: "app:info",
  appOpenLog: "app:openLog",
  // overlay / window control (invoke + send)
  overlayOpen: "overlay:open",
  overlaySetClickThrough: "overlay:setClickThrough",
  winOpenMap: "win:openMap",
  mapOpenAt: "map:openAt",
  mapOpenP99: "map:openP99",
  winRole: "win:role",
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
  // events (main → renderer)
  awariPublish: "evt:awariPublish", // main → owner: publish this payload to the room
  awariMessage: "evt:awariMessage", // main → all: a peer message (self excluded)
  awariStatusChanged: "evt:awariStatus", // main → all: connection status
  listChanged: "evt:list",
  settingsChanged: "evt:settings",
  lootEvent: "evt:loot",
  lootMatched: "evt:lootMatched",
  watcherStatusChanged: "evt:watcherStatus",
  zoneChanged: "evt:zone",
  locChanged: "evt:loc",
  statsChanged: "evt:stats",
  searchPrefill: "evt:searchPrefill",
  navCommand: "evt:navCommand",
  mapViewZone: "evt:mapViewZone",
} as const;

export type Channel = (typeof CH)[keyof typeof CH];
