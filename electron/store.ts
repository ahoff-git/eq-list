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
  overlay: {
    opacity: 0.9,
    alwaysOnTop: true,
    clickThrough: false,
    fontScale: 1,
    showObtained: true,
    followZone: false,
  },
  debug: false,
};

function normalize(name: string): string {
  return stripArticle(name).toLowerCase().replace(/\s+/g, " ").trim();
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
    needed?: number;
    wikiPath?: string;
    note?: string;
    origin?: ShoppingListEntry["origin"];
  }): ShoppingList;
  addFromPage(page: WikiPage): ShoppingList;
  updateEntry(id: string, patch: Partial<Pick<ShoppingListEntry, "needed" | "obtained" | "note">>): ShoppingList;
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

  function readJson<T>(file: string, fallback: T): T {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as T;
    } catch {
      return fallback;
    }
  }

  function persist(file: string, data: unknown) {
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
    } catch (e) {
      log.warn("persist failed", file, (e as Error).message);
    }
  }

  function emitList(): ShoppingList {
    persist(listPath, list);
    bus.emit("list", list);
    return list;
  }

  function upsert(name: string, extra: Partial<ShoppingListEntry>): void {
    const existing = list.entries.find((e) => normalize(e.name) === normalize(name));
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
        needed: input.needed ?? 1,
        wikiPath: input.wikiPath,
        note: input.note,
        origin: input.origin,
      });
      return emitList();
    },

    addFromPage(page) {
      // Quests/recipes contribute their turn-ins/ingredients; a bare item adds itself.
      const origin = { kind: page.kind, name: page.title } as ShoppingListEntry["origin"];
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
        const target = normalize(e.name);
        const hit = settings.matchMode === "exact" ? item === target : item.includes(target) || target.includes(item);
        if (hit) {
          e.obtained += 1;
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
