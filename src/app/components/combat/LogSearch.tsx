"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWatcherStatus } from "@/lib/hooks";
import SearchField from "@/app/components/SearchField";
import { CheckField, Empty } from "@/app/components/ui";
import { countOf } from "@/shared/format";
import { LOG_SEARCH_MIN_CHARS } from "@/shared/log-search";
import type { LogSearchResult } from "@/shared/types";
import { createLogger } from "@/shared/logging";
import LogContext from "./LogContext";
import LogLineRow from "./LogLineRow";

const log = createLogger("log-search");

/** Long enough that a scan of the whole file runs once per pause in typing, not once per key. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The log searcher: every line of your log containing a string, with its timestamp, newest first.
 *
 * It searches the **file**, not what the meter has seen since launch, so last week's pull is as
 * findable as the last one — and it reads each hit through the same parser the meter does, which is
 * what the kind beside every line is: a quick way to see whether the app read a line the way you did.
 * "Combat lines only" keeps just the lines the combat parser claims. Each hit opens **in context**
 * (`LogContext`): the log around it, to scroll through, with the results kept for coming back to.
 */
export default function LogSearch() {
  const status = useWatcherStatus();
  const [term, setTerm] = useState("");
  const [combatOnly, setCombatOnly] = useState(false);
  const [result, setResult] = useState<LogSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  /** The hit opened in context, by line number — null while the results are showing. */
  const [context, setContext] = useState<number | null>(null);

  const query = term.trim().length >= LOG_SEARCH_MIN_CHARS ? term.trim() : "";

  useEffect(() => {
    // A new search (or a new file) is a new list: the line opened from the old one belongs to it.
    setContext(null);
    if (!query) {
      setResult(null);
      setSearching(false);
      return;
    }
    let live = true;
    setSearching(true);
    const id = setTimeout(async () => {
      let found: LogSearchResult | undefined;
      try {
        found = await api()?.log.search(query, { combatOnly });
      } catch (err) {
        // A failed search must still stop saying "Searching…" — it would otherwise spin for ever.
        log.warn("log search failed", err);
      }
      // A newer search cut this one short, or this effect was replaced while it ran — either way
      // the answer on screen belongs to whatever is being typed now, not to this.
      if (!live || found?.superseded) return;
      setResult(found ?? null);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [query, combatOnly, status.file]);

  const hits = result?.hits ?? [];

  return (
    <div className="log-search">
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <SearchField
          value={term}
          onChange={setTerm}
          placeholder="Search your log…"
          title="Any part of a line, in any case — a name, a spell, a word, or a time like “Aug 29 00:4”"
          autoFocus
        />
        <CheckField
          label="Combat lines only"
          checked={combatOnly}
          onChange={setCombatOnly}
          title="Only lines the combat parser reads as combat: swings, spells, heals, resists, deaths, charms"
        />
        <span className="muted small">
          {searching
            ? "Searching…"
            : result && query
              ? `${countOf(hits.length, result.total, "line")}${hits.length < result.total ? " — newest shown" : ""}`
              : ""}
        </span>
      </div>

      {!status.file ? (
        <Empty title="No log to search" hint="Point Settings at your EverQuest Logs folder and play a little." />
      ) : !query ? (
        <Empty
          title="Search the whole log"
          hint={`Type at least ${LOG_SEARCH_MIN_CHARS} characters. Every matching line is listed with its timestamp, newest first.`}
        />
      ) : result && !searching && !hits.length ? (
        <Empty title={`Nothing in your log mentions “${query}”`} hint="The match ignores case, and includes the timestamp." />
      ) : context !== null ? (
        <LogContext line={context} needle={query} file={status.file} onClose={() => setContext(null)} />
      ) : (
        <ol className="log-hits">
          {hits.map((hit) => (
            <LogLineRow
              key={hit.line}
              hit={hit}
              needle={query}
              file={status.file}
              action={
                <button
                  className="btn ghost sm"
                  onClick={() => setContext(hit.line)}
                  title="Open the log at this line, to scroll through what came before and after"
                >
                  ↕ Context
                </button>
              }
            />
          ))}
        </ol>
      )}
    </div>
  );
}
