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
  logRecent: "log:recent", // the last few thousand lines, for testing an alert rule against them
  lootRecent: "loot:recent",
  lootPrices: "loot:prices",
  lootItems: "loot:items",
  alertsTest: "alerts:test",
  alertsPreview: "alerts:preview", // show a sample wearing a look being edited, attached to no rule
  alertPlaceStart: "alert:placeStart", // main window → main: begin placing a custom alert spot
  alertPlaceDone: "alert:placeDone", // overlay → main: the placed point (or null on cancel)
  // wiki (invoke)
  wikiSearch: "wiki:search",
  wikiGetPage: "wiki:getPage",
  wikiSearchZones: "wiki:searchZones",
  wikiQuestsByZone: "wiki:questsByZone",
  wikiOpen: "wiki:open",
  wikiRefresh: "wiki:refresh",
  wikiCachedItems: "wiki:cachedItems",
  wikiHarvestStart: "wiki:harvestStart",
  wikiHarvestStop: "wiki:harvestStop",
  wikiHarvestStatus: "wiki:harvestStatus",
  /** main -> renderer: one step of a running catalogue harvest. */
  wikiHarvestProgress: "wiki:harvestProgress",
  // lucy — the supplementary item source, asked only where the wiki is silent (invoke)
  lucySearch: "lucy:search",
  lucyGetItem: "lucy:getItem",
  lucyCachedByName: "lucy:cachedByName",
  lucyOpen: "lucy:open",
  lucyCachedItems: "lucy:cachedItems",
  lucyNameIndex: "lucy:nameIndex",
  // watcher / zone / stats (invoke)
  watcherStatus: "watcher:status",
  zoneGet: "zone:get",
  locGet: "loc:get",
  combatGet: "combat:get",
  combatReset: "combat:reset",
  combatSessions: "combat:sessions",
  combatFights: "combat:fights",
  combatSearchFights: "combat:searchFights",
  combatZones: "combat:zones",
  combatBests: "combat:bests",
  combatClearHistory: "combat:clearHistory",
  recordsBoard: "records:board", // this character's personal bests
  recordsTest: "records:test", // show a sample celebration, wearing the look records use
  recordsClear: "records:clear",
  xpGet: "xp:get",
  xpSet: "xp:set",
  hpGet: "hp:get",
  hpSet: "hp:set",
  hpSetRegen: "hp:setRegen",
  killsAll: "kills:all",
  mobsAll: "mobs:all",
  mobsMine: "mobs:mine",
  /** Who has pooled with us, and how much each of them has told us. */
  mobsContributors: "mobs:contributors",
  /** Forget one contributor (by id) or all of them. Takes their shared kills with it. */
  mobsForgetPeers: "mobs:forgetPeers",
  /** Kill positions peers have shared, kept between sessions (`electron/peer-kills.ts`). */
  peerKillsAll: "peerKills:all",
  killsClear: "kills:clear",
  spawnsView: "spawns:view",
  spawnsState: "spawns:state", // the player's own respawn figure, which nothing observed overwrites
  spawnsMarkNamed: "spawns:markNamed",
  spawnsPad: "spawns:pad", // how early to be told — the player's allowance for a soft timer
  spawnsMarkUp: "spawns:markUp",
  spawnsMarkNotUp: "spawns:markNotUp", // you are there and it is not up: the one lower bound // you can see it: end the countdown and record the sighting
  spawnsMarkDead: "spawns:markDead", // it's dead now: start or restart the countdown by hand
  spawnsAdd: "spawns:add", // a timer typed in by hand: an un-killed named, or a custom countdown
  spawnsRemove: "spawns:remove",
  spawnsNotify: "spawns:notify",
  spawnsStyle: "spawns:style", // which saved look its pop wears
  spawnsOnScreen: "spawns:onScreen", // keep this countdown over the game
  spawnsRelearn: "spawns:relearn",
  spawnsForgetSightings: "spawns:forgetSightings",
  spawnsForgetFloor: "spawns:forgetFloor",
  spawnsDropGap: "spawns:dropGap", // throw out one measured gap, keeping the rest // throw away a learned bound and start again from now
  spawnsStop: "spawns:stop",
  spawnsQueue: "spawns:queue", // a fresh kill adds a countdown instead of restarting: a placeholder camp
  spawnsRepeat: "spawns:repeat", // a custom timer starts itself again when it comes due
  // buffs — what you're keeping up, and what has lapsed
  buffsView: "buffs:view",
  buffsTrack: "buffs:track", // watch this spell, or stop: the durable silence, which keeps the row
  buffsNotify: "buffs:notify",
  buffsOnScreen: "buffs:onScreen", // keep "this is down" over the game until it's back
  buffsStyle: "buffs:style",
  buffsForget: "buffs:forget", // drop the row entirely; it returns if the spell is cast again
  buffsDismiss: "buffs:dismiss", // stand down one lapse without recasting it
  buffsDismissAll: "buffs:dismissAll",
  lookupCapture: "lookup:capture",
  lookupOpen: "lookup:open",
  lookupReady: "lookup:ready", // the selector reporting it has mounted and is listening for a drag
  searchShow: "search:show",
  lookupCancel: "lookup:cancel",
  appInfo: "app:info",
  appOpenLog: "app:openLog",
  dataHealth: "data:health", // which stored data the rules have moved on from
  selfCheck: "app:selfCheck", // run the setup chain and report which step broke
  displaysList: "displays:list",
  // update notification (rolling "latest" build; see ADR 0013)
  updateCurrent: "update:current",
  updateOpen: "update:open",
  updateDismiss: "update:dismiss",
  // window control (invoke + send)
  winOpenMap: "win:openMap",
  mapOpenAt: "map:openAt",
  /** Ask the map window (if it's open) to pick a mob's kills out — a hover hint, so `send`. */
  mapEmphasize: "map:emphasize",
  /**
   * Hand pins to the map window's own set — the one shared kind that can't be copied where it was
   * received, since pins live in that window's storage and nowhere else (ADR 0141). Opens the map
   * if it's shut, unlike `mapEmphasize`: this one is a click, not a hover.
   */
  mapAddPins: "map:addPins",
  mapOpenP99: "map:openP99",
  /** Which map sets are available (bundled images + the game's maps folder and its packs). */
  mapSources: "map:sources",
  /** One zone's vector geometry from a chosen source. */
  mapLoad: "map:load",
  /** Zone names worked out from a source's own exit labels (see `solveZoneNames`). */
  mapNames: "map:names",
  /** How to get from one zone to another (see specs/travel), over the chosen source's graph. */
  travelRoute: "travel:route",
  travelSurvey: "travel:survey",
  winMinimize: "win:minimize",
  /** Maximize/restore this window — frameless windows have to ask for it. */
  winToggleMaximize: "win:toggleMaximize",
  /**
   * Dragging a frameless window by its titlebar, with snapping (see `window-drag.ts`). The renderer
   * owns the gesture and sends only these three — grabbed, moved, released — never a coordinate.
   */
  winDragStart: "win:dragStart",
  winDragMove: "win:dragMove",
  winDragEnd: "win:dragEnd",
  /** Sent to a window when it maximizes or restores, so its titlebar button can follow. */
  winMaximizeChanged: "evt:winMaximized",
  winHide: "win:hide",
  /** How this window was left (pinned / opaque / click-through) — read once, on load. */
  winGetState: "win:getState",
  /** Remember a change to one of them, so the next launch opens the window that way. */
  winSaveState: "win:saveState",
  winSetOpacity: "win:setOpacity",
  winSetAlwaysOnTop: "win:setAlwaysOnTop",
  /** Let this window's clicks fall through to the game (or take them back) — see `useClickThrough`. */
  winSetClickThrough: "win:setClickThrough",
  winClose: "win:close",
  winResetPositions: "win:resetPositions",
  // awari peer networking (brokered by the main process; see ADR 0012)
  awariOutbound: "awari:outbound", // any window → main: relay to the owner window
  awariInbound: "awari:inbound", // owner → main: a peer message arrived
  awariStatus: "awari:status", // owner → main: connection status changed
  awariPeers: "awari:peers", // owner → main: the room roster changed
  // events (main → renderer)
  awariPublish: "evt:awariPublish", // main → owner: publish this payload (room, or one peer)
  awariMessage: "evt:awariMessage", // main → all: a peer message (self excluded)
  // Peer sharing — the offer/ask/give hub (ADR 0141). Main owns it, because a hub that only
  // answered while a window was open would drop every ask the moment you changed tab.
  peerOffer: "peer:offer", // any window → main: our own catalogue, for the toggles to show counts
  peerMine: "peer:mine", // any window → main: the rows we'd hand over for one kind
  peerAsk: "peer:ask", // any window → main: ask one peer for one kind, on a person's behalf
  peerReceived: "peer:received", // any window → main: what peers have given us
  /**
   * any window → main: the room as it stands — the connection, and who is in it.
   *
   * Because a panel that mounts when you click its tab has already missed every roster and status
   * *event*: a reader has to be able to ask, not only to listen. "0 peers" in a full room was this.
   */
  peerRoom: "peer:room",
  /**
   * any window → main → the owner window: leave the room and join it again, now.
   *
   * The one thing a person could previously only do by toggling `connectPeers` off and on, which
   * nobody would guess. It exists because the cold-start split — two clients each creating their own
   * room and never finding each other — is **bounded**: after three retries the app settles, and if
   * it settled split it stays split for the session (see `REJOIN_DELAYS_MS`).
   */
  peerRejoin: "peer:rejoin",
  awariRejoin: "evt:awariRejoin", // main → owner: re-run the join
  peerClearShares: "peer:clearShares", // any window → main: throw a peer's answers away
  peerSetPins: "peer:setPins", // map window → main: its pins, which live in its own storage
  peerShareChanged: "evt:peerShare", // main → all: the received tray moved
  /**
   * main → all: somebody is newly offering something worth going to look at
   * ([ADR 0143](../../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)). Narrow on
   * purpose — a kind that has just appeared in their catalogue, not a count that moved — because a
   * notice per catalogue change would be a notice per kill.
   */
  peerOffered: "evt:peerOffered",
  awariStatusChanged: "evt:awariStatus", // main → all: connection status
  awariPeersChanged: "evt:awariPeers", // main → all: who else is in the room
  /**
   * main → all: what peers have contributed changed — a report was filed, or somebody was
   * forgotten. One event for both stores because they hold two halves of the same contribution, and
   * a panel that showed pooled rates refreshed while the heatmap beside it didn't would be showing
   * two different moments of the same pool.
   */
  peerDataChanged: "evt:peerData",
  listChanged: "evt:list",
  settingsChanged: "evt:settings",
  lootEvent: "evt:loot",
  lootMatched: "evt:lootMatched",
  castAlert: "evt:castAlert", // main → all: a watched spell began casting
  recordSet: "evt:record", // main → all: a personal best fell, so an open scoreboard refreshes
  alertPlaceBegin: "evt:alertPlaceBegin", // main → overlay: enter custom-spot placement mode
  killsChanged: "evt:killsChanged", // main → all: the kill log changed in bulk (import / clear)
  spawnsChanged: "evt:spawnsChanged", // main → all: a timer started, came due, or aged out
  buffsChanged: "evt:buffsChanged", // main → all: a buff went up, lapsed, or a choice about one changed
  dataChanged: "evt:dataChanged", // main → all: stored data changed in bulk (a log was eaten, a store cleared)
  updateAvailable: "evt:updateAvailable", // main → all: a newer build is published

  watcherStatusChanged: "evt:watcherStatus",
  zoneChanged: "evt:zone",
  locChanged: "evt:loc",
  combatChanged: "evt:combat",
  xpChanged: "evt:xp",
  hpChanged: "evt:hp",
  searchPrefill: "evt:searchPrefill",
  navCommand: "evt:navCommand",
  mapViewZone: "evt:mapViewZone",
  mapEmphasis: "evt:mapEmphasis",
  mapPinsAdded: "evt:mapPinsAdded", // main → map: fold these pins into yours
} as const;

export type Channel = (typeof CH)[keyof typeof CH];
