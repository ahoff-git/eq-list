"use client";
import { api } from "@/lib/api";
import { useNav } from "@/lib/nav";
import ItemLink from "./ItemLink";
import MobKills from "./MobKills";
import type { ItemSource, WikiPage } from "@/shared/types";

/**
 * A wiki page, read in the app: what it is, how to get it, and what it puts on your list.
 *
 * Its own component because **reading** a page is a different job from **finding** one, and it shows:
 * every kind of page lays out differently (a quest's turn-ins, a mob's loot, a recipe's components), it
 * carries the back/forward of the in-app history, and it owns the add-to-list buttons. Inline it was
 * 135 of SearchPanel's lines, below the search box it has nothing else to do with.
 *
 * Adding goes straight to `api()` rather than through a prop: the list is the main process's, so there
 * is nothing for a parent to mediate.
 */
export default function WikiPageView({ page }: { page: WikiPage }) {
  const nav = useNav();
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
      {/* The wiki's claims are above; this is what killing the thing actually taught us, and it's the
          one place on the page that can open a map (see `MobKills`). */}
      {page.kind === "mob" && <MobKills mob={page.title} />}
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
