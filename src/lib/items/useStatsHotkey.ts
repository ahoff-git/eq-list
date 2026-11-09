"use client";
import { useAppInfo } from "@/lib/hooks";
import { STATS_HOTKEY } from "@/shared/constants";

/**
 * The stats grab's key, as the app actually has it — and whether the key works.
 *
 * A global hotkey can be refused: another program already owns the chord, and Electron says so only to the
 * process that asked. Main records that per hotkey (`HotkeyInfo.registered`), so every place that tells the
 * player "press Ctrl/Cmd+Shift+K" can instead tell them the truth: that it's taken, and the button is the way.
 * Before the app's info has arrived the key is assumed to work — the common case, and wrong for only a moment.
 */
export function useStatsHotkey(): { label: string; works: boolean } {
  const info = useAppInfo();
  const hotkey = info?.hotkeys.find((h) => /stats/i.test(h.action));
  return { label: hotkey?.label ?? STATS_HOTKEY.label, works: hotkey ? hotkey.registered : true };
}
