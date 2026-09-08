/**
 * web-api.ts — the browser's `EqlApi`, returned by `api()` (`src/lib/api.ts`) when `window.eql` is
 * absent: a plain browser tab, not Electron.
 *
 * Three kinds of namespace live here, and the split is deliberate rather than uniform:
 *
 *  - **Real**, backed by the static snapshot (`src/lib/web/snapshot.ts`) or `localStorage`
 *    (`src/lib/web/local-store.ts`): `wiki`, `travel`, `map`, `list`, `settings`, `ui`.
 *  - **Real and live**, over the same awari room Electron joins, minus the IPC hop
 *    (`src/lib/web/awari-web.ts`): `awari`, `peer`.
 *  - **Honest no-ops**, typed completely so every caller's `api()?.foo()` keeps working exactly as
 *    it does when `api()` is `null` today — everything that needs a local EverQuest log, native
 *    windowing, a global hotkey, or screen capture. `EqlApi.platform.capabilities` says which is
 *    which, so a tab or a control can disable itself instead of quietly doing nothing.
 *
 * One instance per tab, created lazily on first use (`getWebApi`) — never during Next's static
 * prerender, which has no `window` at all.
 */
import { createLogger } from "@/shared/logging";
import { createAwariWeb } from "@/lib/web/awari-web";
import * as snapshot from "@/lib/web/snapshot";
import * as lucy from "@/lib/web/lucy-snapshot";
import * as store from "@/lib/web/local-store";
import { answerRoute, travelZone } from "@/shared/travel/route";
import { surveyZone } from "@/shared/travel/survey";
import type {
  BuffView,
  CombatStats,
  EqlApi,
  FightStats,
  GameClockView,
  GoalView,
  HarvestProgress,
  HpEstimate,
  MapFocus,
  ScoreBoard,
  SpawnView,
  Unsubscribe,
} from "@/shared/types";

const log = createLogger("web-api");

const noop: Unsubscribe = () => {};
const EMPTY_LOG_TAIL = { text: "", bytes: 0, whole: true };

const EMPTY_FIGHT: FightStats = {
  startedAt: "",
  endedAt: "",
  durationSec: 0,
  totalDealt: 0,
  yourDealt: 0,
  yourTaken: 0,
  spanSec: 0,
  byCombatant: [],
  spells: [],
  byMob: [],
  kills: 0,
  xpPct: 0,
  xpGains: 0,
  soloXp: 0,
  partyXp: 0,
  copper: 0,
  soldCopper: 0,
  yourPerSec: [],
  deaths: [],
  invocations: [],
};

const EMPTY_COMBAT: CombatStats = { startedAt: new Date().toISOString(), fight: EMPTY_FIGHT, session: EMPTY_FIGHT };
const EMPTY_BUFFS: BuffView = { now: new Date().toISOString(), active: [], lapsed: [], known: [], lexicon: false };
const EMPTY_SPAWNS: SpawnView = { now: new Date().toISOString(), running: [], known: [], dismissed: [] };
const EMPTY_GOALS: GoalView = { now: new Date().toISOString(), goals: [], templates: [] };
const EMPTY_SCOREBOARD: ScoreBoard = { character: "", scores: [], streak: 0, seeded: false };
const EMPTY_HP: HpEstimate = { atLeast: 0, samples: 0, updatedAt: new Date().toISOString() };
// A harvest is Electron-only (there's no wiki category walk on the web — the snapshot is this
// build's whole catalogue), so `wiki.harvestStart`/`spellHarvestStart` etc. all report the same
// permanent "idle, nothing to fetch" state rather than pretending a run could ever start.
const EMPTY_HARVEST: HarvestProgress = {
  status: "idle",
  total: 0,
  at: 0,
  fetched: 0,
  fromPeers: 0,
  failed: 0,
  found: 0,
  shards: { present: 0, mine: 0, room: 0 },
};

const EMPTY_CLOCK: GameClockView = {
  minutes: null,
  daytime: null,
  now: new Date().toISOString(),
  rate: 20,
  pinned: false,
  pinAt: { fx: 0.02, fy: 0.02 },
  alarms: [],
};

/**
 * Opens the map as a **new browser tab** — there's no second Electron window to reuse — carrying
 * the target zone/pin/focus in the URL, since a fresh tab has no live channel back to this one.
 * `src/app/map/page.tsx` reads these query params once on mount (the same shape `map.onViewZone`
 * delivers in Electron) and then clears them via `history.replaceState`.
 */
function openMapTab(zone?: string, loc?: { y: number; x: number }, label?: string, focus?: MapFocus): void {
  if (!zone) return void window.open("/map/", "_blank");
  const params = new URLSearchParams({ zone });
  if (loc) {
    params.set("y", String(loc.y));
    params.set("x", String(loc.x));
  }
  if (label) params.set("label", label);
  if (focus?.mob) params.set("mob", focus.mob);
  if (focus?.drop) params.set("drop", focus.drop);
  window.open(`/map/?${params}`, "_blank");
}

function createWebApi(): EqlApi {
  const getSettings = () => store.getSettings();
  const getName = () => getSettings().playerName || "Web visitor";
  const { awari, peer } = createAwariWeb({ getSettings, getName });

  return {
    platform: {
      kind: "web",
      capabilities: {
        log: false,
        windowing: false,
        shortcuts: false,
        lookup: false,
        overlayPlacement: false,
        update: false,
        display: false,
      },
    },

    list: {
      get: async () => store.getList(),
      add: async (input) => store.addToList(input),
      addFromPage: async (page) => {
        const components = page.components?.length ? page.components : [{ name: page.title, qty: 1 }];
        for (const c of components) {
          store.addToList({ name: c.name, needed: c.qty, wikiPath: page.wikiPath, origin: { kind: page.kind, name: page.title } });
        }
        return store.getList();
      },
      update: async (id, patch) => store.updateListEntry(id, patch),
      remove: async (id) => store.removeFromList(id),
      clear: async () => store.clearList(),
      setRuns: async (originKey, runs) => store.setListRuns(originKey, runs),
      onChanged: (cb) => store.onListChanged(cb),
    },

    settings: {
      get: async () => store.getSettings(),
      update: async (patch) => store.updateSettings(patch),
      pickLogDir: async () => null, // no native folder picker in a browser, and no log to point at
      onChanged: (cb) => store.onSettingsChanged(cb),
    },

    ui: {
      all: async () => store.getUiState(),
      set: async (key, value) => store.setUiState(key, value),
    },

    wiki: {
      search: (term) => snapshot.search(term),
      getPage: (title) => snapshot.getPage(title),
      // No live re-fetch on the web — the snapshot is this build's whole wiki. Same page back.
      refreshPage: (title) => snapshot.getPage(title),
      searchZones: (term) => snapshot.searchZones(term),
      questsByZone: (zone) => snapshot.questsByZone(zone),
      searchFactions: (term) => snapshot.searchFactions(term),
      outOfEraZones: () => snapshot.outOfEraZones(),
      openInBrowser: async (target) => {
        window.open(`https://eqlwiki.com${target.startsWith("/") ? target : `/${target}`}`, "_blank");
      },
      refresh: async () => {}, // the mirrored indexes are whatever the last snapshot took
      cachedItems: () => snapshot.cachedItemsJson(),
      cachedSpells: () => snapshot.cachedSpellsJson(),
      harvestStart: async () => EMPTY_HARVEST,
      harvestStop: async () => EMPTY_HARVEST,
      harvestStatus: async () => EMPTY_HARVEST,
      onHarvest: () => noop,
      spellHarvestStart: async () => EMPTY_HARVEST,
      spellHarvestStop: async () => EMPTY_HARVEST,
      spellHarvestStatus: async () => EMPTY_HARVEST,
      onSpellHarvest: () => noop,
    },

    lucy: {
      search: (term) => lucy.search(term),
      getItem: (id) => lucy.getItem(id),
      cachedByName: (name) => lucy.cachedByName(name),
      openInBrowser: async (target) => {
        const url =
          typeof target === "number"
            ? `https://lucy.allakhazam.com/item.html?id=${target}`
            : `https://lucy.allakhazam.com/itemlist.html?${new URLSearchParams({ searchtext: target })}`;
        window.open(url, "_blank");
      },
      cachedItems: () => lucy.cachedItems(),
      nameIndex: () => lucy.nameIndex(),
    },

    loot: {
      recent: async () => [],
      prices: async () => [],
      items: async () => [],
      onEvent: () => noop,
      onMatched: () => noop,
    },

    alerts: {
      onCast: () => noop,
      test: async () => {},
      preview: async () => {},
      placeLocation: async () => null,
      onPlaceBegin: () => noop,
      placed: () => {},
    },

    log: {
      import: async () => null,
      recent: async () => EMPTY_LOG_TAIL,
    },

    update: {
      current: async () => null,
      onAvailable: () => noop,
      open: async () => {},
      dismiss: async () => {},
    },

    watcher: {
      status: async () => ({ watching: false }),
      onStatus: () => noop,
    },

    zone: {
      current: async () => null,
      onChanged: () => noop,
    },

    loc: {
      current: async () => null,
      onChanged: () => noop,
    },

    gameClock: {
      view: async () => EMPTY_CLOCK,
      add: async () => EMPTY_CLOCK,
      update: async () => EMPTY_CLOCK,
      remove: async () => EMPTY_CLOCK,
      toggle: async () => EMPTY_CLOCK,
      setPinned: async () => EMPTY_CLOCK,
      setPinPosition: async () => EMPTY_CLOCK,
      onChanged: () => noop,
    },

    combat: {
      get: async () => EMPTY_COMBAT,
      reset: async () => EMPTY_COMBAT,
      onChanged: () => noop,
      sessions: async () => [],
      zones: async () => [],
      bests: async () => [],
      fights: async () => [],
      searchFights: async () => ({ fights: [], total: 0 }),
      clearHistory: async () => [],
    },

    records: {
      board: async () => EMPTY_SCOREBOARD,
      onRecord: () => noop,
      test: async () => {},
      clear: async () => EMPTY_SCOREBOARD,
    },

    mobs: {
      all: async () => [],
      mine: async () => [],
      contributors: async () => [],
      forgetPeers: async () => {},
    },

    peers: {
      kills: async () => [],
      onChanged: () => noop,
    },

    kills: {
      all: async () => [],
      clear: async () => {},
      onChanged: () => noop,
    },

    spawns: {
      view: async () => EMPTY_SPAWNS,
      state: async () => EMPTY_SPAWNS,
      pad: async () => EMPTY_SPAWNS,
      markUp: async () => EMPTY_SPAWNS,
      markNotUp: async () => EMPTY_SPAWNS,
      markDead: async () => EMPTY_SPAWNS,
      add: async () => EMPTY_SPAWNS,
      remove: async () => EMPTY_SPAWNS,
      notify: async () => EMPTY_SPAWNS,
      style: async () => EMPTY_SPAWNS,
      showOnScreen: async () => EMPTY_SPAWNS,
      markNamed: async () => EMPTY_SPAWNS,
      relearn: async () => EMPTY_SPAWNS,
      forgetSightings: async () => EMPTY_SPAWNS,
      forgetFloor: async () => EMPTY_SPAWNS,
      setGapDropped: async () => EMPTY_SPAWNS,
      stop: async () => EMPTY_SPAWNS,
      queue: async () => EMPTY_SPAWNS,
      repeat: async () => EMPTY_SPAWNS,
      onChanged: () => noop,
    },

    // Timeboxed farming targets, tracked against a live kill/loot log — no log on the web, same as
    // spawns/buffs.
    goals: {
      view: async () => EMPTY_GOALS,
      start: async () => EMPTY_GOALS,
      startStreak: async () => EMPTY_GOALS,
      abandon: async () => EMPTY_GOALS,
      clearFinished: async () => EMPTY_GOALS,
      saveTemplate: async () => EMPTY_GOALS,
      saveStreakTemplate: async () => EMPTY_GOALS,
      deleteTemplate: async () => EMPTY_GOALS,
      onChanged: () => noop,
    },

    buffs: {
      view: async () => EMPTY_BUFFS,
      track: async () => EMPTY_BUFFS,
      notify: async () => EMPTY_BUFFS,
      showOnScreen: async () => EMPTY_BUFFS,
      style: async () => EMPTY_BUFFS,
      forget: async () => EMPTY_BUFFS,
      dismiss: async () => EMPTY_BUFFS,
      dismissAll: async () => EMPTY_BUFFS,
      onChanged: () => noop,
    },

    hp: {
      get: async () => EMPTY_HP,
      set: async () => EMPTY_HP,
      setRegen: async () => EMPTY_HP,
      onChanged: () => noop,
    },

    xp: {
      get: async () => ({ intoLevel: 0, known: false }),
      set: async () => ({ intoLevel: 0, known: false }),
      onChanged: () => noop,
    },

    lookup: {
      open: async () => {},
      ready: async () => {},
      capture: async () => "",
      cancel: async () => {},
    },

    app: {
      info: async () => ({ hotkeys: [], logFile: "" }),
      openLog: async () => {},
      dataHealth: async () => [],
      onDataChanged: () => noop,
      selfCheck: async () => [],
    },

    search: {
      onPrefill: () => noop,
      show: async () => {},
    },

    nav: {
      // The mouse-thumb-button path (`NavKeys` in page.tsx) is a raw DOM listener, not this — it
      // already works on the web unmodified. This is only the rarer real `app-command` hardware
      // event, which Electron alone can see.
      onCommand: () => noop,
    },

    travel: {
      route: async (sourceId, from, to, options) => {
        const graph = await snapshot.graphFor(sourceId);
        if (!graph) return { knows: { zones: 0, borders: 0 } };
        return answerRoute(graph, from, to, options);
      },
      survey: async (sourceId, zoneQuery, options) => {
        const graph = await snapshot.graphFor(sourceId);
        if (!graph) return undefined;
        const file = travelZone(graph, zoneQuery);
        return file ? surveyZone(graph, file, options) : undefined;
      },
    },

    map: {
      open: async () => void openMapTab(),
      openAt: async (zone, loc, label, focus) => void openMapTab(zone, loc, label, focus),
      onViewZone: () => noop,
      emphasize: () => {},
      addPins: () => {},
      onPinsAdded: () => noop,
      onEmphasis: () => noop,
      openP99: async (zoneQuery) => {
        window.open(`https://www.project1999.com/allaclone/z_${encodeURIComponent(zoneQuery.toLowerCase())}.html`, "_blank");
      },
      sources: () => snapshot.mapSources(),
      load: async (sourceId, zoneFile) => (await snapshot.loadMap(sourceId, zoneFile)) ?? null,
      // The travel graph Electron already built for this source carries exactly this map (`zoneNames`:
      // file → long name, from the same `solveZoneNames` pass) — reading it is one small, already-
      // cached fetch. The first version of this re-derived it by fetching and parsing *every* zone
      // file in the source to re-run `solveZoneNames` itself: 568 requests for Brewall, every time the
      // map opened, which is what was hanging the map page.
      names: async (sourceId) => (await snapshot.graphFor(sourceId))?.zoneNames ?? {},
    },

    awari,
    peer,

    display: {
      list: async () => [],
    },

    win: {
      minimize: () => {},
      toggleMaximize: () => {},
      onMaximizeChanged: () => noop,
      hide: () => {},
      getState: async () => ({}), // "empty ... on the web" — already the documented contract
      saveState: () => {},
      setOpacity: () => {},
      setAlwaysOnTop: () => {},
      setClickThrough: () => {},
      close: () => {},
      resetPositions: async () => {},
    },
  };
}

let instance: EqlApi | null = null;

/** The web `EqlApi` singleton, created on first use. Never call this during SSR/prerender. */
export function getWebApi(): EqlApi {
  if (!instance) {
    log.debug("creating the web EqlApi");
    instance = createWebApi();
  }
  return instance;
}
