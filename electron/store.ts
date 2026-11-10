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
import { effectiveNeeded, isMobEntry, normalizeItemName, originKey, runsFor, splitAcross } from "../src/shared/items/grouping";
import { applyOrder, arrangeOnce } from "../src/shared/items/list-order";
import { MAP_UI_SCALE, clampScale, clampUiScale } from "../src/shared/constants";
import { BUILT_IN_STYLES, RECORD_STYLE_ID } from "../src/shared/alerts/alert-styles";
import { factionRaiseNote } from "../src/shared/items/wiki-add";
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
  askLucy: true,
  // Ninety days, since the wiki now tells us what it changed and the clock no longer has to guess
  // ([ADR 0181](../specs/decisions/0181-the-wiki-says-what-changed.md)). This is a **ceiling**, not a
  // schedule: an edited page is invalidated within a run, so pages are typically far younger than
  // this, and the old fortnight is still what applies whenever change-tracking isn't working.
  wikiPageTtlDays: 90,
  connectPeers: false,
  shareLocation: false,
  // Every share kind off, and listed as an empty object rather than left absent so a settings file
  // has somewhere for the Peers tab to write without a migration (ADR 0141).
  share: {},
  playerName: "",
  bootstrapUrl: "",
  // Off for the ports you may not be able to get, on for the gnome anyone can walk up to. Nothing
  // ruled out to begin with: `avoid` is the finer answer to "not *that* ring", and it's filled in from
  // the route panel's own buttons rather than guessed at.
  travel: { druid: false, wizard: false, gnome: true, succor: false, avoid: [], fromMaps: false },
  castAlerts: {
    enabled: true,
    sound: true,
    flash: true,
    includeSelf: false,
    // On by default: a peer's celebration is cosmetic, never a claim (ADR 0287), so there's nothing
    // here for a quiet default to protect — unlike `shareCelebrations`-equivalent *sending*, which
    // is the `celebrations` row in `share` below, off like every other kind until switched on.
    showCelebrations: true,
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

/** One entry's share of a looted stack. */
export interface LootCredit {
  entry: ShoppingListEntry;
  /** How many of the stack went to this entry. */
  credit: number;
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
    patch: Partial<Pick<ShoppingListEntry, "needed" | "obtained" | "countedByHand" | "note" | "notify">>,
  ): ShoppingList;
  removeEntry(id: string): ShoppingList;
  clearList(): ShoppingList;
  setQuestRuns(originKey: string, runs: number): ShoppingList;
  /** Put the entries in this order (the player's, ADR 0388) — see `applyOrder` for what an incomplete order means. */
  reorder(ids: readonly string[]): ShoppingList;
  updateSettings(patch: DeepPartial<Settings>): Settings;
  /**
   * Apply a loot event; returns the entries it credited (for match alerts). An auto-sold drop credits
   * nothing — it never reached you (ADR 0385); `soldOnList` is how it is noticed instead.
   */
  applyLoot(event: LootEvent): ShoppingListEntry[];
  /**
   * `applyLoot`, with how much each entry was credited. A looted stack is **split** across the rows that
   * want the item — in list order, each up to what it still lacks — rather than given whole to each, so
   * 5 Bone Chips against rows wanting 3, 5 and 2 fill the first and part of the second, not all three
   * (ADR 0387). A row that gets nothing isn't returned.
   */
  creditLoot(event: LootEvent): LootCredit[];
  /**
   * The entries an **auto-sold** drop was for — empty for any other fate — without crediting any of them.
   * A tracked item the game vendored is gone, and the player has to be told (ADR 0385).
   */
  soldOnList(event: LootEvent): ShoppingListEntry[];
  onList(cb: (list: ShoppingList) => void): void;
  onSettings(cb: (settings: Settings) => void): void;
}

export function createStore(userDataDir: string): Store {
  const listPath = path.join(userDataDir, "shopping-list.json");
  const settingsPath = path.join(userDataDir, "settings.json");
  const bus = new EventEmitter();

  const list: ShoppingList = readJson(listPath, { entries: [], questRuns: {} });
  if (!list.questRuns) list.questRuns = {}; // migrate lists saved before quest runs existed
  // A list saved before its order was the player's is sorted once, to the order it was always drawn in, and
  // marked — so it looks exactly as it did until something is moved (ADR 0388). Saved with the next change.
  Object.assign(list, arrangeOnce(list));
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

  /**
   * The list entries a looted item is on, by the player's match mode. One rule for crediting a drop and for
   * noticing that the game sold one, so the two can't disagree about what is "on your list".
   */
  function entriesFor(itemName: string): ShoppingListEntry[] {
    const item = normalize(itemName);
    return list.entries.filter((e) => {
      // A mob is never looted — it's what you loot *from* — so it can't be satisfied by a loot
      // line, and letting it try would credit "Ghoul Lord" with the Ghoul Lord's Cape it dropped.
      if (isMobEntry(e)) return false;
      const target = normalize(e.name);
      return settings.matchMode === "exact" ? item === target : item.includes(target) || target.includes(item);
    });
  }

  // Entries are keyed by (name + origin), so the SAME item can live under more than one
  // quest/recipe heading (e.g. rat ears needed by both a recipe and a quest), each
  // tracking its own count. Re-adding the same item to the same origin just bumps needed.
  function creditLoot(event: LootEvent): LootCredit[] {
    // An auto-sold drop never reached you: the game vendored it as it was looted. Counting it ticked a row for
    // an item you hold none of — and, worse, the alert for it then told you the list was done. The Loot tab
    // still has the row, with what it fetched. A kept, stored or combined drop is yours (ADR 0385).
    if (event.fate === "sold") return [];
    const rows = entriesFor(event.item);
    // Count what the line actually reported — a looted stack of 2 moves the list 2 closer to done, not 1 —
    // but only once: the same item under three quests is one stack of chips, not three (ADR 0387).
    const shares = splitAcross(
      rows.map((e) => effectiveNeeded(e, runsFor(list, e)) - e.obtained),
      event.qty,
    );
    const credits: LootCredit[] = [];
    rows.forEach((entry, i) => {
      if (shares[i] <= 0) return;
      entry.obtained += shares[i];
      entry.lastSeenAt = event.at;
      credits.push({ entry, credit: shares[i] });
    });
    if (credits.length) emitList();
    return credits;
  }

  function upsert(name: string, extra: Partial<ShoppingListEntry>): void {
    const key = originKey(extra.origin);
    const existing = list.entries.find(
      (e) => normalize(e.name) === normalize(name) && originKey(e.origin) === key,
    );
    if (existing) {
      // A mob has no "needed" to speak of — it's a hunt target, not a stackable quantity
      // (`isMobEntry`/`countableEntries` exclude it from every count the list shows) — so a
      // re-add (e.g. the per-mob "+ Track" on a faction page, which goes through the same
      // generic `addEntry` an item add does) must not bump it, the way every other mob-adding
      // path already avoids doing by never passing `needed` at all.
      if (extra.needed && !isMobEntry(existing)) existing.needed += extra.needed;
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
      // A faction page names a *group* of mobs to go kill, not a thing to obtain — so "+ Add" on it
      // files every raise-side mob as its own `kind: "mob"` entry (same shape a lone mob page adds
      // itself as), grouped under this faction's origin. Lower-side mobs aren't bulk-added: they're
      // shown for information (avoid killing these), not something a "raise my faction" action asks for.
      if (page.kind === "faction") {
        for (const m of page.raise?.mobs ?? []) {
          upsert(m.name, { kind: "mob", origin, note: factionRaiseNote(page.title) });
        }
        return emitList();
      }
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

    reorder(ids) {
      list.entries = applyOrder(list.entries, ids);
      list.arranged = true;
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

    creditLoot,
    applyLoot: (event) => creditLoot(event).map((c) => c.entry),

    soldOnList: (event) => (event.fate === "sold" ? entriesFor(event.item) : []),

    onList: (cb) => void bus.on("list", cb),
    onSettings: (cb) => void bus.on("settings", cb),
  };
}
