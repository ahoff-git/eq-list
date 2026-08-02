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

  // Debounced name search. A `cancelled` flag drops a slower in-flight search when a newer
  // keystroke supersedes it, so stale results can't overwrite current ones (or reappear
  // after the box is cleared).
  useEffect(() => {
    const a = api();
    if (mode !== "name" || !a || term.trim().length < 2) {
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
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [term, mode]);

  // A screengrab lookup prefills the box (name mode) and its text searches normally.
  // Keyed on `prefill` only: it must fire once per lookup, NOT whenever `nav` changes
  // (that would re-paste the text and block navigation — nav.clear() is a one-shot here).
  useEffect(() => {
    if (!prefill) return;
    setMode("name");
    nav.clear();
    setTerm(prefill.text);
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

  const addItem = (p: WikiPage) => api()?.list.add({ name: p.title, wikiPath: p.wikiPath });
  const addFullPage = (p: WikiPage) => api()?.list.addFromPage(p);
  const addOne = (name: string, qty: number, wikiPath?: string) => api()?.list.add({ name, needed: qty, wikiPath });

  const BLANK_ZONE = /^(various|unknown|none|n\/a)$/i;
  // The mob's zone, for coordinate clicks (open the map there + drop a marker).
  const cardZone = (() => {
    for (const l of page?.card?.lines ?? []) {
      const m = l.match(/^(?:Zone|Spawn Zone):\s*(.+)$/i);
      if (m && !BLANK_ZONE.test(m[1].trim())) return m[1].trim();
    }
    return undefined;
  })();

  // Render a stat-card line: a Zone → map link; any embedded EQ coordinate → a map
  // link that opens the mob's zone and marks that spot; otherwise plain text.
  function cardLineNode(line: string): React.ReactNode {
    const zoneM = line.match(/^(Zone|Spawn Zone):\s*(.+)$/i);
    if (zoneM) {
      const z = zoneM[2].trim();
      if (BLANK_ZONE.test(z)) return line;
      return (
        <>
          {zoneM[1]}:{" "}
          <span className="link" title="View this zone on the map" onClick={() => api()?.map.openAt(z)}>
            {z}
          </span>
        </>
      );
    }
    if (cardZone) {
      const re = /\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
      const parts: React.ReactNode[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      let i = 0;
      while ((m = re.exec(line))) {
        if (m.index > last) parts.push(line.slice(last, m.index));
        const y = parseFloat(m[1]);
        const x = parseFloat(m[2]);
        const coord = m[0];
        parts.push(
          <span key={`c${i++}`} className="link" title="Show this spot on the map" onClick={() => api()?.map.openAt(cardZone, { y, x }, page?.title)}>
            {coord}
          </span>,
        );
        last = m.index + coord.length;
      }
      if (parts.length) {
        if (last < line.length) parts.push(line.slice(last));
        return <>{parts}</>;
      }
    }
    return line;
  }

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
            {/* Quests & recipes: the whole point is to pull turn-ins/ingredients in
                under their heading, so that's the primary action. A recipe also offers
                adding just the crafted item (e.g. when it's itself a quest turn-in). */}
            {(page.kind === "quest" || page.kind === "recipe") && (
              <>
                <button className="btn primary sm" onClick={() => addFullPage(page)}>
                  {page.kind === "quest"
                    ? `+ Add full quest${page.components.length ? ` (${page.components.length} items)` : ""}`
                    : `+ Add full recipe${page.components.length ? ` (${page.components.length} ingredients)` : ""}`}
                </button>
                {page.kind === "recipe" && (
                  <button className="btn sm" onClick={() => addItem(page)}>
                    + Add just “{page.title}”
                  </button>
                )}
              </>
            )}
            {page.kind === "mob" && page.components.length > 0 && (
              <button className="btn primary sm" onClick={() => addFullPage(page)}>
                + Add all {page.components.length} loot
              </button>
            )}
            {(page.kind === "item" || page.kind === "page" || page.kind === "spell") && (
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

          {page.card && (
            <div className="page-card">
              {page.card.icon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="pc-icon" src={page.card.icon} alt="" width={40} height={40} />
              )}
              <div className="pc-lines">
                {page.card.lines.map((l, i) => (
                  <div className="pc-line" key={i}>
                    {cardLineNode(l)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {page.components.length > 0 && (
            <>
              <h4 className="muted small" style={{ marginTop: 12 }}>
                {page.kind === "quest" ? "Turn-in items" : page.kind === "mob" ? "Known loot" : "Ingredients"}
              </h4>
              <ul>
                {page.components.map((c) => (
                  <li key={c.name}>
                    <span>
                      {c.qty > 1 ? `${c.qty}× ` : ""}
                      <ItemLink title={c.name} />
                      {c.dropRate && (
                        <span className="badge rarity" title="Drop rate">
                          {c.dropRate}
                        </span>
                      )}
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
          {page.kind === "spell" && (
            <p className="muted small" style={{ marginTop: 12 }}>
              Spell — add it to watch for it dropping, or open it on eqlwiki for how to acquire it.
            </p>
          )}

          {page.sources.length > 0 && <SourceList sources={page.sources} />}
          {page.rewards.length > 0 && (
            <>
              <h4 className="muted small" style={{ marginTop: 12 }}>Rewards</h4>
              <ul>
                {page.rewards.map((r, i) => (
                  <li key={i}>{r.item ? <ItemLink title={r.item} label={r.text} /> : r.text}</li>
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
