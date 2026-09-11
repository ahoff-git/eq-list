"use client";
import { useEffect, useRef } from "react";
import { useFactionFeed, useFactionStandings } from "@/lib/hooks";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { showToast } from "@/lib/toast";
import { factionKey } from "@/shared/faction-feed";
import { computeRaceUnlockProgress, diffRaceUnlockProgress, type RaceUnlockProgress } from "@/shared/faction-unlock-progress";

/**
 * "A faction you're watching for a race just moved" — an opt-in nudge, toggled per race on the
 * Faction tab's Race Unlocks view (`RaceUnlocksView`'s star), for a reader mid-grind who wants to know
 * without keeping the tab open.
 *
 * **Never "unlocked" or a threshold crossed.** `net` is only what this app has observed change since
 * it started watching — not the character's lifetime total (see
 * `faction-unlock-progress.ts`'s header) — so this only ever reports *movement*, the same honest
 * scope the ledger itself keeps. Mounted by the shell like `PeerVersionToast`, since a notice about a
 * tab you aren't on has to come from something that is always mounted.
 */
export default function RaceUnlockAlerts() {
  const [watchedRaces] = usePersistentState<string[]>(STORAGE_KEYS.watchedRaceUnlocks, []);
  const hits = useFactionFeed(1);
  const standings = useFactionStandings(hits[0] ? factionKey(hits[0]) : "");
  // Holds the last snapshot so only a *change* is ever reported — the first computed snapshot after
  // mount is a starting point, not news, even though its nets are already real history.
  const prior = useRef<RaceUnlockProgress[] | null>(null);

  useEffect(() => {
    const progress = computeRaceUnlockProgress(standings);
    if (prior.current) {
      for (const alert of diffRaceUnlockProgress(prior.current, progress, new Set(watchedRaces))) {
        showToast({
          title: `${alert.race}: ${alert.faction}`,
          detail: `${alert.delta > 0 ? "+" : ""}${alert.delta} — net ${alert.net} observed since tracking began, not your total standing`,
          tone: alert.delta > 0 ? "good" : "warn",
          // One card per race+faction, so a burst of hits updates one notice rather than stacking.
          key: `race-unlock-${alert.race}-${alert.faction}`,
        });
      }
    }
    prior.current = progress;
  }, [standings, watchedRaces]);

  return null;
}
