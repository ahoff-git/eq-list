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
  winRole: "win:role",
  winMinimize: "win:minimize",
  winHide: "win:hide",
  winSetOpacity: "win:setOpacity",
  winClose: "win:close",
  winResetPositions: "win:resetPositions",
  // events (main → renderer)
  listChanged: "evt:list",
  settingsChanged: "evt:settings",
  lootEvent: "evt:loot",
  lootMatched: "evt:lootMatched",
  watcherStatusChanged: "evt:watcherStatus",
  zoneChanged: "evt:zone",
  statsChanged: "evt:stats",
  searchPrefill: "evt:searchPrefill",
  navCommand: "evt:navCommand",
} as const;

export type Channel = (typeof CH)[keyof typeof CH];
