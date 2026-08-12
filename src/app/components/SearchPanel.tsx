"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/hooks";
import { useNav } from "@/lib/nav";
import ItemLink from "./ItemLink";
import WikiPageView from "./WikiPageView";
import { CheckField, segCls } from "./ui";
import { LOOKUP_HOTKEY } from "@/shared/constants";
import type { SearchResult, WikiPage } from "@/shared/types";

type Mode = "name" | "zone";

/**
 * How long to sit on a keystroke before asking the wiki.
 *
 * Every search is an IPC round trip and a wiki lookup, so typing "Rusty Short Sword" unthrottled is
 * seventeen of them for one answer. Long enough to swallow a burst of typing, short enough that a
 * pause between words already shows results.
 */
const SEARCH_DEBOUNCE_MS = 200;

/** Below this a query matches nearly everything, so it's not worth asking. */
const MIN_QUERY_CHARS = 2;

/**
 * Search eqlwiki two ways, both typo-tolerant (see shared/fuzzy.ts):
 *  - "Name": fuzzy-find any item / quest / recipe by name.
 *  - "By zone": fuzzy-pick a zone, then list the quests in it.
 * Opening a page lets you add an item, or "Add full quest" to queue all of a
 * quest's turn-ins grouped under the quest. The open page and every link within it
 * are driven by the shared in-app nav (`useNav`), so nothing jumps to the browser.
 */
export default function SearchPanel({
  prefill,
  onPrefillUsed,
}: {
  /** Text handed in from outside (screengrab OCR, or the map window) to search for. */
  prefill?: string | null;
  /** Called once the prefill has been applied, so the owner can drop it — see the effect. */
  onPrefillUsed?: () => void;
}) {
  const nav = useNav();
  const [mode, setMode] = useState<Mode>("name");

  // name mode
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Bumped by a manual index refresh so the current search re-runs against the fresh data.
  const [refreshNonce, setRefreshNonce] = useState(0);

  // zone mode
  const [zoneTerm, setZoneTerm] = useState("");
  const [zoneSuggestions, setZoneSuggestions] = useState<SearchResult[]>([]);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [quests, setQuests] = useState<SearchResult[]>([]);
  const [loadingQuests, setLoadingQuests] = useState(false);

  // The page currently open in-app (nav.current) is fetched here.
  const [page, setPage] = useState<WikiPage | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);

  const settings = useSettings();
  const hideEra = settings?.hideOutOfEra ?? false;
  const keep = (list: SearchResult[]) => (hideEra ? list.filter((r) => !r.outOfEra) : list);
  const shownResults = keep(results);
  const shownQuests = keep(quests);

  // Debounced name search. A `cancelled` flag drops a slower in-flight search when a newer
  // keystroke supersedes it, so stale results can't overwrite current ones (or reappear
  // after the box is cleared).
  useEffect(() => {
    const a = api();
    if (mode !== "name" || !a || term.trim().length < MIN_QUERY_CHARS) {
      setResults([]);
      setBusy(false);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await a.wiki.search(term);
        if (cancelled) return;
        setResults(res);
        setActive(0);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [term, mode, refreshNonce]);

  // A screengrab lookup prefills the box (name mode) and its text searches normally. It's a
  // one-shot: applying it clears the open page, so we tell the owner it's been used and it
  // drops it. This panel is unmounted whenever another tab shows, and a prefill still sitting
  // there would be re-applied on the next mount — clicking an item name in the List / Hunt /
  // Loot tabs jumps here, and would land on the old lookup text instead of the clicked page.
  // Keyed on `prefill` only, NOT on `nav` changing, for the same reason.
  useEffect(() => {
    if (!prefill) return;
    setMode("name");
    nav.clear();
    setTerm(prefill);
    onPrefillUsed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  // Fetch whatever page the in-app nav points at (from a result, a link, or back/forward).
  useEffect(() => {
    const a = api();
    const title = nav.current;
    if (!a || !title) {
      setPage(null);
      return;
    }
    let cancelled = false;
    setLoadingPage(true);
    setPage(null);
    void (async () => {
      const p = await a.wiki.getPage(title);
      if (!cancelled) {
        setPage(p);
        setLoadingPage(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-fetch only when the open page changes; `nav`'s other fields are irrelevant here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.current]);

  // Debounced zone suggestions (hidden once a zone is locked in).
  useEffect(() => {
    const a = api();
    if (mode !== "zone" || !a || zoneTerm.trim().length < MIN_QUERY_CHARS || zoneTerm === selectedZone) {
      setZoneSuggestions([]);
      return;
    }
    const id = setTimeout(async () => {
      setZoneSuggestions(await a.wiki.searchZones(zoneTerm));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [zoneTerm, mode, selectedZone]);

  function switchMode(m: Mode) {
    setMode(m);
    nav.clear();
  }

  // Force the wiki search index to re-fetch (it's mirrored to disk and otherwise only updates
  // weekly), then re-run the current search so a just-added page shows up without a wait.
  async function refreshIndex() {
    const a = api();
    if (!a || refreshing) return;
    setRefreshing(true);
    try {
      await a.wiki.refresh();
      setRefreshNonce((n) => n + 1);
    } finally {
      setRefreshing(false);
    }
  }

  // Every "open this" in the panel goes through the shared in-app nav.
  const openPage = nav.openPage;

  async function selectZone(title: string) {
    const a = api();
    if (!a) return;
    setSelectedZone(title);
    setZoneTerm(title);
    setZoneSuggestions([]);
    setLoadingQuests(true);
    try {
      setQuests(await a.wiki.questsByZone(title));
    } finally {
      setLoadingQuests(false);
    }
  }

  // Add by title the way the page buttons do, so a result-list "+ Add" behaves the same
  // as opening the page: quests/recipes contribute their turn-ins/ingredients (grouped
  // under the quest/recipe), everything else adds itself. Fetches the page (cached) to
  // learn the kind; falls back to a shallow add if it can't load.
  async function addByTitle(title: string, wikiPath?: string) {
    const a = api();
    if (!a) return;
    const p = await a.wiki.getPage(title);
    if (!p) return void a.list.add({ name: title, wikiPath });
    if (p.kind === "quest" || p.kind === "recipe") a.list.addFromPage(p);
    else a.list.add({ name: p.title, wikiPath: p.wikiPath });
  }

  function onNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!shownResults.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(shownResults.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shownResults[active]) void openPage(shownResults[active].title);
    } else if (e.key === "Escape") {
      setResults([]);
    }
  }

  return (
    <div>
      <div className="segmented" style={{ marginBottom: 10 }}>
        <button className={segCls(mode === "name")} onClick={() => switchMode("name")}>
          By name
        </button>
        <button className={segCls(mode === "zone")} onClick={() => switchMode("zone")}>
          By zone
        </button>
      </div>
      <div className="row" style={{ marginBottom: 8, gap: 10 }}>
        <button className="btn sm" title={`Screengrab lookup — or press ${LOOKUP_HOTKEY.label}`} onClick={() => api()?.lookup.open()}>
          📷 Look up from screen
        </button>
        <button
          className="btn sm"
          title="Re-fetch the wiki's search index now. It's mirrored to disk and otherwise only refreshes about weekly, so a just-added item can be missing from search until you do this."
          onClick={refreshIndex}
          disabled={refreshing}
        >
          {refreshing ? "↻ Refreshing…" : "↻ Refresh list"}
        </button>
        <span className="spacer" />
        <CheckField
          className="muted small"
          label="Hide out of era"
          checked={hideEra}
          onChange={(hide) => void api()?.settings.update({ hideOutOfEra: hide })}
        />
      </div>

      {mode === "name" && !nav.current && (
        <>
          <input
            className="field"
            placeholder="Search for an item, quest, or recipe (spelling can be rough)…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onNameKeyDown}
            autoFocus
          />
          <p className="muted small" style={{ marginTop: 6 }}>
            {busy ? "Searching…" : shownResults.length ? "↑↓ to navigate · Enter to open" : ""}
          </p>
          <div className="results">
            {shownResults.map((r, i) => (
              <div className={`result ${i === active ? "active" : ""}`} key={r.wikiPath}>
                <ItemLink title={r.title} className="name" />
                {r.outOfEra && <span className="badge era-out">era</span>}
                <button className="btn sm primary" onClick={() => void addByTitle(r.title, r.wikiPath)}>
                  + Add
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {mode === "zone" && !nav.current && (
        <>
          <input
            className="field"
            placeholder="Type a zone name (spelling can be rough)…"
            value={zoneTerm}
            onChange={(e) => {
              setZoneTerm(e.target.value);
              setSelectedZone(null);
            }}
            autoFocus
          />
          {zoneSuggestions.length > 0 && (
            <div className="results">
              {zoneSuggestions.map((z) => (
                <div className="result" key={z.wikiPath}>
                  <span className="name">{z.title}</span>
                  <button className="btn sm primary" onClick={() => selectZone(z.title)}>
                    Show quests
                  </button>
                </div>
              ))}
            </div>
          )}

          {selectedZone && (
            <div style={{ marginTop: 12 }}>
              <h4 className="muted small">Quests in {selectedZone}</h4>
              {loadingQuests && <p className="muted">Loading quests…</p>}
              {!loadingQuests && shownQuests.length === 0 && (
                <p className="muted small">No quests found for this zone.</p>
              )}
              <div className="results">
                {shownQuests.map((q) => (
                  <div className="result" key={q.wikiPath}>
                    <ItemLink title={q.title} className="name" />
                    {q.outOfEra && <span className="badge era-out">era</span>}
                    <button className="btn sm primary" onClick={() => void addByTitle(q.title, q.wikiPath)}>
                      + Add quest
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {loadingPage && <p className="muted" style={{ marginTop: 12 }}>Loading page…</p>}

      {nav.current && !loadingPage && !page && (
        <div className="page-detail">
          <div className="row">
            <button className="btn ghost sm" onClick={() => nav.back()}>
              ← Back
            </button>
            <span className="muted small">Couldn’t load “{nav.current}”.</span>
          </div>
        </div>
      )}

      {page && <WikiPageView page={page} />}
    </div>
  );
}

