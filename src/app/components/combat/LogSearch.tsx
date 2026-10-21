"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useWatcherStatus } from "@/lib/hooks";
import SearchField from "@/app/components/SearchField";
import { CheckField, Empty } from "@/app/components/ui";
import { countOf, when } from "@/shared/format";
import { LOG_SEARCH_MIN_CHARS } from "@/shared/log-search";
import type { LogSearchResult } from "@/shared/types";
import { createLogger } from "@/shared/logging";

const log = createLogger("log-search");

/** Long enough that a scan of the whole file runs once per pause in typing, not once per key. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * The log searcher: every line of your log containing a string, with its timestamp, newest first.
 *
 * It searches the **file**, not what the meter has seen since launch, so last week's pull is as
 * findable as the last one — and it reads each hit through the same parser the meter does, which is
 * what the kind beside every line is: a quick way to see whether the app read a line the way you did.
 * "Combat lines only" keeps just the lines the combat parser claims.
 */
export default function LogSearch() {
  const status = useWatcherStatus();
  const [term, setTerm] = useState("");
  const [combatOnly, setCombatOnly] = useState(false);
  const [result, setResult] = useState<LogSearchResult | null>(null);
  const [searching, setSearching] = useState(false);

  const query = term.trim().length >= LOG_SEARCH_MIN_CHARS ? term.trim() : "";

  useEffect(() => {
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
      ) : (
        <ol className="log-hits">
          {hits.map((hit) => (
            <li key={hit.line} className="log-hit">
              <span className="lh-when" title={`Line ${hit.line.toLocaleString()} of ${status.file}`}>
                {when(hit.at)}
              </span>
              <span className="lh-kind muted small" title="What the parser read this line as">
                {hit.kind ?? ""}
              </span>
              <span className="lh-text">
                <Highlighted text={hit.message} needle={query} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** `text` with every case-insensitive occurrence of `needle` marked. */
function Highlighted({ text, needle }: { text: string; needle: string }) {
  const lower = text.toLowerCase();
  const find = needle.toLowerCase();
  const parts: { text: string; hit: boolean }[] = [];
  let from = 0;
  for (let at = lower.indexOf(find); at !== -1 && find; at = lower.indexOf(find, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + find.length), hit: true });
    from = at + find.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return <>{parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}
