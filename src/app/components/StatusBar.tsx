"use client";
import { useWatcherStatus, useLootFeed, useCurrentZone } from "@/lib/hooks";
import ZoneTag from "./ZoneTag";

/**
 * Bottom bar: is the log being watched, current zone, and the most recent drop.
 *
 * The zone reads through `ZoneTag`, so the app's one always-visible "where am I" says the camp and its
 * difficulty as two things rather than printing the log's `Blackburrow 3 (Fused)` — and says them the
 * same way every logged row does
 * ([ADR 0136](../../../specs/decisions/0136-logged-data-says-where-it-happened.md)). Unlinked: this bar
 * is in every window, and a link that opened the map from under the panel you were reading is a
 * gesture nobody asked for.
 */
export default function StatusBar() {
  const status = useWatcherStatus();
  const feed = useLootFeed(1);
  const zone = useCurrentZone();
  const last = feed[0];

  return (
    <div className="statusbar">
      <span className={`dot ${status.watching ? "on" : ""}`} />
      <span>{status.watching ? `Watching ${fileName(status.file)}` : status.error ?? "Log not being watched"}</span>
      {zone && (
        <span>
          · 📍 <ZoneTag zone={zone} link={false} />
        </span>
      )}
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
