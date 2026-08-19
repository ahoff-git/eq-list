/**
 * store.ts — the single source of truth for the shopping list and settings.
 *
 * Owning both here (persisted as JSON under the app's userData dir) means every
 * window renders the same state and matching happens in one place: when a loot
 * event arrives, the store decides which list entries it satisfies, bumps their
 * counts, and emits "list" so all windows update together.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createLogger } from "../src/shared/logging";
import { stripArticle } from "../src/shared/log-parser";
import { isMobEntry, normalizeItemName, originKey } from "../src/shared/grouping";
import { MAP_UI_SCALE, clampScale, clampUiScale } from "../src/shared/constants";
import { BUILT_IN_STYLES, RECORD_STYLE_ID } from "../src/shared/alert-styles";
import { readJson, writeJson } from "./json-store";
import type {
  ShoppingList,
  ShoppingListEntry,
  Settings,
  LootEvent,
  WikiPage,
  DeepPartial,
} from "../src/shared/types";

const log = createLogger("store");

/** EQ Legends' default log location (per EQBuddy); the user can change it. */
const DEFAULT_LOG_DIR =
  "C:\\Users\\Public\\Daybreak Game Company\\Installed Games\\EverQuest Legends\\Logs";

const DEFAULT_SETTINGS: Settings = {
  logDir: DEFAULT_LOG_DIR,
  activeLogFile: "",
  matchMode: "exact",
  hideOutOfEra: false,
  connectPeers: false,
  shareLocation: false,
  playerName: "",
  bootstrapUrl: "",
  // Off for the ports you may not be able to get, on for the gnome anyone can walk up to.
  travel: { druid: false, wizard: false, gnome: true, succor: false },
  castAlerts: {
    enabled: true,
    sound: true,
    flash: true,
    includeSelf: false,
    // Starter set of common crowd-control effects — the "Suggested" chips in Settings offer
    // more (and mark these as already-on). Substring, case-insensitive, so each catches a whole
    // family: "Terror" gets Screaming Terror, "Instill" is this server's root line.
    watches: [
      { id: "fear", spell: "Fear", enabled: true },
      { id: "terror", spell: "Terror", enabled: true },
      { id: "mez", spell: "Mesmeri", enabled: true },
      { id: "charm", spell: "Charm", enabled: true },
      { id: "root", spell: "Root", enabled: true },
      { id: "instill", spell: "Instill", enabled: true },
    ],
    // Appearance / behaviour of the alert (all tunable in Settings). displayId is omitted so the
    // overlay defaults to the primary display until the user picks one.
    color: "#e5534b", // the app's --bad red
    soundName: "chirp",
    position: "top",
    durationMs: 6000,
    animation: "pulse",
    locations: [], // custom spots the user places with the mouse (Settings → Alert style)
    // The looks the app ships with, so a record and a spawn don't arrive dressed as the same
    // emergency a dispel prompt is (`BUILT_IN_STYLES`). Ordinary saved styles — editable, renamable,
    // deletable — and `migrations.ts` adds any a settings file predates.
    styles: [...BUILT_IN_STYLES],
  },
  // On by default: the board fills itself in whether or not anything is said, and a record you
  // weren't told about is one you find by going looking — which is the opposite of the point.
  // Wearing the shipped **Record** look rather than the alert defaults: a personal best is news, not
  // a warning, and it should not arrive in the same red as "dispel now". Any saved style, or none,
  // replaces it in the Records tab.
  highScores: { celebrate: true, styleId: RECORD_STYLE_ID },
  overlay: {
    opacity: 0.9,
    fontScale: 0.9,
    // The map is a picture: it starts at full size rather than the main window's 90%.
    mapFontScale: 1,
    showObtained: true,
    followZone: false,
    splitByMode: false,
    showKillConfidence: true,
  },
  debug: false,
};

// Loot/list matching: drop the article too (a loot line's "a Bat Wing" is the list's
// "Bat Wing"), then the shared lower/collapse rule — one place for the collapse rule.
function normalize(name: string): string {
  return normalizeItemName(stripArticle(name));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Recursively merge `patch` into `base` without mutating `base`. */
function deepMerge<T>(base: T, patch: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) continue;
    const cur = out[k];
    out[k] = isPlainObject(cur) && isPlainObject(v) ? deepMerge(cur, v as DeepPartial<unknown>) : v;
  }
  return out as T;
}

export interface Store {
  getList(): ShoppingList;
  getSettings(): Settings;
  addEntry(input: {
    name: string;
    /** What the entry is, when it isn't an item — see `wikiAddKind` and `ShoppingListEntry.kind`. */
    kind?: ShoppingListEntry["kind"];
    needed?: number;
    wikiPath?: string;
    note?: string;
    origin?: ShoppingListEntry["origin"];
  }): ShoppingList;
  addFromPage(page: WikiPage): ShoppingList;
  updateEntry(
    id: string,
    patch: Partial<Pick<ShoppingListEntry, "needed" | "obtained" | "note" | "notify">>,
  ): ShoppingList;
  removeEntry(id: string): ShoppingList;
  clearList(): ShoppingList;
  setQuestRuns(originKey: string, runs: number): ShoppingList;
  updateSettings(patch: DeepPartial<Settings>): Settings;
  /** Apply a loot event; returns the entries it satisfied (for match alerts). */
  applyLoot(event: LootEvent): ShoppingListEntry[];
  onList(cb: (list: ShoppingList) => void): void;
  onSettings(cb: (settings: Settings) => void): void;
}

export function createStore(userDataDir: string): Store {
  const listPath = path.join(userDataDir, "shopping-list.json");
  const settingsPath = path.join(userDataDir, "settings.json");
  const bus = new EventEmitter();

  const list: ShoppingList = readJson(listPath, { entries: [], questRuns: {} });
  if (!list.questRuns) list.questRuns = {}; // migrate lists saved before quest runs existed
  let settings: Settings = deepMerge(DEFAULT_SETTINGS, readJson<DeepPartial<Settings>>(settingsPath, {}));
  // Both scales are clamped on load, against *their own* range: the overlay's stops at 100%
  // (ADR 0026 — an overlay wants to take less room than the game), while the map's may go above it,
  // being a picture you lean into. Written back so the file agrees with what's in memory —
  // otherwise the slider and the JSON disagree until something else saves.
  const scale = clampUiScale(settings.overlay.fontScale);
  const mapScale = clampScale(settings.overlay.mapFontScale, MAP_UI_SCALE);
  if (scale !== settings.overlay.fontScale || mapScale !== settings.overlay.mapFontScale) {
    settings.overlay.fontScale = scale;
    settings.overlay.mapFontScale = mapScale;
    persist(settingsPath, settings);
  }

  /**
   * The temp-file-then-rename reasoning that used to live here is now `json-store.ts`, which every store
   * on disk shares — eight of them were writing straight to the target and losing everything on an
   * interrupted write.
   *
   * A `function` rather than a `const`, because it's called from above its own definition.
   */
  function persist(file: string, data: unknown): void {
    writeJson(file, data, { pretty: true, what: file });
  }

  function emitList(): ShoppingList {
    persist(listPath, list);
    bus.emit("list", list);
    return list;
  }

  // Entries are keyed by (name + origin), so the SAME item can live under more than one
  // quest/recipe heading (e.g. rat ears needed by both a recipe and a quest), each
  // tracking its own count. Re-adding the same item to the same origin just bumps needed.
  function upsert(name: string, extra: Partial<ShoppingListEntry>): void {
    const key = originKey(extra.origin);
    const existing = list.entries.find(
      (e) => normalize(e.name) === normalize(name) && originKey(e.origin) === key,
    );
    if (existing) {
      if (extra.needed) existing.needed += extra.needed;
      return;
    }
    list.entries.push({
      id: randomUUID(),
      name,
      needed: 1,
      obtained: 0,
      addedAt: new Date().toISOString(),
      ...extra,
    });
  }

  return {
    getList: () => list,
    getSettings: () => settings,

    addEntry(input) {
      upsert(input.name, {
        // Carried through rather than defaulted here: an add that dropped it put a **mob** on the
        // list as a thing to loot, which is what `wiki-add.ts` exists to prevent and what the loot
        // matcher below then started crediting.
        kind: input.kind,
        needed: input.needed ?? 1,
        wikiPath: input.wikiPath,
        note: input.note,
        origin: input.origin,
      });
      return emitList();
    },

    addFromPage(page) {
      const origin = { kind: page.kind, name: page.title } as ShoppingListEntry["origin"];
      // A **mob** is a thing to go kill, and adding one means you want *it* — not its loot table.
      // Checked before `components`, because a mob page keeps its known drops in that field: the
      // old order therefore dumped every drop onto the list, or (with no loot listed) put the mob's
      // own name down as an item that could never be looted. Either way the list filled up with
      // things that weren't what was asked for.
      if (page.kind === "mob") {
        upsert(page.title, { kind: "mob", wikiPath: page.wikiPath });
        return emitList();
      }
      // Quests/recipes contribute their turn-ins/ingredients; a bare item adds itself.
      if (page.components.length) {
        for (const c of page.components) {
          upsert(c.name, { needed: c.qty, wikiPath: c.wikiPath, origin });
        }
      } else {
        upsert(page.title, { needed: 1, wikiPath: page.wikiPath });
      }
      return emitList();
    },

    updateEntry(id, patch) {
      const e = list.entries.find((x) => x.id === id);
      if (e) Object.assign(e, patch);
      return emitList();
    },

    removeEntry(id) {
      const i = list.entries.findIndex((x) => x.id === id);
      if (i >= 0) list.entries.splice(i, 1);
      return emitList();
    },

    clearList() {
      list.entries = [];
      list.questRuns = {};
      return emitList();
    },

    setQuestRuns(originKey, runs) {
      const n = Math.max(1, Math.round(runs));
      if (n <= 1) delete list.questRuns[originKey];
      else list.questRuns[originKey] = n;
      return emitList();
    },

    updateSettings(patch) {
      settings = deepMerge(settings, patch);
      persist(settingsPath, settings);
      bus.emit("settings", settings);
      return settings;
    },

    applyLoot(event) {
      const item = normalize(event.item);
      const matched: ShoppingListEntry[] = [];
      for (const e of list.entries) {
        // A mob is never looted — it's what you loot *from* — so it can't be satisfied by a loot
        // line, and letting it try would credit "Ghoul Lord" with the Ghoul Lord's Cape it dropped.
        if (isMobEntry(e)) continue;
        const target = normalize(e.name);
        const hit = settings.matchMode === "exact" ? item === target : item.includes(target) || target.includes(item);
        if (hit) {
          // Count what the line actually reported: a looted stack of 2 moves the
          // shopping list 2 closer to done, not 1.
          e.obtained += event.qty;
          e.lastSeenAt = event.at;
          matched.push(e);
        }
      }
      if (matched.length) emitList();
      return matched;
    },

    onList: (cb) => void bus.on("list", cb),
    onSettings: (cb) => void bus.on("settings", cb),
  };
}
