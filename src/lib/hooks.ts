"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import type {
  ShoppingList,
  Settings,
  WatcherStatus,
  LootEvent,
  SessionStats,
  AppInfo,
  ItemSource,
  ItemCard,
  ShoppingListEntry,
} from "@/shared/types";

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

const EMPTY_STATS: SessionStats = {
  startedAt: "",
  totalXp: 0,
  partyXp: 0,
  soloXp: 0,
  totalPct: 0,
  kills: 0,
  byMob: [],
};

/** Live session XP/kill stats from the log. */
export function useSessionStats(): SessionStats {
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);
  useEffect(() => {
    const a = api();
    if (!a) return;
    void a.stats.get().then(setStats);
    return a.stats.onChanged(setStats);
  }, []);
  return stats;
}

/** The zone the player is currently in (from the log), or null if unknown. */
export function useCurrentZone(): string | null {
  const [zone, setZone] = useState<string | null>(null);
  useEffect(() => {
    const a = api();
    if (!a) return;
    void a.zone.current().then(setZone);
    return a.zone.onChanged(setZone);
  }, []);
  return zone;
}

/**
 * React hooks over the preload bridge. Each subscribes on mount, seeds initial
 * state, and unsubscribes on unmount. They no-op cleanly when there's no Electron
 * host (e.g. during static export), so components render without special-casing.
 */

export function useShoppingList(): ShoppingList {
  const [list, setList] = useState<ShoppingList>({ entries: [], questRuns: {} });
  useEffect(() => {
    const a = api();
    if (!a) return;
    void a.list.get().then(setList);
    return a.list.onChanged(setList);
  }, []);
  return list;
}

export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    const a = api();
    if (!a) return;
    void a.settings.get().then(setSettings);
    return a.settings.onChanged(setSettings);
  }, []);
  return settings;
}

export function useWatcherStatus(): WatcherStatus {
  const [status, setStatus] = useState<WatcherStatus>({ watching: false });
  useEffect(() => {
    const a = api();
    if (!a) return;
    void a.watcher.status().then(setStatus);
    return a.watcher.onStatus(setStatus);
  }, []);
  return status;
}

/** Rolling feed of the most recent parsed loot lines (newest first). */
export function useLootFeed(limit = 40): LootEvent[] {
  const [events, setEvents] = useState<LootEvent[]>([]);
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.loot.onEvent((e) => setEvents((prev) => [e, ...prev].slice(0, limit)));
  }, [limit]);
  return events;
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
  const [sources, setSources] = useState<Record<string, ItemSource[]>>({});
  const [loading, setLoading] = useState(false);
  const key = entries
    .map((e) => e.name)
    .sort()
    .join("|");

  useEffect(() => {
    const a = api();
    if (!a || entries.length === 0) {
      setSources({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const pairs = await Promise.all(
        entries.map(async (e) => [e.name, (await a.wiki.getPage(e.name))?.sources ?? []] as const),
      );
      if (!cancelled) {
        setSources(Object.fromEntries(pairs));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Keyed on the name set (`key`), not the array identity, to avoid refetching every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { sources, loading };
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
