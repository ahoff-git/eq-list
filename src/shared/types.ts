/**
 * types.ts — the shared contract between the Electron main process and the
 * renderer. Both sides import these; nothing here may import Node or React so
 * it stays safe on both. The preload bridge (`window.eql`) is typed by `EqlApi`.
 */

// ─── Log events ─────────────────────────────────────────────────────────────

/** A parsed "you looted X from Y" line from the EQ log. */
export interface LootEvent {
  kind: "loot";
  /** Item name, exactly as it appears in the log (leading article stripped). */
  item: string;
  /** Corpse / source name the item came from. */
  source: string;
  /** Original, untouched log line (minus the timestamp bracket). */
  raw: string;
  /** ISO timestamp parsed from the log line, or the ingest time as a fallback. */
  at: string;
}

/** A parsed "You have entered <zone>" line — tracks the player's current zone. */
export interface ZoneEvent {
  kind: "zone";
  zone: string;
  raw: string;
  at: string;
}

/** A parsed "You gain [party] experience! (N%)" line. `pct` present only when shown. */
export interface XpEvent {
  kind: "xp";
  party: boolean;
  pct?: number;
  raw: string;
  at: string;
}

/** A parsed kill ("You have slain X" / "X has been slain by Y"). `target` is the mob. */
export interface KillEvent {
  kind: "kill";
  target: string;
  raw: string;
  at: string;
}

export type LogEvent = LootEvent | ZoneEvent | XpEvent | KillEvent;

// ─── Session stats ──────────────────────────────────────────────────────────

export interface MobStat {
  mob: string;
  kills: number;
  xp: number;
}

/** Live session totals derived from the log (reset on demand). */
export interface SessionStats {
  startedAt: string;
  /** Count of experience-gain messages (EQ logs no XP amount). */
  totalXp: number;
  partyXp: number;
  soloXp: number;
  /** Sum of the shown percentages, when the server includes them. */
  totalPct: number;
  kills: number;
  /** Per-mob kills + attributed XP, best first. */
  byMob: MobStat[];
}

// ─── Wiki data ──────────────────────────────────────────────────────────────

export type SourceKind =
  | "drop"
  | "quest"
  | "recipe"
  | "vendor"
  | "forage"
  | "ground"
  | "unknown";

/** One way an item can be obtained, scraped from its wiki page. */
export interface ItemSource {
  kind: SourceKind;
  /** Where it comes from: a mob, NPC, zone, recipe name, etc. */
  where: string;
  /** Optional extra context: zone, drop rate, cost, notes. */
  detail?: string;
}

/** A required ingredient/turn-in referenced by a recipe or quest. */
export interface WikiComponent {
  name: string;
  qty: number;
  wikiPath?: string;
}

export type WikiPageKind = "item" | "quest" | "recipe" | "page";

/** Normalized result of scraping a single wiki page. */
export interface WikiPage {
  kind: WikiPageKind;
  title: string;
  wikiPath: string;
  /** For items: how to obtain it. */
  sources: ItemSource[];
  /** For quests/recipes: the items you must gather. */
  components: WikiComponent[];
  /** For quests/recipes: what you get. */
  rewards: string[];
  /** True if the page is tagged with an era that isn't live yet (can't obtain). */
  outOfEra?: boolean;
  fetchedAt: string;
}

export interface SearchResult {
  title: string;
  wikiPath: string;
  snippet?: string;
  /** True if the page is tagged with an era that isn't live yet. */
  outOfEra?: boolean;
}

/** A screen-region rectangle (display-local CSS pixels) for the screengrab lookup. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A global shortcut and whether the OS accepted its registration. */
export interface HotkeyInfo {
  action: string;
  label: string;
  registered: boolean;
}

/** Diagnostic info shown in the app's Help section. */
export interface AppInfo {
  hotkeys: HotkeyInfo[];
  /** Path to the debug log file (see app.openLog). */
  logFile: string;
}

// ─── Shopping list ──────────────────────────────────────────────────────────

/** One line on the shopping list — a thing to watch for in the logs. */
export interface ShoppingListEntry {
  id: string;
  /** The name matched against loot lines. */
  name: string;
  wikiPath?: string;
  /** How many you want. */
  needed: number;
  /** How many have dropped/looted since it was added (from the log). */
  obtained: number;
  note?: string;
  /** What put this on the list (a quest/recipe), for grouping in the UI. */
  origin?: { kind: WikiPageKind; name: string };
  addedAt: string;
  /** Set when a matching loot line arrives; drives the overlay flash. */
  lastSeenAt?: string;
}

export interface ShoppingList {
  entries: ShoppingListEntry[];
}

// ─── Settings ───────────────────────────────────────────────────────────────

export interface OverlaySettings {
  opacity: number; // 0.2 .. 1
  alwaysOnTop: boolean;
  clickThrough: boolean;
  fontScale: number; // 0.8 .. 1.6
  showObtained: boolean; // keep completed items visible
}

export type MatchMode = "exact" | "contains";

export interface Settings {
  /** Directory holding eqlog_*.txt files. */
  logDir: string;
  /** Specific file to watch, or "" to auto-pick the most recently written. */
  activeLogFile: string;
  matchMode: MatchMode;
  /** Hide out-of-era pages in search results. */
  hideOutOfEra: boolean;
  overlay: OverlaySettings;
  debug: boolean;
}

// ─── Watcher status ─────────────────────────────────────────────────────────

export interface WatcherStatus {
  watching: boolean;
  file?: string;
  error?: string;
}

// ─── Preload bridge (window.eql) ────────────────────────────────────────────

/** Unsubscribe function returned by every `on*` subscription. */
export type Unsubscribe = () => void;

export interface EqlApi {
  list: {
    get(): Promise<ShoppingList>;
    /** Add a single item to watch. Returns the updated list. */
    add(input: {
      name: string;
      needed?: number;
      wikiPath?: string;
      note?: string;
      origin?: { kind: WikiPageKind; name: string };
    }): Promise<ShoppingList>;
    /** Add every component of a scraped quest/recipe at once. */
    addFromPage(page: WikiPage): Promise<ShoppingList>;
    update(id: string, patch: Partial<Pick<ShoppingListEntry, "needed" | "obtained" | "note">>): Promise<ShoppingList>;
    remove(id: string): Promise<ShoppingList>;
    clear(): Promise<ShoppingList>;
    onChanged(cb: (list: ShoppingList) => void): Unsubscribe;
  };
  settings: {
    get(): Promise<Settings>;
    update(patch: DeepPartial<Settings>): Promise<Settings>;
    /** Open a native folder picker for the EQ log directory. */
    pickLogDir(): Promise<string | null>;
    onChanged(cb: (settings: Settings) => void): Unsubscribe;
  };
  wiki: {
    search(term: string): Promise<SearchResult[]>;
    getPage(title: string): Promise<WikiPage | null>;
    /** Fuzzy zone-name suggestions for the "quests by zone" search. */
    searchZones(term: string): Promise<SearchResult[]>;
    /** Quests located in / related to a zone. */
    questsByZone(zone: string): Promise<SearchResult[]>;
    /** Open a wiki page in the external browser (wikiPath or title). */
    openInBrowser(target: string): Promise<void>;
  };
  loot: {
    /** Every parsed loot line, whether or not it's on the list. */
    onEvent(cb: (event: LootEvent) => void): Unsubscribe;
    /** Loot lines that matched a shopping-list entry. */
    onMatched(cb: (payload: { event: LootEvent; entry: ShoppingListEntry }) => void): Unsubscribe;
  };
  watcher: {
    status(): Promise<WatcherStatus>;
    onStatus(cb: (status: WatcherStatus) => void): Unsubscribe;
  };
  zone: {
    /** The zone the player is currently in (from the log), or null if unknown. */
    current(): Promise<string | null>;
    onChanged(cb: (zone: string | null) => void): Unsubscribe;
  };
  stats: {
    get(): Promise<SessionStats>;
    reset(): Promise<SessionStats>;
    onChanged(cb: (stats: SessionStats) => void): Unsubscribe;
  };
  lookup: {
    /** Open the region selector (same as the screengrab hotkey). */
    open(): Promise<void>;
    /**
     * OCR the selected region; the read text is routed to the Search box. `rect` is
     * in the selector window's client pixels and `view` is that window's viewport
     * size — the ratio image/view maps the selection to image pixels regardless of
     * how the OS reports the window's units.
     */
    capture(rect: Rect, view: { width: number; height: number }): Promise<string>;
    /** Close all selector windows (cancel). */
    cancel(): Promise<void>;
  };
  app: {
    /** Diagnostics for the Help section (hotkey registration, log path, …). */
    info(): Promise<AppInfo>;
    /** Open the debug log file in the OS default app. */
    openLog(): Promise<void>;
  };
  search: {
    /** Fires when a screengrab lookup fills the Search box with OCR'd text. */
    onPrefill(cb: (text: string) => void): Unsubscribe;
  };
  overlay: {
    open(): Promise<void>;
    setClickThrough(enabled: boolean): Promise<void>;
  };
  win: {
    /** Which window this renderer is: "main" or "overlay". */
    role(): Promise<"main" | "overlay">;
    minimize(): void;
    close(): void;
    /** Forget saved positions and recenter windows (for "lost" windows). */
    resetPositions(): Promise<void>;
  };
}

/** Recursive Partial for settings patches. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
