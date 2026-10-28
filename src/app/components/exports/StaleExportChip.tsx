"use client";
import { useExportTimes } from "@/lib/exports/useGameExports";
import { GAME_EXPORT_COMMANDS, stalestExport } from "@/shared/game-exports";
import ExportButton from "@/app/components/exports/ExportButton";

/**
 * The status bar's reminder to retake an export: the stalest dump you use, as the same tinted
 * button the exports section shows. One click opens that dump's own view in the section, under its
 * copy button and over what it read last time — like everything else in the bar, it's a way in
 * ([ADR 0326](../../../../specs/decisions/0326-the-status-bar-is-a-way-in.md), changing
 * [ADR 0320](../../../../specs/decisions/0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md)'s copy-on-click).
 * Draws nothing while every dump is fresh, so it only takes room when it has something to say.
 *
 * `onOpen` is the window's way to that view (it owns the tabs); without one the chip copies, as the
 * section's own buttons do.
 */
export default function StaleExportChip({ onOpen }: { onOpen?: (fileType: string) => void }) {
  const { times, now } = useExportTimes();
  const cmd = stalestExport(GAME_EXPORT_COMMANDS, times, now);
  if (!cmd) return null;
  const open = onOpen ? { label: `${cmd.label} in Inventory & exports`, open: () => onOpen(cmd.fileType) } : undefined;
  return <ExportButton cmd={cmd} times={times} now={now} compact onOpen={open} />;
}
