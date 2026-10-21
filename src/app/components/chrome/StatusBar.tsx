"use client";
import type { ReactNode } from "react";
import { useWatcherStatus, useLootFeed, useCurrentZone } from "@/lib/hooks";
import { useOptionalNav } from "@/lib/chrome/nav";
import ZoneTag from "@/app/components/map/ZoneTag";
import { ZoneName } from "@/app/components/map/ZoneName";
import ItemLink from "@/app/components/items/ItemLink";
import GameClock from "@/app/components/gameclock/GameClock";
import { heldAsNamed, notAnItem } from "@/shared/shown-name";

/**
 * Bottom bar: is the log being watched, current zone, the game clock, and the most recent drop —
 * **each a way in to where it's dealt with**: the log's status opens the settings that choose it, the
 * zone its page, the drop the Loot tab (its item and mob link to their own pages too), and a
 * window's own additions (`children`, the main window's stale-export chip) do likewise.
 *
 * The zone reads through `ZoneTag`, so the app's one always-visible "where am I" says the camp and its
 * difficulty as two things rather than printing the log's `Blackburrow 3 (Fused)` — and says them the
 * same way every logged row does
 * ([ADR 0136](../../../specs/decisions/0136-logged-data-says-where-it-happened.md)). It opens the
 * zone's *page*, never the map: a map window appearing from under the panel you were reading is a
 * gesture nobody asked for.
 *
 * The clock keeps its own click (pin the floating clock), which is what a click on it already meant.
 */
export default function StatusBar({ children }: { children?: ReactNode }) {
  const status = useWatcherStatus();
  const feed = useLootFeed(1);
  const zone = useCurrentZone();
  const last = feed[0];

  return (
    <div className="statusbar">
      <StatusLink tab="settings" title="Choose the log folder, in Settings">
        <span className={`dot ${status.watching ? "on" : ""}`} />{" "}
        {status.watching ? `Watching ${fileName(status.file)}` : status.error ?? "Log not being watched"}
      </StatusLink>
      {zone && (
        <span>
          · 📍{" "}
          <ZoneName zone={zone}>
            <ZoneTag zone={zone} link={false} />
          </ZoneName>
        </span>
      )}
      <span>
        · <GameClock />
      </span>
      <span className="spacer" />
      {last && (
        <StatusLink tab="loot" title="Open the Loot tab" className="muted">
          last drop: <ItemLink title={heldAsNamed(last.item)} />{" "}
          {last.source && (
            <span className="small">
              from <ItemLink title={notAnItem(last.source)} />
            </span>
          )}
        </StatusLink>
      )}
      {children}
    </div>
  );
}

/**
 * A status chip that opens a tab. Plain text where there's no tab bar to open one in, so the bar
 * still reads the same in a window without navigation.
 */
export function StatusLink({ tab, title, className, children }: { tab: string; title: string; className?: string; children: ReactNode }) {
  const nav = useOptionalNav();
  if (!nav) return <span className={className}>{children}</span>;
  return (
    <span className={`status-link${className ? ` ${className}` : ""}`} title={title} onClick={() => nav.openTab(tab)}>
      {children}
    </span>
  );
}

function fileName(p?: string): string {
  if (!p) return "";
  return p.split(/[\\/]/).pop() ?? p;
}
