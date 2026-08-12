"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useDismiss } from "@/lib/hooks";

export interface TabItem {
  key: string;
  label: string;
}

const GAP = 4; // must match `.tabs` gap in globals.css

/**
 * A horizontal tab bar that keeps every tab reachable when the window is too narrow to
 * show them all: tabs that don't fit collapse into a **» menu** instead of shrinking off
 * the edge. Natural tab widths are measured from an off-screen ghost row, so the visible
 * row can render only what fits; it re-measures on resize (ResizeObserver) and when the
 * labels change (e.g. the List count).
 */
export default function TabBar({
  items,
  active,
  onSelect,
}: {
  items: TabItem[];
  active: string;
  onSelect: (key: string) => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);
  const [menuOpen, setMenuOpen] = useState(false);

  // Re-measure when the row resizes or the labels change (label widths shift the fit).
  const sig = items.map((t) => `${t.key}:${t.label}`).join("|");
  useLayoutEffect(() => {
    const row = rowRef.current;
    const ghost = ghostRef.current;
    if (!row || !ghost) return;

    const measure = () => {
      const cs = getComputedStyle(row);
      const avail = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const nodes = Array.from(ghost.children) as HTMLElement[];
      const tabW = nodes.slice(0, items.length).map((el) => el.offsetWidth);
      const moreW = nodes[items.length]?.offsetWidth ?? 0;
      const widthOf = (count: number, withMore: boolean) => {
        let w = tabW.slice(0, count).reduce((a, b) => a + b, 0) + Math.max(0, count - 1) * GAP;
        if (withMore) w += (count > 0 ? GAP : 0) + moreW;
        return w;
      };
      if (widthOf(items.length, false) <= avail) {
        setVisibleCount(items.length);
        return;
      }
      let count = 0;
      while (count < items.length && widthOf(count + 1, true) <= avail) count++;
      setVisibleCount(Math.max(1, count)); // never hide everything
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useDismiss(rowRef, menuOpen, () => setMenuOpen(false));

  const visible = items.slice(0, visibleCount);
  const overflow = items.slice(visibleCount);
  const overflowActive = overflow.some((t) => t.key === active);

  return (
    <div className="tabs" ref={rowRef}>
      {visible.map((t) => (
        <button key={t.key} className={`tab ${active === t.key ? "active" : ""}`} onClick={() => onSelect(t.key)}>
          {t.label}
        </button>
      ))}

      {overflow.length > 0 && (
        <div className="tab-more no-drag">
          <button
            className={`tab ${overflowActive ? "active" : ""}`}
            title={`${overflow.length} more tab${overflow.length === 1 ? "" : "s"}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            »{overflow.length}
          </button>
          {menuOpen && (
            <div className="tab-menu" role="menu">
              {overflow.map((t) => (
                <button
                  key={t.key}
                  className={`tab-menu-item ${active === t.key ? "active" : ""}`}
                  role="menuitem"
                  onClick={() => {
                    onSelect(t.key);
                    setMenuOpen(false);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Off-screen ghost: all tabs + a sample » button, measured for natural widths only. */}
      <div className="tabs tab-ghost" ref={ghostRef} aria-hidden>
        {items.map((t) => (
          <button key={t.key} className="tab" tabIndex={-1}>
            {t.label}
          </button>
        ))}
        <button className="tab" tabIndex={-1}>
          »{items.length}
        </button>
      </div>
    </div>
  );
}
