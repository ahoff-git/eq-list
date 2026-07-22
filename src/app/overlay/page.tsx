"use client";
import { useEffect, useState } from "react";
import { useShoppingList, useMatchFlashes, useSettings, useCurrentZone } from "@/lib/hooks";
import { api } from "@/lib/api";
import { groupByOrigin } from "@/shared/grouping";
import { groupDropsByZone, splitDropsByCurrentZone, type ZoneDrops } from "@/shared/sources";
import type { ShoppingListEntry } from "@/shared/types";

/**
 * The always-on-top float. Same list state as the control window (shared via the
 * store), grouped by quest/recipe. Click an entry to reveal who drops it, grouped
 * by zone — when the log tells us where you are, that zone is highlighted and the
 * others collapse behind a toggle. The header is the drag handle; entries flash
 * gold when their item drops.
 */
export default function Overlay() {
  const list = useShoppingList();
  const settings = useSettings();
  const flashed = useMatchFlashes();
  const zone = useCurrentZone();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Escape closes the overlay when it has focus (a backup to the ✕ and the hotkey).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") api()?.win.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scale = settings?.overlay.fontScale ?? 1;
  const showObtained = settings?.overlay.showObtained ?? true;
  const visible = list.entries.filter((e) => showObtained || e.obtained < e.needed);
  const groups = groupByOrigin(visible);
  const remaining = list.entries.filter((e) => e.obtained < e.needed).length;

  return (
    <div className="overlay" style={{ fontSize: `${14 * scale}px` }}>
      <div className="overlay-header">
        <span className="mark">EQ</span> List
        <span className="muted small" style={{ fontWeight: 400 }}>
          · {remaining} left
        </span>
        <span className="spacer" />
        <button className="btn ghost sm no-drag" title="Close overlay (Esc)" onClick={() => api()?.win.close()}>
          ✕
        </button>
      </div>

      {zone && <div className="overlay-zone-bar" title="Current zone (from the log)">📍 {zone}</div>}

      <div className="overlay-list">
        {groups.length === 0 && <div className="empty small">Nothing to watch — add items in the control window.</div>}
        {groups.map((g) => {
          const isCollapsed = !!g.kind && !!collapsed[g.key];
          const remaining = g.entries.filter((e) => e.obtained < e.needed).length;
          return (
            <div className="overlay-group" key={g.key}>
              {g.kind && (
                <div
                  className="overlay-group-label"
                  onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                  title="Collapse / expand"
                >
                  <span className="caret">{isCollapsed ? "▸" : "▾"}</span>
                  <span className="ogl-name">{g.label}</span>
                  <span className="ogl-count">{remaining} left</span>
                </div>
              )}
              {!isCollapsed &&
                g.entries.map((e) => (
                  <OverlayEntry key={e.id} entry={e} flashing={flashed.has(e.id)} currentZone={zone} />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OverlayEntry({
  entry,
  flashing,
  currentZone,
}: {
  entry: ShoppingListEntry;
  flashing: boolean;
  currentZone: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [drops, setDrops] = useState<ZoneDrops[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showOthers, setShowOthers] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && drops === null && !loading) {
      setLoading(true);
      try {
        const page = await api()?.wiki.getPage(entry.name);
        setDrops(groupDropsByZone(page?.sources ?? []));
      } finally {
        setLoading(false);
      }
    }
  }

  const met = entry.obtained >= entry.needed;
  const cls = ["overlay-entry", met ? "done" : "", flashing ? "flash" : ""].filter(Boolean).join(" ");
  const split = drops ? splitDropsByCurrentZone(drops, currentZone) : null;

  return (
    <div className="overlay-entry-wrap">
      <div className={cls} onClick={toggle} title="Show who drops this">
        <span className="caret">{open ? "▾" : "▸"}</span>
        <span>{entry.name}</span>
        <span className="n">
          <span className={`have ${met ? "met" : ""}`}>{entry.obtained}</span>/{entry.needed}
        </span>
      </div>

      {open && (
        <div className="overlay-drops">
          {loading && <div className="muted small">Loading…</div>}
          {!loading && drops && drops.length === 0 && (
            <div className="muted small">No known drops — open it on the wiki for other sources.</div>
          )}
          {!loading && split && (
            <>
              {split.here.map((d) => (
                <ZoneRow key={d.zone} drops={d} here />
              ))}
              {split.here.length > 0 && split.elsewhere.length > 0 && (
                <button
                  className="overlay-more"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setShowOthers((s) => !s);
                  }}
                >
                  {showOthers ? "− hide other zones" : `+ ${split.elsewhere.length} other zone${split.elsewhere.length === 1 ? "" : "s"}`}
                </button>
              )}
              {(split.here.length === 0 || showOthers) && split.elsewhere.map((d) => <ZoneRow key={d.zone} drops={d} />)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ZoneRow({ drops, here }: { drops: ZoneDrops; here?: boolean }) {
  return (
    <div className={`overlay-drop-zone ${here ? "here" : ""}`}>
      <span className="dz-name">{drops.zone}</span>
      <span className="dz-mobs">{drops.mobs.join(", ")}</span>
    </div>
  );
}
