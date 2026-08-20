"use client";
import { api } from "@/lib/api";
import { useKnownItems, useLucyCard, useSettings } from "@/lib/hooks";
import { useNav } from "@/lib/nav";
import { count, dayTime } from "@/shared/format";
import { normalizeItemName } from "@/shared/grouping";
import ItemDrops from "./ItemDrops";
import LucySays, { LucyLink } from "./LucySays";
import { AddButton } from "./ui";
import { addItem } from "@/lib/addToList";

/**
 * The page for an item **the wiki has never heard of** — built from your own log.
 *
 * Opening a search result used to have exactly two outcomes: the wiki's page, or "Couldn't load".
 * The second is the wrong answer for a thing sitting in your bags: this build drops items no
 * reference lists ([ADR 0025](../../../specs/decisions/0025-observation-over-the-wiki.md)), and a
 * player who has looted forty of one was being told, in effect, that it doesn't exist
 * ([ADR 0103](../../../specs/decisions/0103-search-can-answer-from-your-own-log.md)).
 *
 * So a title with no page still gets one, made of what we do know: how many you've held, who
 * dropped them and where (`ItemDrops`), and a button to put it on the list — which is the whole
 * reason you searched. Where we know nothing either, it says so and offers the wiki, because
 * "we've never seen this and neither has the wiki" is a real answer and a blank page is not.
 */
export default function ObservedItemView({ title }: { title: string }) {
  const nav = useNav();
  const key = normalizeItemName(title);
  const mine = useKnownItems().find((i) => normalizeItemName(i.item) === key);
  const lucy = useLucyCard(title);
  const askLucy = useSettings()?.askLucy ?? true;

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
        <h3>{title}</h3>
        {mine && (
          <span
            className="badge rate-observed"
            title="Your log knows this item and eqlwiki returned no page for it — it has none, or it couldn't be reached just now."
          >
            from your log
          </span>
        )}
        <span className="spacer" />
        <button
          className="btn ghost sm"
          title="Look for it on eqlwiki — there may be no page yet"
          onClick={() => api()?.wiki.openInBrowser(title)}
        >
          ↗ eqlwiki
        </button>
        {/* Beside it, and on this page especially: eqlwiki returned nothing, so its link leads to a page
            that isn't there. Lucy's may well be. */}
        <LucyLink target={lucy?.id ?? title} show={askLucy} />
      </div>

      {!mine ? (
        // With Lucy holding a card for it, "nothing knows this" is no longer true — and saying it
        // anyway, directly above that card, would be the app contradicting itself on one screen.
        lucy ? (
          <>
            <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
              <AddButton className="btn primary sm" onAdd={() => void addItem({ name: title })}>
                + Add “{title}”
              </AddButton>
            </div>
            <p className="muted small" style={{ marginTop: 8 }}>
              eqlwiki has no page for it and your log has never named it — so everything below is
              Lucy&apos;s, describing Live EverQuest rather than this build.
            </p>
          </>
        ) : (
          <p className="muted small">
            Couldn&apos;t load “{title}” — eqlwiki returned no page for it, and nothing in your log
            has named it either.
          </p>
        )
      ) : (
        <>
          <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
            <AddButton className="btn primary sm" onAdd={() => void addItem({ name: title })}>
              + Add “{title}”
            </AddButton>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            No page came back from eqlwiki, so everything below is your own log&apos;s —{" "}
            {count(mine.count, "sighting")}, the last on {dayTime(mine.lastAt)}.
          </p>
        </>
      )}

      {/* The evidence itself, and it renders nothing when there is none — a name the ledger holds
          but no kill was ever credited with has a sighting count above and nothing to show below. */}
      <ItemDrops item={title} sources={NO_WIKI_SOURCES} />

      {/* And below your own evidence, the third source: what Live EverQuest's database says the thing
          *is*. Cache-only, so opening this page costs Lucy nothing — it's populated by having found
          the item through search (ADR 0124). Last on the page on purpose: it is the least trusted
          thing on it. */}
      {lucy && <LucySays item={lucy} />}
    </div>
  );
}

/** There is no wiki page, so there are no wiki claims — a stable identity, since it's a hook dep. */
const NO_WIKI_SOURCES: never[] = [];
