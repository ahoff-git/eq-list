"use client";
import { useExportTimes } from "@/lib/exports/useGameExports";
import { GAME_EXPORT_COMMANDS, stalestExport } from "@/shared/game-exports";
import ExportButton from "@/app/components/exports/ExportButton";

/**
 * The status bar's reminder to retake an export: the stalest dump you use, as the same tinted copy
 * button the exports section shows — one click copies the command, wherever you are
 * ([ADR 0320](../../../../specs/decisions/0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md)).
 * Draws nothing while every dump is fresh, so it only takes room when it has something to say.
 */
export default function StaleExportChip() {
  const { times, now } = useExportTimes();
  const cmd = stalestExport(GAME_EXPORT_COMMANDS, times, now);
  return cmd ? <ExportButton cmd={cmd} times={times} now={now} compact /> : null;
}
