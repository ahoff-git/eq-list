"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useKnownItems, useLucySearch, useSettings } from "@/lib/hooks";
import { useNav } from "@/lib/nav";
import ItemLink from "./ItemLink";
import { EraBadge } from "./LucySays";
import ObservedItemView from "./ObservedItemView";
import WikiPageView from "./WikiPageView";
import { AddButton, CheckField, segCls } from "./ui";
import { LOOKUP_HOTKEY } from "@/shared/constants";
import { addByTitle, addItem } from "@/lib/addToList";
import { searchKnownItems, unknownToTheWiki, type KnownItem } from "@/shared/known-items";
import { count } from "@/shared/format";
import type { LucyEra, LucySearchResult, SearchResult, WikiPage } from "@/shared/types";

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
 *
 * **A name search also reads your own log.** The wiki's index is missing a good deal of what this
 * build drops, and answering "no results" for an item in your bags is the one answer that's
 * certainly wrong — so anything you've held that the wiki can't match is offered beneath its
 * results and opens a page made of your own evidence
 * ([ADR 0103](../../../specs/decisions/0103-search-can-answer-from-your-own-log.md)). Ranked from
 * data already in hand, so it answers while the wiki lookup is still in flight.
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
  /**
   * Bumped by the page's ↻, so the open page is re-read after it has been re-fetched.
   *
   * A nonce rather than handing the fresh page straight back, because the effect below is already
   * the one place that decides what `page` is — two writers of it would be two ideas about which
   * answer is current.
   */
  const [pageNonce, setPageNonce] = useState(0);

  const settings = useSettings();
  const hideEra = settings?.hideOutOfEra ?? false;
  const keep = (list: SearchResult[]) => (hideEra ? list.filter((r) => !r.outOfEra) : list);
  const shownResults = keep(results);
  const shownQuests = keep(quests);

  // The query once typing has settled. Its own state because two things key on it and they must key
  // on the *same* thing: the wiki lookup below, and Lucy's — a source that ran a request per
  // keystroke would be exactly the traffic ADR 0124 exists to avoid.
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const settled = term.trim().length >= MIN_QUERY_CHARS ? term : "";
    if (!settled) {
      setDebounced("");
      return;
    }
    const id = setTimeout(() => setDebounced(settled), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [term]);

  // What *you* have held, ranked against the same query and stripped of anything the wiki already
  // answered. Computed here rather than fetched, so it needs no debounce: the vocabulary is already
  // in the renderer, and a local hit appears on the keystroke that names it.
  const known = useKnownItems();
  const mine = useMemo(
    () =>
      mode === "name" && term.trim().length >= MIN_QUERY_CHARS
        ? unknownToTheWiki(searchKnownItems(term, known), shownResults)
        : [],
    // `shownResults` is a fresh array each render; the results it's derived from are what change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, term, known, results, hideEra],
  );
  /**
   * Lucy, the third rung: asked **only** when neither the wiki nor your own log had anything, so an
   * item either of them knows never costs a request to someone else's site
   * ([ADR 0124](../../../specs/decisions/0124-lucy-is-a-second-opinion.md)). It answers after them,
   * since it needs the network and they don't.
   */
  const askLucy = (settings?.askLucy ?? true) && mode === "name" && !busy && !shownResults.length && !mine.length;
  const { hits: lucyHits, loading: lucyBusy } = useLucySearch(debounced, askLucy);
  // An out-of-era Lucy hit obeys the same toggle as the wiki's. `unknown` is *not* hidden: it means
  // "we couldn't tell", and hiding what you couldn't judge is how a filter starts lying.
  const shownLucy = hideEra ? lucyHits.filter((h) => h.era !== "out-of-era") : lucyHits;

  /** One keyboard list over every source — a hit is a hit, whichever record found it. */
  const navTitles = useMemo(
    () => [...shownResults.map((r) => r.title), ...mine.map((i) => i.item), ...shownLucy.map((h) => h.name)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [results, mine, shownLucy, hideEra],
  );

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
  // one-shot: we tell the owner it's been used and it drops it. This panel is unmounted whenever
  // another tab shows, and a prefill still sitting there would be re-applied on the next mount —
  // clicking an item name in the List / Hunt / Loot tabs jumps here, and would land on the old
  // lookup text instead of the clicked page. Keyed on `prefill` only, NOT on `nav` changing, for
  // the same reason. Closing whatever page was open isn't ours: the owner navigates to this tab's
  // own view to deliver the prefill, which *is* the page closing (ADR 0173).
  useEffect(() => {
    if (!prefill) return;
    setMode("name");
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
    // Re-fetch when the open page changes, or when its ↻ has just replaced it; `nav`'s other fields
    // are irrelevant here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.current, pageNonce]);

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

  // Searching another way is a different question, so an open page is not the answer to it any
  // more. It's left *behind* you rather than dropped, so back re-opens the page you were reading.
  function switchMode(m: Mode) {
    setMode(m);
    nav.closePage();
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

  /**
   * Open a Lucy hit: **fetch it, then navigate.**
   *
   * The fetch has to come first and has to be awaited, because the page it opens
   * (`ObservedItemView`) reads Lucy from the cache and never from the network — that is what keeps
   * every other page free of Lucy traffic (ADR 0124). This click is the one moment the user has asked
   * for a request, so this is where it is paid for.
   */
  async function openLucyItem(id: number, name: string) {
    const a = api();
    if (!a) return;
    setLoadingPage(true);
    try {
      await a.lucy.getItem(id);
    } finally {
      setLoadingPage(false);
    }
    openPage(name);
  }

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

  function onNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!navTitles.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(navTitles.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      // The wiki's rows and your log's open the same way — a title with no wiki page still has a page
      // here. A Lucy row is the exception: it has to be *fetched* before its page has anything on it.
      const lucyRow = shownLucy[active - shownResults.length - mine.length];
      if (lucyRow) void openLucyItem(lucyRow.id, lucyRow.name);
      else if (navTitles[active]) void openPage(navTitles[active]);
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
        <CheckField
          className="muted small"
          label="Ask Lucy"
          title="When neither eqlwiki nor your own log knows a name, look it up on lucy.allakhazam.com — Live EverQuest's item database. Far more items, a different game: cached, rate-limited, and flagged by era where it can be worked out."
          checked={settings?.askLucy ?? true}
          onChange={(ask) => void api()?.settings.update({ askLucy: ask })}
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
            {navTitles.length
              ? "↑↓ to navigate · Enter to open"
              : busy
                ? "Searching…"
                : lucyBusy
                  ? "Nothing on eqlwiki or in your log — asking Lucy…"
                  : ""}
          </p>
          <div className="results">
            {shownResults.map((r, i) => (
              <div className={`result ${i === active ? "active" : ""}`} key={r.wikiPath}>
                <ItemLink title={r.title} className="name" />
                {r.outOfEra && <span className="badge era-out">era</span>}
                <AddButton onAdd={() => void addByTitle(r.title, r.wikiPath)}>+ Add</AddButton>
              </div>
            ))}
          </div>
          {mine.length > 0 && <MyResults items={mine} active={active - shownResults.length} onOpen={openPage} />}
          {(shownLucy.length > 0 || lucyBusy) && (
            <LucyResults
              items={shownLucy}
              busy={lucyBusy}
              active={active - shownResults.length - mine.length}
              onOpen={openLucyItem}
            />
          )}
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
                    <AddButton onAdd={() => void addByTitle(q.title, q.wikiPath)}>+ Add quest</AddButton>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {loadingPage && <p className="muted" style={{ marginTop: 12 }}>Loading page…</p>}

      {/* No wiki page is not the end of the answer: the item may be one your log knows and the wiki
          doesn't, in which case this is its page (ADR 0103). */}
      {nav.current && !loadingPage && !page && <ObservedItemView title={nav.current} />}

      {page && <WikiPageView page={page} onRefreshed={() => setPageNonce((n) => n + 1)} />}
    </div>
  );
}

/**
 * The half of the answer that came from your own log — kept visually apart from the wiki's, and
 * headed by what it is, because a result the wiki has never heard of is a different kind of claim
 * and must not read as one of its pages.
 */
function MyResults({
  items,
  active,
  onOpen,
}: {
  items: KnownItem[];
  /** Index into *these* rows, or negative when the keyboard is up in the wiki's list. */
  active: number;
  onOpen: (title: string) => void;
}) {
  return (
    <>
      <h4 className="muted small" style={{ marginTop: 10 }}>
        From your own log · not on the wiki
      </h4>
      <div className="results">
        {items.map((it, i) => (
          <div className={`result ${i === active ? "active" : ""}`} key={it.item}>
            <span className="link name" title="Open what your log knows about it" onClick={() => onOpen(it.item)}>
              {it.item}
            </span>
            <span className="muted small" title={it.mobs.length ? `Dropped by ${it.mobs.join(", ")}` : "From your loot ledger"}>
              {count(it.count, "sighting")}
              {it.mobs.length ? ` · ${count(it.mobs.length, "mob")}` : ""}
            </span>
            <AddButton onAdd={() => void addItem({ name: it.item })}>+ Add</AddButton>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * The last resort: names Live EverQuest's database has and neither eqlwiki nor your log does.
 *
 * Its own heading, and a blunt one, for the same reason `MyResults` has one — a row from a *different
 * game* is a different kind of claim and must not read as one of the wiki's pages
 * ([ADR 0124](../../../specs/decisions/0124-lucy-is-a-second-opinion.md)). The era badge is the other
 * half of that: Lucy knows twenty-five years of expansions, and most of what it can offer for an
 * arbitrary name cannot be obtained here at all.
 *
 * No `+ Add` button, deliberately. Everything else in this panel can add on sight, because everything
 * else is either the wiki's or your own. Adding straight off a Lucy row would put an item on a
 * shopping list on the strength of a source that hasn't yet been asked whether the thing exists in
 * this era — so the row opens instead, and the page it opens has the button.
 */
function LucyResults({
  items,
  busy,
  active,
  onOpen,
}: {
  items: LucySearchResult[];
  busy: boolean;
  /** Index into *these* rows, or negative when the keyboard is up in an earlier list. */
  active: number;
  onOpen: (id: number, name: string) => void;
}) {
  return (
    <>
      <h4 className="muted small" style={{ marginTop: 10 }}>
        From Lucy · Live EverQuest, not this build
      </h4>
      {busy && !items.length && <p className="muted small">Asking lucy.allakhazam.com…</p>}
      <div className="results">
        {items.map((it, i) => (
          <div className={`result ${i === active ? "active" : ""}`} key={it.id}>
            <span
              className="link name"
              title="Fetch it from Lucy and open what it says — Live EverQuest's data, not this build's"
              onClick={() => onOpen(it.id, it.name)}
            >
              {it.name}
            </span>
            {it.type && <span className="muted small">{it.type}</span>}
            <EraBadge era={it.era} why={eraHint(it.era)} />
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Why a search row's era badge says what it does.
 *
 * A row's own `eraWhy` needs the item's zones, which the results list hasn't got — so these explain
 * the *state* instead, including why "unknown" is the usual one. Better than a bare badge nobody can
 * interpret, and honest about what hasn't been checked yet.
 */
function eraHint(era: LucyEra): string {
  switch (era) {
    case "in-era":
      return "Lucy places this in a zone this server runs — from a page already fetched.";
    case "out-of-era":
      return "Every zone Lucy places this in is one this server doesn't run — from a page already fetched.";
    default:
      return "Not judged yet: Lucy's results list carries no zones, so opening it is what settles the era.";
  }
}
