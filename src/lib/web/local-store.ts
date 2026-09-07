/**
 * local-store.ts — settings, the shopping list, and panel UI state for the web build.
 *
 * Electron keeps these in `userData` files owned by main (`store.ts`, `ui-state.ts`) so every window
 * agrees. A browser tab has no main process and no second window to agree with, so `localStorage` is
 * the whole store — private to this browser, this origin, this machine, exactly like every other
 * per-viewer convenience. Each store is a value plus a set of listeners `onChanged` subscribes to,
 * which is the same shape `EqlApi`'s `onChanged` callbacks expect either way.
 */
import { UI_SCALE } from "@/shared/constants";
import type { Settings, ShoppingList, ShoppingListEntry } from "@/shared/types";

function readLocal<T>(key: string, fallback: T): T {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private browsing / quota — the tab still works, it just won't remember next time */
  }
}

/** A value backed by `localStorage`, with a plain change-notification list. */
function createStore<T>(key: string, initial: T) {
  let value = readLocal(key, initial);
  const listeners = new Set<(v: T) => void>();
  return {
    get: (): T => value,
    set: (next: T): T => {
      value = next;
      writeLocal(key, value);
      for (const cb of listeners) cb(value);
      return value;
    },
    subscribe: (cb: (v: T) => void): (() => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

/** Recursive merge for a settings patch — plain objects merge key by key, everything else replaces. */
function mergeDeep<T>(base: T, patch: unknown): T {
  if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
    return (patch === undefined ? base : (patch as T)) ?? base;
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    out[k] = mergeDeep(out[k], v);
  }
  return out as T;
}

/**
 * Defaults for a web visitor. **`connectPeers` defaults true here, unlike Electron's opt-in-off**
 * (ADR 0011's privacy model, unchanged for the desktop app): a browser tab has no game log to leak
 * and nothing personal to share by default — the awari room's mirror family (item/spell pages, the
 * game clock) is public wiki content and on by default for everyone regardless
 * (ADR 0161) — so joining automatically is what makes a visitor's tab useful to the room rather than
 * a silent read of whatever this machine's snapshot happened to hold. It's still one click to leave
 * in the Peers tab.
 */
const DEFAULT_SETTINGS: Settings = {
  logDir: "",
  activeLogFile: "",
  matchMode: "contains",
  hideOutOfEra: true,
  askLucy: true,
  wikiPageTtlDays: 14,
  connectPeers: true,
  shareLocation: false,
  playerName: "",
  bootstrapUrl: "",
  castAlerts: {
    enabled: false,
    includeSelf: false,
    watches: [],
    locations: [],
    sound: false,
    flash: false,
    color: "#f0b429",
    soundName: "levelup",
    position: "top",
    durationMs: 5000,
    animation: "none",
  },
  highScores: { celebrate: false },
  travel: { druid: false, wizard: false, gnome: true, succor: false, avoid: [] },
  overlay: {
    opacity: 1,
    fontScale: UI_SCALE.max,
    mapFontScale: UI_SCALE.max,
    showObtained: true,
    followZone: false,
    splitByMode: false,
    showKillConfidence: true,
  },
  debug: false,
};

const settingsStore = createStore<Settings>("eql:web:settings", DEFAULT_SETTINGS);

export function getSettings(): Settings {
  return settingsStore.get();
}

export function updateSettings(patch: unknown): Settings {
  return settingsStore.set(mergeDeep(settingsStore.get(), patch));
}

export const onSettingsChanged = settingsStore.subscribe;

// ─── Shopping list ────────────────────────────────────────────────────────────

const EMPTY_LIST: ShoppingList = { entries: [], questRuns: {} };
const listStore = createStore<ShoppingList>("eql:web:list", EMPTY_LIST);

let nextId = 0;
const freshId = (): string => `web-${Date.now().toString(36)}-${(nextId++).toString(36)}`;

export function getList(): ShoppingList {
  return listStore.get();
}

export function addToList(input: {
  name: string;
  kind?: ShoppingListEntry["kind"];
  needed?: number;
  wikiPath?: string;
  note?: string;
  origin?: ShoppingListEntry["origin"];
}): ShoppingList {
  const list = listStore.get();
  const entry: ShoppingListEntry = {
    id: freshId(),
    name: input.name,
    kind: input.kind,
    wikiPath: input.wikiPath,
    needed: input.needed ?? 1,
    obtained: 0,
    note: input.note,
    origin: input.origin,
    addedAt: new Date().toISOString(),
  };
  return listStore.set({ ...list, entries: [...list.entries, entry] });
}

export function updateListEntry(
  id: string,
  patch: Partial<Pick<ShoppingListEntry, "needed" | "obtained" | "note" | "notify">>,
): ShoppingList {
  const list = listStore.get();
  return listStore.set({
    ...list,
    entries: list.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
  });
}

export function removeFromList(id: string): ShoppingList {
  const list = listStore.get();
  return listStore.set({ ...list, entries: list.entries.filter((e) => e.id !== id) });
}

export function clearList(): ShoppingList {
  return listStore.set(EMPTY_LIST);
}

export function setListRuns(originKey: string, runs: number): ShoppingList {
  const list = listStore.get();
  return listStore.set({ ...list, questRuns: { ...list.questRuns, [originKey]: runs } });
}

export const onListChanged = listStore.subscribe;

// ─── Panel UI state (`usePersistentState` / `usePersistentShape`'s main-side mirror) ─────────────

const uiStore = createStore<Record<string, unknown>>("eql:web:ui", {});

export function getUiState(): Record<string, unknown> {
  return uiStore.get();
}

export function setUiState(key: string, value: unknown): void {
  uiStore.set({ ...uiStore.get(), [key]: value });
}
