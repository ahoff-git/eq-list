"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import type { ShoppingList, Settings, WatcherStatus, LootEvent, SessionStats, AppInfo } from "@/shared/types";

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
  const [list, setList] = useState<ShoppingList>({ entries: [] });
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
