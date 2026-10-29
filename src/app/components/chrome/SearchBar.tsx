"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFuzzyFilter } from "@/lib/useFuzzyFilter";
import SearchField from "@/app/components/SearchField";
import type { TabItem } from "@/app/components/chrome/TabBar";

/** One place the bar can take you: a section, named with the area it lives in. */
export interface JumpTarget {
  section: TabItem;
  area: string;
}

const textOf = (t: JumpTarget) => `${t.section.label} ${t.area}`;

/**
 * The universal search bar, always in the window's frame beside back and forward: type a few
 * letters, press Enter, be there — any section in any area, or a lookup of what you typed in
 * Find → Search, which answers from the wiki, your inventory, stances and AAs at once
 * ([ADR 0321](../../../../specs/decisions/0321-find-answers-from-one-box.md)). **Ctrl+K** focuses it.
 *
 * It began as a Ctrl+K palette that only existed while summoned
 * ([ADR 0320](../../../../specs/decisions/0320-tabs-are-grouped-into-areas-by-what-you-are-doing.md));
 * drawn all the time, nobody has to know the shortcut to find it
 * ([ADR 0346](../../../../specs/decisions/0346-search-is-a-bar-in-the-frame.md)).
 */
export default function SearchBar({
  targets,
  onJump,
  onLookUp,
}: {
  targets: readonly JumpTarget[];
  onJump: (section: string) => void;
  onLookUp: (text: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
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
        field.current?.focus();
        field.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setActive(0), [query]);

  const close = () => {
    setOpen(false);
    setQuery("");
    field.current?.blur();
  };
  const choose = (i: number) => {
    close();
    if (i < filtered.length) onJump(filtered[i].section.key);
    else if (lookUp) onLookUp(lookUp);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") setActive((i) => Math.min(choices - 1, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" && choices) choose(active);
    else return;
    e.preventDefault();
  };

  return (
    <div className="search-bar no-drag" onKeyDown={onKeyDown}>
      <SearchField
        ref={field}
        value={query}
        onChange={(text) => {
          setQuery(text);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="Search or go to… (Ctrl+K)"
        aria-label="Search everything, or go to a section"
      />
      {open && choices > 0 && (
        // Mouse-down is kept from the field, so a click lands before the blur closes the list.
        <div className="jump-list" role="listbox" onMouseDown={(e) => e.preventDefault()}>
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
      )}
    </div>
  );
}
