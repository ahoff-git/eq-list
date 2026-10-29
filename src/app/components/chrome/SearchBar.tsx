"use client";
import { useEffect, useMemo, useState } from "react";
import { useFuzzyFilter } from "@/lib/useFuzzyFilter";
import SearchField from "@/app/components/SearchField";
import type { TabItem } from "@/app/components/chrome/TabBar";

/** One place the palette can take you: a section, named with the area it lives in. */
export interface JumpTarget {
  section: TabItem;
  area: string;
}

const textOf = (t: JumpTarget) => `${t.section.label} ${t.area}`;

/**
 * **Ctrl+K**: type a few letters, press Enter, be there — any section in any area, or, when nothing
 * matches by name, a lookup of what you typed in Find → Search
 * ([ADR 0320](../../../../specs/decisions/0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md)).
 * The quick way past the two rows of tabs; the rows stay for reading where you are.
 */
export default function JumpPalette({
  targets,
  onJump,
  onLookUp,
}: {
  targets: readonly JumpTarget[];
  onJump: (section: string) => void;
  onLookUp: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const usable = useMemo(() => targets.filter((t) => !t.section.disabled), [targets]);
  const { query, setQuery, filtered } = useFuzzyFilter(usable, textOf);
  const lookUp = query.trim();
  // The choices in order: matching sections, then always a lookup of the text itself.
  const choices = lookUp ? filtered.length + 1 : filtered.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    setQuery("");
    setActive(0);
  }, [open, setQuery]);
  useEffect(() => setActive(0), [query]);

  if (!open) return null;

  const choose = (i: number) => {
    setOpen(false);
    if (i < filtered.length) onJump(filtered[i].section.key);
    else if (lookUp) onLookUp(lookUp);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") setActive((i) => Math.min(choices - 1, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" && choices) choose(active);
    else return;
    e.preventDefault();
  };

  return (
    <div className="jump-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="jump-palette" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <SearchField value={query} onChange={setQuery} placeholder="Go to… or look up a name" autoFocus />
        <div className="jump-list" role="listbox">
          {filtered.map((t, i) => (
            <button key={t.section.key} role="option" aria-selected={i === active} className={`jump-item ${i === active ? "active" : ""}`} onClick={() => choose(i)}>
              {t.section.label}
              <span className="muted small">{t.area}</span>
            </button>
          ))}
          {lookUp && (
            <button role="option" aria-selected={active === filtered.length} className={`jump-item ${active === filtered.length ? "active" : ""}`} onClick={() => choose(filtered.length)}>
              Look up “{lookUp}”
              <span className="muted small">Find → Search</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
