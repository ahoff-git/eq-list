"use client";
import type { CSSProperties } from "react";
import { copyText } from "@/lib/clipboard";
import {
  exportAgeText,
  exportStaleness,
  lastExportedAt,
  type GameExportCommand,
  type GameExportTimes,
} from "@/shared/game-exports";

/**
 * The colour of a dump's age: `--good` → `--warn` → `--bad` as it goes from fresh to fully stale.
 * Mixed continuously, so a button drifts toward "take it again" rather than flipping to an alarm.
 */
function staleColor(staleness: number): string {
  if (staleness <= 0.5) return `color-mix(in oklab, var(--warn) ${Math.round(staleness * 200)}%, var(--good))`;
  return `color-mix(in oklab, var(--bad) ${Math.round((staleness - 0.5) * 200)}%, var(--warn))`;
}

/**
 * One copy button, tinted by its dump's age. `compact` drops the command text — the recipe buttons
 * differ only in the skill, which the label already says (the hover still has the command).
 */
export default function ExportButton({
  cmd,
  times,
  now,
  compact,
}: {
  cmd: GameExportCommand;
  times: GameExportTimes;
  now: number;
  compact?: boolean;
}) {
  const at = lastExportedAt(cmd, times);
  const staleness = exportStaleness(cmd, at, now);
  const className = `game-export ${compact ? "compact" : ""} ${staleness === null ? "never" : ""}`;
  const style = staleness === null ? undefined : ({ "--stale": staleColor(staleness) } as CSSProperties);
  const title = `${cmd.what}\n\nClick to copy: ${cmd.command}${at ? `\nLast written ${new Date(at).toLocaleString()}` : ""}`;
  return (
    <button type="button" className={className} style={style} title={title} onClick={() => void copyText(cmd.command, cmd.command)}>
      <span className="game-export-label">{cmd.label}</span>
      {!compact && <code className="game-export-command">{cmd.command}</code>}
      <span className="game-export-age">{at === undefined ? "never" : exportAgeText(now - at)}</span>
    </button>
  );
}
