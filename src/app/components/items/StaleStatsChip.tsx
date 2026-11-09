"use client";
import { useStatsDrift } from "@/lib/items/useStatsDrift";
import { STATS_HOTKEY } from "@/shared/constants";
import { exportAgeText } from "@/shared/game-exports";
import { driftLabel } from "@/shared/items/stats-drift";

/**
 * The status bar's reminder to read your stats again: the stats you read (or typed) for the loadout builder
 * can no longer be trusted, because something the app can see has changed since — a level, an ability that
 * moves stats, a stat buff that came or went, or the race, classes or level the plan measures them against
 * ([ADR 0369](../../../../specs/decisions/0369-a-stale-stats-read-says-so.md)).
 *
 * It says *which*, in its own words and on hover, because "your stats are stale" with no reason is a
 * reminder to be dismissed. Like everything else in the bar it is a way in
 * ([ADR 0326](../../../../specs/decisions/0326-the-status-bar-is-a-way-in.md)): one click opens the loadout
 * builder, where reading again — or saying nothing has changed — is one button away.
 *
 * Draws nothing while the read still holds, and nothing at all for someone who has never read or typed their
 * stats: there is nothing to have gone stale.
 */
export default function StaleStatsChip({ onOpen }: { onOpen: () => void }) {
  const { stamp, reasons } = useStatsDrift();
  if (!stamp || !reasons.length) return null;
  const title = [
    `Your stats were last read ${exportAgeText(Date.now() - stamp.at)}. Since then: ${reasons.map((r) => r.text).join("; ")}.`,
    `Press ${STATS_HOTKEY.label} over your Inventory window's stats page to read them again. Click to open the loadout builder.`,
  ].join("\n\n");
  return (
    <button type="button" className="chip stats-chip" title={title} onClick={onOpen}>
      📊 {driftLabel(reasons)}
    </button>
  );
}
