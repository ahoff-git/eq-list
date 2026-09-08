"use client";
import { useCapabilities } from "@/lib/hooks";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { LATEST_RELEASE_URL } from "@/shared/constants";

/**
 * A dismissible "this is the web view — the desktop app does more" strip, shown only to a plain
 * browser tab (no `windowing` capability — Electron always reports every capability true, so this
 * is the same test `page.tsx`'s tabs already gate on for a live EverQuest log). The desktop app is
 * where the log-driven tabs (Timers, Goals, Buffs, Loot, Damage, Session, Alerts) actually work, so
 * a web visitor is worth pointing at the download.
 */
export default function WebDownloadBanner() {
  const capabilities = useCapabilities();
  const [dismissed, setDismissed] = usePersistentState(STORAGE_KEYS.webDownloadDismissed, false);

  if (capabilities.windowing || dismissed) return null;

  return (
    <div className="update-banner no-drag">
      <span className="ub-dot" aria-hidden />
      <span className="ub-text">
        This is the web view — the desktop app also watches your EQ log for live drops, XP, and buffs.
      </span>
      <span className="spacer" />
      <a className="btn sm primary" href={LATEST_RELEASE_URL} target="_blank" rel="noreferrer">
        Download
      </a>
      <button className="btn ghost sm" title="Dismiss" onClick={() => setDismissed(true)}>
        ✕
      </button>
    </div>
  );
}
