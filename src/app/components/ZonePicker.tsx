"use client";
import { useMemo, useRef, useState } from "react";
import { fuzzyRank } from "@/shared/fuzzy";
import type { Zone } from "@/shared/map/types";
import { useDismiss } from "@/lib/hooks";

/** How many matches to offer — enough to find a zone, few enough to read. */
const MAX_MATCHES = 12;

/**
 * A zone picker: type to narrow, click or press Enter to choose.
 *
 * A `<select>` stopped being usable the moment the game's own maps arrived — 568 zones in one
 * dropdown is a scroll, not a choice. Matching is the app's existing `fuzzyRank` (token overlap
 * plus Levenshtein), so a typo or a half-remembered name still finds the zone, and it searches the
 * **file name too**: plenty of zones can only be named by their file (`gukbottom`), and someone who
 * knows EverQuest may well type that.
 *
 * Blank is a real choice, not an empty box, so it's the first option rather than something you
 * clear the field to get. What it *means* is the caller's: the map follows the log's zone, the
 * Hunt tab shows every zone.
 */
export default function ZonePicker({
  zones,
  value,
  onPick,
  currentZone,
  placeholder,
  blankLabel,
  limit = MAX_MATCHES,
  align = "right",
}: {
  zones: Zone[];
  /** The chosen zone's display name, or "" for whatever `blankLabel` describes. */
  value: string;
  onPick: (name: string | null) => void;
  /** The zone the log says you're in, named in the default "follow" option. */
  currentZone?: string | null;
  placeholder?: string;
  /** What choosing blank does. Defaults to following the log's zone, which is the map's meaning. */
  blankLabel?: string;
  /** How many matches to offer — raise it when the zone list is a short, curated one. */
  limit?: number;
  /**
   * Which edge the dropdown is anchored to. The menu can be wider than the box, so it has to grow
   * *away* from the nearest window edge or it runs off it — right for a picker near the right of its
   * window (the map's titlebar), left for one on the left (the travel panel's "From").
   */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useDismiss(boxRef, open, () => setOpen(false));

  const matches = useMemo(() => {
    const q = query.trim();
    // Nothing typed: show the list as-is rather than an arbitrary ranking of everything.
    if (!q) return zones.slice(0, limit);
    // The file name is searched alongside the zone name — it's what a zone we couldn't name is
    // called, and what someone who knows EverQuest would type — but only when it differs, so a
    // plain name isn't diluted by a duplicate token.
    const text = (z: Zone) => (z.file && z.file !== z.name.toLowerCase() ? `${z.name} ${z.file}` : z.name);
    return fuzzyRank(q, zones, text, { limit }).map((m) => m.item);
  }, [query, zones, limit]);

  const choose = (name: string | null) => {
    onPick(name);
    setQuery("");
    setOpen(false);
  };

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      // −1 is the blank row (follow / all zones), which sits above the matches.
      setActive((i) => Math.max(-1, Math.min(matches.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active === -1) choose(null);
      else if (matches[active]) choose(matches[active].name);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="zone-picker no-drag" ref={boxRef}>
      <input
        className="field zone-input"
        value={open ? query : value}
        placeholder={placeholder ?? (currentZone ? `Follow current · ${currentZone}` : "Follow current zone")}
        title={`Type to find a zone — blank is “${blankLabel ?? "Follow current"}”`}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className={`zone-menu ${align}`}>
          <button
            className={`zone-option ${active === -1 ? "on" : ""} ${!value ? "current" : ""}`}
            onMouseEnter={() => setActive(-1)}
            onClick={() => choose(null)}
          >
            {blankLabel ?? `Follow current${currentZone ? ` · ${currentZone}` : ""}`}
          </button>
          {matches.map((z, i) => (
            <button
              key={z.key}
              className={`zone-option ${i === active ? "on" : ""} ${z.name === value ? "current" : ""}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(z.name)}
            >
              {z.name}
              {/* The file name too when it isn't obvious from the zone name — it's what you'd
                  have typed if you know EverQuest, and what a zone we couldn't name is called. */}
              {z.file && z.file !== z.name.toLowerCase() && <span className="muted small"> · {z.file}</span>}
            </button>
          ))}
          {!matches.length && <div className="zone-option muted">No zone matches “{query}”</div>}
        </div>
      )}
    </div>
  );
}
