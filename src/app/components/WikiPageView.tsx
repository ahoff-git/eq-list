"use client";
import { api } from "@/lib/api";
import { useLucyCard, useSettings } from "@/lib/hooks";
import { useNav } from "@/lib/nav";
import ItemDrops from "./ItemDrops";
import ItemLink from "./ItemLink";
import LucySays, { LucyLink } from "./LucySays";
import MapLink, { ZoneLink } from "./MapLink";
import MobKills from "./MobKills";
import { AddButton } from "./ui";
import { addItem, addPage, addPageItself } from "@/lib/addToList";
import { wikiAddAction } from "@/shared/wiki-add";
import type { ItemSource, WikiPage } from "@/shared/types";
import { cardZone, statesNothing } from "@/shared/map/mob-place";

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
  // Which buttons this page gets. The rule lives in `wiki-add.ts` because the search results list
  // adds by the same one, and the two had drifted — see that file.
  const add = wikiAddAction(page);
  // What each button does — and what it *says* it did — is `lib/addToList.ts`: the kind travels with
  // a `self` add (a mob is a thing to *kill*), and every add answers back with a toast naming the new
  // total needed, since the list it changes is on another tab.
  const addOne = (name: string, qty: number, wikiPath?: string) => void addItem({ name, needed: qty, wikiPath });
  // Read for any page naming a thing you can hold, and **cache-only** — opening a wiki page must not
  // put traffic on someone else's site. Read even when the block below won't show it, because the
  // ↗ Lucy link is a better link when it has an id than when it has only a name.
  const isThing = page.kind !== "mob" && page.kind !== "zone" && page.kind !== "spell";
  const lucy = useLucyCard(isThing ? page.title : null);
  const askLucy = useSettings()?.askLucy ?? true;

  // The mob's zone, for coordinate clicks (open the map there + drop a marker). Read by the rule the
  // map reads it with (`cardZone`), since the map now places a hunted mob from this same card and
  // two readings of one line is how they would start disagreeing about whether "Various" is a place.
  const zoneOfCard = cardZone(page?.card?.lines);

  // On a mob's page, every position on the card is a position *of that mob* — so the map can bring
  // its kills up alongside the marker, the same as the observed positions below (ADR 0104).
  const cardFocus = page.kind === "mob" ? { mob: page.title } : undefined;

  // Render a stat-card line: a Zone → map link; any embedded EQ coordinate → a map
  // link that opens the mob's zone and marks that spot; otherwise plain text.
  function cardLineNode(line: string): React.ReactNode {
    const zoneM = line.match(/^(Zone|Spawn Zone):\s*(.+)$/i);
    if (zoneM) {
      const z = zoneM[2].trim();
      if (statesNothing(z)) return line;
      return (
        <>
          {zoneM[1]}: <ZoneLink zone={z} focus={cardFocus} />
        </>
      );
    }
    if (zoneOfCard) {
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
          <MapLink key={`c${i++}`} target={{ zone: zoneOfCard, loc: { y, x }, label: page?.title, focus: cardFocus }}>
            {coord}
          </MapLink>,
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
        {/* Beside it, the second opinion — by Lucy's id when this page's item has been fetched, and by
            name when it hasn't, so the offer doesn't depend on having asked first. Not for a mob, zone
            or spell: Lucy is an item database. */}
        {isThing && <LucyLink target={lucy?.id ?? page.title} show={askLucy} />}
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
        {add === "components" && (page.kind === "quest" || page.kind === "recipe") && (
          <>
            <AddButton className="btn primary sm" onAdd={() => void addPage(page)}>
              {page.kind === "quest"
                ? `+ Add full quest${page.components.length ? ` (${page.components.length} items)` : ""}`
                : `+ Add full recipe${page.components.length ? ` (${page.components.length} ingredients)` : ""}`}
            </AddButton>
            {page.kind === "recipe" && (
              <AddButton className="btn sm" onAdd={() => void addPageItself(page)}>
                + Add just “{page.title}”
              </AddButton>
            )}
          </>
        )}
        {/* A mob is `self` too, and the secondary button is deliberately not offered to it: a mob
            page keeps its **loot** in `components`, so it read "+ Add all 12 ingredients" — and since
            `addFromPage` now files a mob as a mob, pressing it added the named again rather than
            anything it drops. Adding a whole loot table was the behaviour `wiki-add.ts` removed. */}
        {add === "self" && (
          <>
            <AddButton className="btn primary sm" onAdd={() => void addPageItself(page)}>
              + Add “{page.title}”
            </AddButton>
            {page.kind !== "mob" && page.components.length > 0 && (
              <AddButton className="btn sm" onAdd={() => void addPage(page)}>
                + Add all {page.components.length} ingredients
              </AddButton>
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
                <AddButton className="btn ghost sm" onAdd={() => addOne(c.name, c.qty, c.wikiPath)}>
                  + Add
                </AddButton>
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
      {/* The wiki's claims are above; this is what killing things actually taught us about the item
          itself — who drops it, where, and what it sells for. Offered to every page that names a
          *thing you can hold* (a spell page is its scroll, and scrolls drop): a mob's own evidence is
          `MobKills` above, and a zone isn't loot. It renders nothing when nothing is known. */}
      {page.kind !== "mob" && page.kind !== "zone" && <ItemDrops item={page.title} sources={page.sources} />}
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

      {/* The Lucy *block*, but only for a **stub**: an item page eqlwiki has without a stat card, which
          is a page that can't tell you what slot the thing goes in or who can wear it. Where the wiki
          does have a card, its card is the answer and a second one from a later game would be noise —
          the whole point of a third-rung source is that it fills gaps rather than competing
          (ADR 0124). The ↗ Lucy link in the header is offered either way: a link is an offer, where a
          block is an answer. */}
      {lucy && !page.card && <LucySays item={lucy} />}
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
