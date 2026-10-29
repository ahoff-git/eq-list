"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import SearchField from "@/app/components/SearchField";
import type { TabItem } from "@/app/components/chrome/TabBar";
import { useInventory } from "@/lib/exports/useGameExports";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { useWikiSearch } from "@/lib/useWikiSearch";
import { inventoryTotals } from "@/shared/game-export-dumps";
import { findAcross } from "@/shared/find/find-across";
import { ghostCompletion, globalSuggestions, rememberPick, type Suggestion } from "@/shared/find/global-suggest";

/** One place the bar can take you: a section, named with the area it lives in. */
export interface JumpTarget {
  section: TabItem;
  area: string;
}

/**
 * The universal search bar, always in the window's frame beside back and forward
 * ([ADR 0346](../../../../specs/decisions/0346-search-is-a-bar-in-the-frame.md)). **Ctrl+K** focuses it.
 *
 * It autocompletes as you type ([ADR 0349](../../../../specs/decisions/0349-the-search-bar-autocompletes.md)):
 * sections, wiki pages, what you hold, stances, invocations and AAs in one ranked list
 * (`globalSuggestions`), with the best prefix match ghosted behind the caret for Tab. A page opens
 * straight away; a stance or AA is looked up in Find → Search, whose row says what it does. The last
 * line is always "Look up …", for when none of them is what you meant.
 */
export default function SearchBar({
  targets,
  onJump,
  onOpenPage,
  onLookUp,
}: {
  targets: readonly JumpTarget[];
  onJump: (section: string) => void;
  onOpenPage: (title: string) => void;
  onLookUp: (text: string) => void;
}) {
  const field = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = usePersistentState<Suggestion[]>(STORAGE_KEYS.searchRecent, []);

  const sections = useMemo(
    () => targets.filter((t) => !t.section.disabled).map((t) => ({ key: t.section.key, label: t.section.label, area: t.area })),
    [targets],
  );
  const { hits: wiki } = useWikiSearch(query);
  const { items } = useInventory();
  const held = useMemo(() => (items ? inventoryTotals(items) : null), [items]);
  const across = useMemo(() => findAcross(query, held), [query, held]);
  const suggestions = useMemo(() => globalSuggestions({ text: query, sections, wiki, across, recent }), [query, sections, wiki, across, recent]);
  const ghost = ghostCompletion(query, suggestions);
  const lookUp = query.trim();
  // The choices in order: the suggestions, then always a lookup of the text itself.
  const choices = suggestions.length + (lookUp ? 1 : 0);

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
    const s = suggestions[i];
    if (!s) {
      if (lookUp) onLookUp(lookUp);
      return;
    }
    setRecent((r) => rememberPick(r, s));
    if ("section" in s.target) onJump(s.target.section);
    else if ("page" in s.target) onOpenPage(s.target.page);
    else onLookUp(s.target.lookUp);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const input = field.current;
    const atEnd = !input || input.selectionStart === query.length;
    if (ghost && (e.key === "Tab" || (e.key === "ArrowRight" && atEnd))) setQuery(query + ghost);
    else if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") setActive((i) => Math.min(choices - 1, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Enter" && choices) choose(active);
    else return;
    e.preventDefault();
  };

  return (
    <div className="search-bar no-drag" onKeyDown={onKeyDown}>
      <span className="suggest">
        {ghost && (
          <span className="suggest-ghost" aria-hidden>
            <span className="suggest-typed">{query}</span>
            {ghost}
          </span>
        )}
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
          title={ghost ? `Tab to complete: ${query}${ghost}` : undefined}
        />
      </span>
      {open && choices > 0 && (
        // Mouse-down is kept from the field, so a click lands before the blur closes the list.
        <div className="jump-list" role="listbox" onMouseDown={(e) => e.preventDefault()}>
          {!query.trim() && recent.length > 0 && <div className="muted small jump-head">Recent</div>}
          {suggestions.map((s, i) => (
            <button key={`${s.kind}:${s.label}`} role="option" aria-selected={i === active} className={`jump-item ${i === active ? "active" : ""}`} onClick={() => choose(i)}>
              {s.label}
              <span className="muted small">{s.detail}</span>
            </button>
          ))}
          {lookUp && (
            <button role="option" aria-selected={active === suggestions.length} className={`jump-item ${active === suggestions.length ? "active" : ""}`} onClick={() => choose(suggestions.length)}>
              Look up “{lookUp}”
              <span className="muted small">Find → Search</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
