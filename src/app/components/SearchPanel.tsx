"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/hooks";
import { useNav } from "@/lib/nav";
import ItemLink from "./ItemLink";
import { LOOKUP_HOTKEY } from "@/shared/constants";
import type { SearchResult, WikiPage, ItemSource } from "@/shared/types";

type Mode = "name" | "zone";

/**
 * Search eqlwiki two ways, both typo-tolerant (see shared/fuzzy.ts):
 *  - "Name": fuzzy-find any item / quest / recipe by name.
 *  - "By zone": fuzzy-pick a zone, then list the quests in it.
 * Opening a page lets you add an item, or "Add full quest" to queue all of a
 * quest's turn-ins grouped under the quest. The open page and every link within it
 * are driven by the shared in-app nav (`useNav`), so nothing jumps to the browser.
 */
export default function SearchPanel({ prefill }: { prefill?: { text: string; n: number } | null }) {
  const nav = useNav();
  const [mode, setMode] = useState<Mode>("name");

  // name mode
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);

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

  // Debounced name search.
  useEffect(() => {
    const a = api();
    if (mode !== "name" || !a || term.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        setResults(await a.wiki.search(term));
        setActive(0);
      } finally {
        setBusy(false);
      }
    }, 200);
    return () => clearTimeout(id);
  }, [term, mode]);

  // A screengrab lookup prefills the box (name mode) and its text searches normally.
  useEffect(() => {
    if (!prefill) return;
    setMode("name");
    nav.clear();
    setTerm(prefill.text);
  }, [prefill, nav]);

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
    if (mode !== "zone" || !a || zoneTerm.trim().length < 2 || zoneTerm === selectedZone) {
      setZoneSuggestions([]);
      return;
    }
    const id = setTimeout(async () => {
      setZoneSuggestions(await a.wiki.searchZones(zoneTerm));
    }, 200);
    return () => clearTimeout(id);
  }, [zoneTerm, mode, selectedZone]);

  function switchMode(m: Mode) {
    setMode(m);
    nav.clear();
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

  async function addFullQuestByTitle(title: string) {
    const a = api();
    if (!a) return;
    const p = await a.wiki.getPage(title);
    if (p) void a.list.addFromPage(p);
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

  const addItem = (p: WikiPage) => api()?.list.add({ name: p.title, wikiPath: p.wikiPath });
  const addFullPage = (p: WikiPage) => api()?.list.addFromPage(p);
  const addOne = (name: string, qty: number, wikiPath?: string) => api()?.list.add({ name, needed: qty, wikiPath });

  return (
    <div>
      <div className="segmented" style={{ marginBottom: 10 }}>
        <button className={`seg ${mode === "name" ? "active" : ""}`} onClick={() => switchMode("name")}>
          By name
        </button>
        <button className={`seg ${mode === "zone" ? "active" : ""}`} onClick={() => switchMode("zone")}>
          By zone
        </button>
      </div>
      <div className="row" style={{ marginBottom: 8, gap: 10 }}>
        <button className="btn sm" title={`Screengrab lookup — or press ${LOOKUP_HOTKEY.label}`} onClick={() => api()?.lookup.open()}>
          📷 Look up from screen
        </button>
        <span className="spacer" />
        <label className="row muted small" style={{ gap: 5 }}>
          <input
            type="checkbox"
            checked={hideEra}
            onChange={(e) => api()?.settings.update({ hideOutOfEra: e.target.checked })}
          />
          Hide out of era
        </label>
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
                <button className="btn sm primary" onClick={() => addOne(r.title, 1, r.wikiPath)}>
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
                    <button className="btn sm primary" onClick={() => void addFullQuestByTitle(q.title)}>
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

      {page && (
        <div className="page-detail">
          <div className="row">
            <button className="btn ghost sm" title="Back" onClick={() => nav.back()}>
              ←
            </button>
            {nav.canForward && (
              <button className="btn ghost sm" title="Forward" onClick={() => nav.forward()}>
                →
              </button>
            )}
            <h3>{page.title}</h3>
            <span className={`badge kind-${page.kind}`}>{page.kind}</span>
            {page.outOfEra && <span className="badge era-out">out of era</span>}
            <span className="spacer" />
            <button className="btn ghost sm" title="Open on eqlwiki" onClick={() => api()?.wiki.openInBrowser(page.wikiPath)}>
              ↗ eqlwiki
            </button>
          </div>

          {page.outOfEra && (
            <p className="era-warning small">
              ⚠ This is tagged out of era — it likely can’t be obtained on the current server yet.
            </p>
          )}

          <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
            {page.kind === "quest" && (
              <button className="btn primary sm" onClick={() => addFullPage(page)}>
                + Add full quest{page.components.length ? ` (${page.components.length} items)` : ""}
              </button>
            )}
            {page.kind === "mob" && page.components.length > 0 && (
              <button className="btn primary sm" onClick={() => addFullPage(page)}>
                + Add all {page.components.length} loot
              </button>
            )}
            {(page.kind === "item" || page.kind === "recipe" || page.kind === "page") && (
              <>
                <button className="btn primary sm" onClick={() => addItem(page)}>
                  + Add “{page.title}”
                </button>
                {page.components.length > 0 && (
                  <button className="btn sm" onClick={() => addFullPage(page)}>
                    + Add all {page.components.length} ingredients
                  </button>
                )}
              </>
            )}
          </div>

          {page.components.length > 0 && (
            <>
              <h4 className="muted small" style={{ marginTop: 12 }}>
                {page.kind === "quest" ? "Turn-in items" : page.kind === "mob" ? "Known loot" : "Ingredients"}
              </h4>
              <ul>
                {page.components.map((c) => (
                  <li key={c.name}>
                    <span>
                      {c.qty}× <ItemLink title={c.name} />
                    </span>
                    <button className="btn ghost sm" onClick={() => addOne(c.name, c.qty, c.wikiPath)}>
                      + Add
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {page.kind === "quest" && page.components.length === 0 && (
            <p className="muted small" style={{ marginTop: 12 }}>
              Couldn’t auto-detect turn-in items for this quest — add them manually from the search box.
            </p>
          )}
          {page.kind === "mob" && page.components.length === 0 && (
            <p className="muted small" style={{ marginTop: 12 }}>No known loot listed — open it on eqlwiki to check.</p>
          )}
          {page.kind === "zone" && (
            <p className="muted small" style={{ marginTop: 12 }}>Zone page — open it on eqlwiki to browse its contents.</p>
          )}

          {page.sources.length > 0 && <SourceList sources={page.sources} />}
          {page.rewards.length > 0 && (
            <>
              <h4 className="muted small" style={{ marginTop: 12 }}>Rewards</h4>
              <ul>
                {page.rewards.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SourceList({ sources }: { sources: ItemSource[] }) {
  return (
    <>
      <h4 className="muted small" style={{ marginTop: 12 }}>How to get it</h4>
      <ul>
        {sources.map((s, i) => (
          <li key={i}>
            <span className={`badge kind-${s.kind}`}>{s.kind}</span>
            <ItemLink title={s.where} />
            {s.detail && <span className="muted small">{s.detail}</span>}
          </li>
        ))}
      </ul>
    </>
  );
}
