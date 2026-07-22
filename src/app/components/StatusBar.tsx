"use client";
import { useWatcherStatus, useLootFeed, useCurrentZone } from "@/lib/hooks";

/** Bottom bar: is the log being watched, current zone, and the most recent drop. */
export default function StatusBar() {
  const status = useWatcherStatus();
  const feed = useLootFeed(1);
  const zone = useCurrentZone();
  const last = feed[0];

  return (
    <div className="statusbar">
      <span className={`dot ${status.watching ? "on" : ""}`} />
      <span>{status.watching ? `Watching ${fileName(status.file)}` : status.error ?? "Log not being watched"}</span>
      {zone && <span>· 📍 {zone}</span>}
      <span className="spacer" />
      {last && (
        <span className="muted">
          last drop: {last.item} <span className="small">from {last.source}</span>
        </span>
      )}
    </div>
  );
}

function fileName(p?: string): string {
  if (!p) return "";
  return p.split(/[\\/]/).pop() ?? p;
}
