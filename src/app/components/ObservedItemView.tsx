"use client";
import { api } from "@/lib/api";
import { useKnownItems } from "@/lib/hooks";
import { useNav } from "@/lib/nav";
import { count, dayTime } from "@/shared/format";
import { normalizeItemName } from "@/shared/grouping";
import ItemDrops from "./ItemDrops";
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
      </div>

      {!mine ? (
        <p className="muted small">
          Couldn&apos;t load “{title}” — eqlwiki returned no page for it, and nothing in your log
          has named it either.
        </p>
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
    </div>
  );
}

/** There is no wiki page, so there are no wiki claims — a stable identity, since it's a hook dep. */
const NO_WIKI_SOURCES: never[] = [];
