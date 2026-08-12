"use client";
import { type DependencyList, type RefObject, useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { setRendererDebug } from "@/shared/logging";
import { UI_SCALE, clampScale, type ScaleRange } from "@/shared/constants";
import type {
  ShoppingList,
  Settings,
  WatcherStatus,
  LootEvent,
  ItemPrice,
  LocEvent,
  CombatStats,
  FightStats,
  XpProgress,
  HpEstimate,
  KillRecord,
  AppInfo,
  ItemSource,
  ItemCard,
  ShoppingListEntry,
  Unsubscribe,
} from "@/shared/types";
import { mobKey, type MobKnowledge } from "@/shared/mob-stats";
import { mergeLootFeed } from "@/shared/loot-feed";
import { ratio } from "@/shared/numbers";

/**
 * A value the **main process owns**: how to read it now, and how to follow it afterwards.
 *
 * Defined at module scope so each `source` has a stable identity — which is what lets `useLive` name
 * honest dependencies instead of an empty array with a lint suppression over it.
 */
type Eql = NonNullable<ReturnType<typeof api>>;

interface LiveSource<T> {
  read: (a: Eql) => Promise<T>;
  follow: (a: Eql, on: (value: T) => void) => Unsubscribe;
}

function live<T>(read: LiveSource<T>["read"], follow: LiveSource<T>["follow"]): LiveSource<T> {
  return { read, follow };
}

/**
 * Seed from the current value, then follow the stream, and unsubscribe on the way out.
 *
 * Eight hooks wrote this lifecycle out verbatim. None of them had it wrong — but "read once, subscribe,
 * **return the unsubscribe**" is exactly the shape where one copy quietly forgets the last part and
 * leaks a listener per mount, with nothing failing to show it. One copy can't drift from itself.
 *
 * `api()` is null during Next's prerender and in a plain browser, so a value that never arrives leaves
 * the initial one in place — every caller's initial is the honest "nothing yet".
 */
function useLive<T>(source: LiveSource<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const a = api();
    if (!a) return;
    void source.read(a).then(setValue);
    return source.follow(a, setValue);
  }, [source]);
  return value;
}

/**
 * Read something from the main process now, and again whenever `deps` change — **discarding an answer
 * the deps have already moved on from.**
 *
 * The other half of `useLive`: a value nothing pushes, that has to be asked for again when the question
 * changes. Seven places wrote the effect out, and the ones that left out the cancellation had a real
 * race in them: clicking session A then B fires two reads, and if A's reply lands second the panel shows
 * B selected with A's fights in it. Nothing throws; the numbers are simply the wrong session's.
 *
 * `deps` is the caller's own dependency list, which the lint rule can't see through a wrapper — so the
 * suppression lives here once instead of at every call site.
 */
export function useReading<T>(
  read: (a: Eql) => Promise<T>,
  initial: T,
  deps: DependencyList,
): { value: T; loading: boolean } {
  const [value, setValue] = useState<T>(initial);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const a = api();
    if (!a) return; // prerender, or a plain browser: the initial value stands
    let current = true;
    setLoading(true);
    void read(a).then((next) => {
      if (!current) return; // superseded — the newer read owns the state now
      setValue(next);
      setLoading(false);
    });
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { value, loading };
}

/** `useReading` for the usual case: the value, and no interest in whether it's arrived yet. */
export function useRead<T>(read: (a: Eql) => Promise<T>, initial: T, deps: DependencyList): T {
  return useReading(read, initial, deps).value;
}

/**
 * Close a popover when the user clicks outside `inside`, or presses Escape.
 *
 * Both the tab overflow menu and the zone picker had this, and they'd already drifted: one closed on
 * Escape and the other only did while its input had focus, so the same gesture dismissed one and not
 * the other. Listening happens **only while open**, so a closed popover leaves nothing attached.
 */
export function useDismiss(inside: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!inside.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
    // `close` is a fresh closure each render; re-subscribing per render would be pointless churn, so
    // what this follows is whether the popover is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

const LIVE = {
  combat: live<CombatStats>((a) => a.combat.get(), (a, on) => a.combat.onChanged(on)),
  xp: live<XpProgress>((a) => a.xp.get(), (a, on) => a.xp.onChanged(on)),
  hp: live<HpEstimate>((a) => a.hp.get(), (a, on) => a.hp.onChanged(on)),
  zone: live<string | null>((a) => a.zone.current(), (a, on) => a.zone.onChanged(on)),
  loc: live<LocEvent | null>((a) => a.loc.current(), (a, on) => a.loc.onChanged(on)),
  list: live<ShoppingList>((a) => a.list.get(), (a, on) => a.list.onChanged(on)),
  settings: live<Settings | null>((a) => a.settings.get(), (a, on) => a.settings.onChanged(on)),
  watcher: live<WatcherStatus>((a) => a.watcher.status(), (a, on) => a.watcher.onStatus(on)),
};

/** One-shot app diagnostics (hotkey registration) for the Help section. */
export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    const a = api();
    if (!a) return;
    void a.app.info().then(setInfo);
  }, []);
  return info;
}

const EMPTY_FIGHT: FightStats = {
  startedAt: "",
  endedAt: "",
  durationSec: 0,
  spanSec: 0,
  totalDealt: 0,
  yourDealt: 0,
  yourTaken: 0,
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

const EMPTY_PRICES: ItemPrice[] = [];
const NO_SOURCES: Record<string, ItemSource[]> = {};
const NO_FACTS: Record<string, SpellFacts> = {};
const NO_MOB_LOOT: Record<string, Record<string, string>> = {};
const EMPTY_LIST: ShoppingList = { entries: [], questRuns: {} };
const NO_WATCHER: WatcherStatus = { watching: false };
const EMPTY_COMBAT: CombatStats = { startedAt: "", fight: EMPTY_FIGHT, session: EMPTY_FIGHT };

/** Live damage-meter state from the log (current fight + session). */
export function useCombatStats(): CombatStats {
  return useLive(LIVE.combat, EMPTY_COMBAT);
}

/**
 * How far into the current level the player is. Seeded by the player (the log never
 * states a total), then kept current by the main process from XP gains and level-ups.
 */
export function useXpProgress(): XpProgress {
  return useLive(LIVE.xp, { intoLevel: 0, known: false });
}

/**
 * Inferred bounds on your maximum hit points (see `hp-estimate.ts`). Soft by nature:
 * it sharpens as you play, and a stated figure overrides it.
 */
export function useHpEstimate(): HpEstimate {
  return useLive(LIVE.hp, { atLeast: 0, samples: 0, updatedAt: "" });
}

/**
 * Pooled mob knowledge (yours plus peers'), keyed by mob name for quick lookup. Used wherever
 * the wiki's claims need checking against what we've actually killed.
 */
export function useMobKnowledge(refreshKey: unknown): Record<string, MobKnowledge> {
  const [known, setKnown] = useState<Record<string, MobKnowledge>>({});
  useEffect(() => {
    const a = api();
    if (!a) return;
    const load = () =>
      void a.mobs.all().then((mobs) => {
        // A mob can be known in several zones; fold them together, since "does it drop this"
        // isn't a per-zone question.
        // Keyed by `mobKey` (article- and case-folded) so a wiki name like "a gnoll" finds
        // knowledge filed under the kill's stripped "gnoll".
        const byMob: Record<string, MobKnowledge> = {};
        for (const m of mobs) {
          const key = mobKey(m.mob);
          const cur = byMob[key];
          if (!cur) {
            byMob[key] = m;
            continue;
          }
          byMob[key] = {
            ...cur,
            kills: cur.kills + m.kills,
            myKills: cur.myKills + m.myKills,
            drops: mergeDropLists(cur, m),
            contributors: [...new Set([...cur.contributors, ...m.contributors])],
          };
        }
        setKnown(byMob);
      });
    load();
    // Mob knowledge is derived from the kill log, so a bulk kill change (import / clear) means
    // refetch — not just when the caller's refreshKey ticks over.
    return a.kills.onChanged(load);
  }, [refreshKey]);
  return known;
}

/** Sum two zones' drop counts for the same mob, then re-derive the rates from the total. */
function mergeDropLists(a: MobKnowledge, b: MobKnowledge): MobKnowledge["drops"] {
  const kills = a.kills + b.kills;
  const counts = new Map<string, number>();
  for (const d of [...a.drops, ...b.drops]) counts.set(d.item, (counts.get(d.item) ?? 0) + d.count);
  return [...counts.entries()]
    .map(([item, count]) => ({ item, count, rate: ratio(count, kills, 3) }))
    .sort((x, y) => y.rate - x.rate || x.item.localeCompare(y.item));
}

/**
 * Recorded kills, newest first. Re-read whenever the main process says the log changed — a kill,
 * a drop landing on a corpse, or a bulk edit (import / clear).
 *
 * That notice is the *only* trigger, which is the point. This used to take a `refreshKey` and the
 * map passed it the length of the `/loc` trail, on the reasoning that the kill count moves with
 * play — but a `/loc` is not a kill, and each one refetched all 5000 records over IPC (~10ms per
 * hop) and redrew the heatmap. A replayed gap types dozens of them in one burst, right while the
 * map window is loading its geometry, which is exactly the lag spike that made this worth fixing.
 */
export function useKills(zone: string | undefined): KillRecord[] {
  const [kills, setKills] = useState<KillRecord[]>([]);
  useEffect(() => {
    const a = api();
    if (!a) return;
    const load = () => void a.kills.all(zone).then(setKills);
    load();
    return a.kills.onChanged(load);
  }, [zone]);
  return kills;
}

/** The zone the player is currently in (from the log), or null if unknown. */
export function useCurrentZone(): string | null {
  return useLive(LIVE.zone, null);
}

/**
 * Scale this window's whole interface, as a CSS `zoom` on the document root.
 *
 * **Not** `webContents.setZoomFactor`, which was the obvious choice and cannot work: Chromium's
 * zoom is per *origin*, and every window here is served from one (`app://local` packaged,
 * `localhost:3000` in dev). Setting it on one window moved every window — so the map's A−/A+ and
 * the main window's fought over a single number instead of holding their own. Measured, not
 * assumed. CSS `zoom` is per document, so each window keeps its own.
 *
 * The shells must use `height: 100%` rather than `100vh` for this: a `vh` length gets scaled by
 * the zoom (leaving a gap), while `zoom` expands the containing block so percentages fill the
 * window exactly. See `.app` in globals.css.
 */
export function useUiScale(scale: number | undefined, range: ScaleRange = UI_SCALE): void {
  useEffect(() => {
    if (scale === undefined) return; // settings not loaded yet — leave it alone
    document.documentElement.style.zoom = String(clampScale(scale, range));
  }, [scale, range]);
}

/**
 * Whether this window is maximized. The main process announces it — including once per load,
 * so a fresh renderer doesn't start out guessing — because a frameless window's own titlebar
 * has no other way to know, and the window can be maximized by things that aren't our button.
 */
export function useMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => api()?.win.onMaximizeChanged(setMaximized), []);
  return maximized;
}

/** The player's last logged location (from `/loc`), or null if none yet. */
export function usePlayerLoc(): LocEvent | null {
  return useLive(LIVE.loc, null);
}

/**
 * A rolling trail of recent locations (oldest→newest) for drawing movement, plus a
 * `clear` for the map's "clear trail" control. Zoning wipes it: `LocEvent`s carry no
 * zone, so keeping them would draw the last zone's path across the new map.
 */
export function usePlayerTrail(limit = 200): { points: LocEvent[]; clear: () => void } {
  const [points, setPoints] = useState<LocEvent[]>([]);
  const zone = useCurrentZone();
  const clear = useCallback(() => setPoints([]), []);

  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.loc.onChanged((l) => {
      if (l) setPoints((prev) => [...prev, l].slice(-limit));
    });
  }, [limit]);

  useEffect(() => {
    clear();
  }, [zone, clear]);

  return { points, clear };
}

/**
 * React hooks over the preload bridge. Each subscribes on mount, seeds initial
 * state, and unsubscribes on unmount. They no-op cleanly when there's no Electron
 * host (e.g. during static export), so components render without special-casing.
 */

export function useShoppingList(): ShoppingList {
  return useLive(LIVE.list, EMPTY_LIST);
}

export function useSettings(): Settings | null {
  return useLive(LIVE.settings, null);
}

/**
 * Mirror the tray's "Debug logging" toggle into this renderer's log gate, so
 * `createLogger(...).debug()` actually prints (and reaches the main-process log file,
 * which pipes every renderer console). **Every window has to call this** — the gate is
 * per-renderer, so a window that skips it silently discards its own diagnostics. The
 * awari connection lives in the main window, which is exactly where they're wanted.
 */
export function useRendererDebug(): void {
  const settings = useSettings();
  const debug = settings?.debug ?? false;
  useEffect(() => {
    setRendererDebug(debug);
  }, [debug]);
}

export function useWatcherStatus(): WatcherStatus {
  return useLive(LIVE.watcher, NO_WATCHER);
}

/** Rolling feed of the most recent parsed loot lines (newest first). */
export function useLootFeed(limit = 40): LootEvent[] {
  const [events, setEvents] = useState<LootEvent[]>([]);
  /** Bumped when the ledger changes wholesale (a log eaten, a clear) — see `onDataChanged`. */
  const [refresh, setRefresh] = useState(0);
  useEffect(() => api()?.app.onDataChanged(() => setRefresh((n) => n + 1)), []);
  useEffect(() => {
    const a = api();
    if (!a) return;
    // History (the main process tracks drops whether or not this tab is open) plus the live ones,
    // *merged* — the two race, and `mergeLootFeed` owns which wins and how the overlap is spotted.
    // This used to keep whatever had arrived live and drop the history wholesale, which cost the
    // panel its entire ledger whenever one drop beat the fetch back.
    void a.loot.recent(limit).then((hist) => setEvents((prev) => mergeLootFeed(prev, hist, limit)));
    return a.loot.onEvent((e) => setEvents((prev) => [e, ...prev].slice(0, limit)));
  }, [limit, refresh]);
  return events;
}

/**
 * What each item has auto-sold for. Derived in main from the loot ledger, so it covers sales
 * from before this tab was opened; `refreshKey` re-reads it — a new sale is the only thing that
 * can change it, and the loot feed already knows when one arrives.
 */
export function useItemPrices(refreshKey: unknown): ItemPrice[] {
  return useRead((a) => a.loot.prices(), EMPTY_PRICES, [refreshKey]);
}

/**
 * Fetch the wiki `sources` for a set of list entries, keyed by name. Used by the
 * Hunt view (who drops what) and the overlay's zone narrowing (what's obtainable
 * here). Refetches only when the *set* of names changes — `wiki.getPage` is cached,
 * so this stays cheap. Returns `{}` while there's nothing to fetch.
 */
export function useEntrySources(entries: ShoppingListEntry[]): {
  sources: Record<string, ItemSource[]>;
  loading: boolean;
} {
  // Keyed on the name set, not the array identity, so this doesn't refetch every render.
  const key = entries
    .map((e) => e.name)
    .sort()
    .join("|");
  const { value: sources, loading } = useReading(
    async (a) =>
      Object.fromEntries(
        await Promise.all(entries.map(async (e) => [e.name, (await a.wiki.getPage(e.name))?.sources ?? []] as const)),
      ),
    NO_SOURCES,
    [key],
  );
  return { sources, loading };
}

/** What the wiki states about a spell — the numbers the log never gives. */
export interface SpellFacts {
  /** Mana cost, so damage can be weighed against what it cost to cast. */
  mana?: number;
  /** The wiki's stated cast time, for comparison with what we measured. */
  castSec?: number;
}

/**
 * Wiki facts for a set of spells, keyed by the name the meter uses. Mana cost is the one
 * thing needed for damage-per-mana and it isn't in the log — but it *is* on the spell's
 * wiki page, which the main process already caches, so no OCR and no guessing.
 *
 * Pages are per rank ("Spell: Shock of Lightning VI"), with the un-ranked page as the
 * fallback. Refetches only when the set of spells changes.
 */
export function useSpellFacts(spells: { spell: string; rank?: string }[]): Record<string, SpellFacts> {
  // Keyed on the spell set, not array identity (`wiki.getPage` is cached in main).
  const key = spells
    .map((s) => `${s.spell}|${s.rank ?? ""}`)
    .sort()
    .join(",");
  return useRead(
    async (a) =>
      Object.fromEntries(
        await Promise.all(
          spells.map(async ({ spell, rank }) => {
            const page =
              (rank ? await a.wiki.getPage(`Spell: ${spell} ${rank}`) : null) ??
              (await a.wiki.getPage(`Spell: ${spell}`));
            return [spell, factsFromCard(page?.card?.lines ?? [])] as const;
          }),
        ),
      ),
    NO_FACTS,
    [key],
  );
}

/** Pull the two numbers we want out of a spell card's "Label: value" lines. */
function factsFromCard(lines: string[]): SpellFacts {
  const find = (label: string): number | undefined => {
    const line = lines.find((l) => l.toLowerCase().startsWith(`${label}:`));
    const value = line ? Number.parseFloat(line.slice(line.indexOf(":") + 1)) : NaN;
    return Number.isFinite(value) ? value : undefined;
  };
  return { mana: find("mana"), castSec: find("casting time") };
}

/**
 * Drop rates keyed `mob → item → rate`, for the Hunt list. Rates live on the mob's
 * loot list (not the item's "Drops From"), so we fetch each hunt mob's page (cached)
 * and index its loot components' `dropRate`. Refetches only when the mob set changes.
 */
export function useMobLoot(mobNames: string[]): Record<string, Record<string, string>> {
  const key = mobNames
    .slice()
    .sort()
    .join("|");
  return useRead(
    async (a) =>
      Object.fromEntries(
        await Promise.all(
          mobNames.map(async (mob) => {
            const page = await a.wiki.getPage(mob);
            const rates: Record<string, string> = {};
            for (const c of page?.components ?? []) if (c.dropRate) rates[c.name] = c.dropRate;
            return [mob, rates] as const;
          }),
        ),
      ),
    NO_MOB_LOOT,
    [key],
  );
}

// The item stat card, memoized per title across the session — a name can appear in
// many rows, and hovering should hit the (already cached) page at most once.
const cardCache = new Map<string, ItemCard | null>();

/**
 * The hover stat card for a page title, fetched lazily. Pass `null` (e.g. when not
 * hovering) to fetch nothing. Non-item pages resolve to `null`. See `ItemLink`.
 */
export function useItemCard(title: string | null): ItemCard | null {
  const [card, setCard] = useState<ItemCard | null>(() => (title ? cardCache.get(title) ?? null : null));
  useEffect(() => {
    if (!title) {
      setCard(null);
      return;
    }
    if (cardCache.has(title)) {
      setCard(cardCache.get(title) ?? null);
      return;
    }
    const a = api();
    if (!a) return;
    let cancelled = false;
    void a.wiki.getPage(title).then((p) => {
      const c = p?.card ?? null;
      cardCache.set(title, c);
      if (!cancelled) setCard(c);
    });
    return () => {
      cancelled = true;
    };
  }, [title]);
  return card;
}

/** Ids of entries that were satisfied by a loot line in the last `durationMs`. */
export function useMatchFlashes(durationMs = 1500): Set<string> {
  const [flashed, setFlashed] = useState<Record<string, number>>({});
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.loot.onMatched(({ entry }) => {
      setFlashed((prev) => ({ ...prev, [entry.id]: Date.now() }));
      setTimeout(() => {
        setFlashed((prev) => {
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
      }, durationMs);
    });
  }, [durationMs]);
  return new Set(Object.keys(flashed));
}
