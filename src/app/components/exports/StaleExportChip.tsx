"use client";
import { useExportTimes } from "@/lib/exports/useGameExports";
import { useOptionalNav } from "@/lib/chrome/nav";
import { GAME_EXPORT_COMMANDS, stalestExport } from "@/shared/game-exports";
import ExportButton from "@/app/components/exports/ExportButton";

/**
 * The status bar's reminder to retake an export: the stalest dump you use, as the same tinted
 * button the exports section shows. One click opens that section, where its command is copied and
 * what it feeds is shown — like everything else in the bar, it's a way in
 * ([ADR 0326](../../../../specs/decisions/0326-the-status-bar-is-a-way-in.md), changing
 * [ADR 0320](../../../../specs/decisions/0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md)'s copy-on-click).
 * Draws nothing while every dump is fresh, so it only takes room when it has something to say.
 */
export default function StaleExportChip() {
  const { times, now } = useExportTimes();
  const nav = useOptionalNav();
  const cmd = stalestExport(GAME_EXPORT_COMMANDS, times, now);
  if (!cmd) return null;
  const onOpen = nav ? { label: "Inventory & exports", open: () => nav.openTab("exports") } : undefined;
  return <ExportButton cmd={cmd} times={times} now={now} compact onOpen={onOpen} />;
}
