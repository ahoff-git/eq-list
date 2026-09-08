"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useKnownItems, useLucySearch, useSettings } from "@/lib/hooks";
import { searchKnownItems, unknownToTheWiki } from "@/shared/known-items";
import { createLogger } from "@/shared/logging";
import { TextField } from "./ui";
import type { SearchResult } from "@/shared/types";

const log = createLogger("item-name-field");

/** How long to sit on a keystroke before asking the wiki — same rhythm as the Search tab. */
const SEARCH_DEBOUNCE_MS = 200;

/** Below this a query matches nearly everything, so it's not worth asking. */
const MIN_QUERY_CHARS = 2;

/**
 * A plain text field for an item name, backed by the same layered lookup the Search tab uses:
 * eqlwiki first, then your own log for what the wiki doesn't carry, then Lucy as a last resort
 * ([ADR 0103](../../../specs/decisions/0103-search-can-answer-from-your-own-log.md),
 * [ADR 0124](../../../specs/decisions/0124-lucy-is-a-second-opinion.md)) — so naming a goal draws
 * on everything the app already knows about item names instead of a blind free-text guess.
 *
 * Unlike the Search tab this never opens a page; picking a suggestion just fills the field.
 */
export default function ItemNameField({
  value,
  onChange,
  className = "field",
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const settings = useSettings();

  // The query once typing has settled — the wiki lookup and Lucy's both key off this, one request
  // per settled query rather than one per keystroke.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const settled = value.trim().length >= MIN_QUERY_CHARS ? value : "";
    if (!settled) {
      setDebounced("");
      return;
    }
    const id = setTimeout(() => setDebounced(settled), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value]);

  const [wikiHits, setWikiHits] = useState<SearchResult[]>([]);
  useEffect(() => {
    const a = api();
    if (!a || !debounced) {
      setWikiHits([]);
      return;
    }
    let cancelled = false;
    void a.wiki.search(debounced).then((res) => {
      if (cancelled) return;
      log.debug("wiki hits", debounced, res.length);
      setWikiHits(res);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  // What you've held yourself, minus anything the wiki already answered — same ranking the Search
  // tab uses, computed locally so it needs no debounce.
  const known = useKnownItems();
  const mine = useMemo(
    () => (value.trim().length >= MIN_QUERY_CHARS ? unknownToTheWiki(searchKnownItems(value, known), wikiHits) : []),
    [value, known, wikiHits],
  );

  // Lucy, the last rung: asked only when neither the wiki nor your own log had anything.
  const askLucy = (settings?.askLucy ?? true) && !!debounced && !wikiHits.length && !mine.length;
  const { hits: lucyHits } = useLucySearch(debounced, askLucy);

  const list = useMemo(
    () => [...wikiHits.map((r) => r.title), ...mine.map((i) => i.item), ...lucyHits.map((h) => h.name)],
    [wikiHits, mine, lucyHits],
  );

  const accept = (name: string) => {
    log.debug("accepted", name);
    onChange(name);
    setOpen(false);
  };

  return (
    <span className="suggest">
      <TextField
        {...rest}
        className={className}
        value={value}
        onFocus={() => setOpen(true)}
        // Late enough for a click on the list to land first.
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onChange={(next) => {
          onChange(next);
          setOpen(true);
          setHighlight(0);
        }}
        onKeyDown={(e) => {
          if (open && list.length) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % list.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + list.length) % list.length);
              return;
            }
            if (e.key === "Enter" && list[highlight]) {
              e.preventDefault();
              accept(list[highlight]);
              return;
            }
            if (e.key === "Escape") {
              setOpen(false);
              return;
            }
          }
          // Anything the suggestions didn't want goes on to the caller, same convention as
          // `SuggestField` — a form's own Enter/Escape keep working once the list is empty or closed.
          rest.onKeyDown?.(e);
        }}
      />
      {open && list.length > 0 && (
        <div className="suggest-list" role="listbox">
          {list.map((name, i) => (
            <button
              key={name}
              className={`suggest-item ${i === highlight ? "on" : ""}`}
              role="option"
              aria-selected={i === highlight}
              // `onMouseDown`, not `onClick`: the input's blur would otherwise close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                accept(name);
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
