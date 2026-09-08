"use client";
import { api } from "@/lib/api";
import { useClosedZones, useLucyCard, useSettings } from "@/lib/hooks";
import ItemDrops from "./ItemDrops";
import ItemLink from "./ItemLink";
import LucySays, { LucyLink } from "./LucySays";
import RefreshPage from "./RefreshPage";
import MapLink, { ZoneLink } from "./MapLink";
import MobKills from "./MobKills";
import { AddButton } from "./ui";
import { addItem, addPage, addPageItself } from "@/lib/addToList";
import { factionRaiseNote, wikiAddAction } from "@/shared/wiki-add";
import { sourcesByEra } from "@/shared/item-era";
import { countOf } from "@/shared/format";
import type { FactionSide, ItemSource, WikiPage, WikiSubQuest } from "@/shared/types";
import { buildFactionWatch, isFactionWatched } from "@/shared/faction-watch";
import { cardZone, statesNothing } from "@/shared/map/mob-place";

/**
 * A wiki page, read in the app: what it is, how to get it, and what it puts on your list.
 *
 * Its own component because **reading** a page is a different job from **finding** one, and it shows:
 * every kind of page lays out differently (a quest's turn-ins, a mob's loot, a recipe's components) and
 * it owns the add-to-list buttons. Inline it was 135 of SearchPanel's lines, below the search box it
 * has nothing else to do with. Getting *away* from it is the window's job, not this one's: the trail
 * crosses tabs, so back and forward live in the shell's `NavBar` (ADR 0173).
 *
 * Adding goes straight to `api()` rather than through a prop: the list is the main process's, so there
 * is nothing for a parent to mediate.
 */
export default function WikiPageView({ page, onRefreshed }: { page: WikiPage; onRefreshed?: () => void }) {
  // Which buttons this page gets. The rule lives in `wiki-add.ts` because the search results list
  // adds by the same one, and the two had drifted — see that file.
  const add = wikiAddAction(page);
  // A "gear-set" bundle (ADR 0197): one giver/zone offering several independently turned-in armor
  // pieces off this one page. Rendered as its own list of sections below, in place of the flat
  // turn-ins/rewards every other quest gets — the flat `page.components`/`page.rewards` (the union,
  // still read by the bulk "+ Add full quest" button above) stay exactly as they were.
  const bundle = page.kind === "quest" ? page.subQuests : undefined;
  // What each button does — and what it *says* it did — is `lib/addToList.ts`: the kind travels with
  // a `self` add (a mob is a thing to *kill*), and every add answers back with a toast naming the new
  // total needed, since the list it changes is on another tab.
  const addOne = (name: string, qty: number, wikiPath?: string) => void addItem({ name, needed: qty, wikiPath });
  // Read for any page naming a thing you can hold, and **cache-only** — opening a wiki page must not
  // put traffic on someone else's site. Read even when the block below won't show it, because the
  // ↗ Lucy link is a better link when it has an id than when it has only a name.
  const isThing = page.kind !== "mob" && page.kind !== "zone" && page.kind !== "spell" && page.kind !== "faction";
  const lucy = useLucyCard(isThing ? page.title : null);
  const settings = useSettings();
  const askLucy = settings?.askLucy ?? true;
  // A faction page's own "alert me" toggle — reuses the existing raw-line watch mechanism
  // (ADR 0050) rather than a bespoke alert path, scoped to this faction by name so it only ever
  // fires on this one's standing changing. See the `buildFactionWatch` doc for the wording caveat.
  const factionWatches = settings?.castAlerts.watches ?? [];
  const factionWatched = page.kind === "faction" && isFactionWatched(factionWatches, page.title);

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
        <h3>{page.title}</h3>
        <span className={`badge kind-${page.kind}`}>{page.kind}</span>
        {page.outOfEra && <span className="badge era-out">out of era</span>}
        <span className="spacer" />
        {/* How old this copy is, and the way to replace it. Before the ↗ links, because it is about
            *this* page rather than about somewhere else to read it. */}
        <RefreshPage title={page.title} fetchedAt={page.fetchedAt} onRefreshed={onRefreshed} />
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
        {/* A faction is a group of mobs to go kill, not a thing to obtain — its own action rather
            than the generic self/components buttons above, which `wikiAddAction` returns "none" for. */}
        {page.kind === "faction" && (page.raise?.mobs.length ?? 0) > 0 && (
          <AddButton className="btn primary sm" onAdd={() => void addPage(page)}>
            + Track all {page.raise!.mobs.length} raise mobs
          </AddButton>
        )}
        {page.kind === "faction" && (
          <button
            className="btn sm"
            disabled={factionWatched}
            title="Add a log watch: a banner whenever a line mentions this faction's standing"
            onClick={() => void api()?.settings.update({ castAlerts: { watches: [...factionWatches, buildFactionWatch(page.title)] } })}
          >
            {factionWatched ? "🔔 Alerted" : "🔔 Alert me on standing changes"}
          </button>
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

      {bundle && bundle.length > 0 ? (
        <QuestBundleSections subQuests={bundle} page={page} addOne={addOne} />
      ) : (
        <>
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
        </>
      )}
      {page.kind === "mob" && page.components.length === 0 && (
        <p className="muted small" style={{ marginTop: 12 }}>No known loot listed — open it on eqlwiki to check.</p>
      )}
      {/* The wiki's claims are above; this is what killing the thing actually taught us, and it's the
          one place on the page that can open a map (see `MobKills`). `components` travels too, so a
          "Copy for wiki" button can say what the page doesn't already know without a second fetch. */}
      {page.kind === "mob" && <MobKills mob={page.title} components={page.components} />}
      {page.kind === "zone" && (
        <p className="muted small" style={{ marginTop: 12 }}>Zone page — open it on eqlwiki to browse its contents.</p>
      )}
      {page.kind === "spell" && (
        <p className="muted small" style={{ marginTop: 12 }}>
          Spell — add it to watch for it dropping, or open it on eqlwiki for how to acquire it.
        </p>
      )}
      {page.kind === "faction" && page.raise && page.lower && <FactionSides title={page.title} raise={page.raise} lower={page.lower} />}

      {page.sources.length > 0 && <SourceList sources={page.sources} />}
      {/* The wiki's claims are above; this is what killing things actually taught us about the item
          itself — who drops it, where, and what it sells for. Offered to every page that names a
          *thing you can hold* (a spell page is its scroll, and scrolls drop): a mob's own evidence is
          `MobKills` above, and a zone isn't loot. It renders nothing when nothing is known. */}
      {page.kind !== "mob" && page.kind !== "zone" && page.kind !== "faction" && (
        <ItemDrops item={page.title} sources={page.sources} />
      )}
      {!bundle && page.rewards.length > 0 && (
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

/**
 * A "gear-set" bundle page's own quests, one section each — the split ADR 0197 describes: one giver
 * shared above, several armor pieces each turned in on their own. Each section gets its own "+ Add
 * full quest" (built from the sub-quest alone, so it lands on the shopping list under *its own* name
 * rather than the whole page's — the same `addPage`/`origin.name` pairing a plain quest uses) and its
 * own per-item "+ Add", reusing `addOne` from the parent rather than a second copy of that wiring.
 */
function QuestBundleSections({
  subQuests,
  page,
  addOne,
}: {
  subQuests: WikiSubQuest[];
  page: WikiPage;
  addOne: (name: string, qty: number, wikiPath?: string) => void;
}) {
  return (
    <>
      {subQuests.map((q) => {
        const subPage: WikiPage = {
          kind: "quest",
          title: q.title,
          wikiPath: q.wikiPath,
          sources: q.sources,
          components: q.components,
          rewards: q.rewards,
          card: page.card,
          fetchedAt: page.fetchedAt,
        };
        return (
          <div key={q.title} className="page-card" style={{ marginTop: 12 }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <h4 className="small" style={{ margin: 0 }}>
                <ItemLink title={q.title} />
              </h4>
              <span className="spacer" />
              <AddButton className="btn primary sm" onAdd={() => void addPage(subPage)}>
                + Add full quest{q.components.length ? ` (${q.components.length} items)` : ""}
              </AddButton>
            </div>
            {q.components.length > 0 ? (
              <ul>
                {q.components.map((c) => (
                  <li key={c.name}>
                    <span>
                      {c.qty > 1 ? `${c.qty}× ` : ""}
                      <ItemLink title={c.name} />
                    </span>
                    <AddButton className="btn ghost sm" onAdd={() => addOne(c.name, c.qty, c.wikiPath)}>
                      + Add
                    </AddButton>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Couldn’t auto-detect turn-in items for this one — add them manually.</p>
            )}
            {q.rewards.length > 0 && (
              <p className="muted small">
                Reward:{" "}
                {q.rewards.map((r, i) => (
                  <span key={i}>
                    {i > 0 && ", "}
                    {r.item ? <ItemLink title={r.item} label={r.text} /> : r.text}
                  </span>
                ))}
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * A faction page's two halves — what raises it, what lowers it — each broken into the zones it's
 * tied to, the quests that move it, and the mobs to kill for it. No point values: the wiki names
 * only direction, never amount ([ADR 0192](../../../specs/decisions/0192-factions-ride-their-own-wiki-pages.md)).
 * Track buttons are offered on the raise side only — the lower side is informational (avoid killing
 * these), which is also why "+ Track all" above only ever bulk-adds `raise` mobs.
 */
function FactionSides({ title, raise, lower }: { title: string; raise: FactionSide; lower: FactionSide }) {
  return (
    <div className="row wrap" style={{ marginTop: 12, gap: 24, alignItems: "flex-start" }}>
      <FactionSideColumn title={title} label="Raises" side={raise} trackable />
      <FactionSideColumn title={title} label="Lowers" side={lower} trackable={false} />
    </div>
  );
}

function FactionSideColumn({
  title,
  label,
  side,
  trackable,
}: {
  title: string;
  label: string;
  side: FactionSide;
  trackable: boolean;
}) {
  if (!side.zones.length && !side.quests.length && !side.mobs.length) return null;
  return (
    <div style={{ minWidth: 220, flex: "1 1 260px" }}>
      <h4 className="muted small">{label}</h4>
      <FactionList heading="Zones" items={side.zones} keyOf={(z) => z} render={(z) => <ZoneLink zone={z} />} />
      <FactionList
        heading={`Quests (${side.quests.length})`}
        items={side.quests}
        keyOf={(q) => q}
        render={(q) => <ItemLink title={q} />}
      />
      <FactionList
        heading={`Mobs (${side.mobs.length})`}
        items={side.mobs}
        keyOf={(m) => m.name}
        render={(m) => (
          <>
            <ItemLink title={m.name} />
            {m.note && <span className="muted small">{m.note}</span>}
            {trackable && (
              <AddButton
                className="btn ghost sm"
                onAdd={() =>
                  void addItem({ name: m.name, kind: "mob", note: factionRaiseNote(title), origin: { kind: "faction", name: title } })
                }
              >
                + Track
              </AddButton>
            )}
          </>
        )}
      />
    </div>
  );
}

/**
 * One of `FactionSideColumn`'s sub-lists — the "if there's anything, put a heading over it" shape
 * every one of Zones/Quests/Mobs shares, differing only in what each row renders. Nothing here
 * knows *why* a heading names a count and another doesn't ("Zones" vs "Quests (N)") or what the
 * mob row's track button needs — that stays in the caller's `render`, so this only ever owns the
 * wrapper.
 */
function FactionList<T>({
  heading,
  items,
  keyOf,
  render,
}: {
  heading: string;
  items: T[];
  keyOf: (item: T) => string;
  render: (item: T) => React.ReactNode;
}) {
  if (!items.length) return null;
  return (
    <>
      <h5 className="muted small">{heading}</h5>
      <ul>
        {items.map((item) => (
          <li key={keyOf(item)}>{render(item)}</li>
        ))}
      </ul>
    </>
  );
}

/**
 * **Where you can go and get it** — the wiki's sources, read against the era the server is running.
 *
 * The wiki's drop table is a table about *EverQuest*, so it names every zone an item has ever come
 * from: McVaxius` Horn of War lists five dragons and, on a server that hasn't opened Kunark, four
 * of them are places you cannot reach. Printed flat that is one answer and four dead ends, told apart
 * only by knowing your expansions — so the reachable ones lead and the rest say why they aren't
 * ([item-era](../../shared/item-era.ts)).
 *
 * Marked, never hidden. An unreachable source is still the truth about the item and still the thing to
 * plan around when the era opens; and the era list is a live read, so an empty one must show a page
 * that is merely unannotated rather than a page missing rows.
 */
function SourceList({ sources }: { sources: ItemSource[] }) {
  const closed = useClosedZones();
  const reach = sourcesByEra(sources, closed);
  const open = reach.filter((r) => !r.shut).length;
  const noneOpen = open === 0 && reach.length > 0;

  return (
    <>
      <h4 className="muted small" style={{ marginTop: 12 }}>How to get it</h4>
      {open < reach.length && (
        <p className={noneOpen ? "era-warning small" : "muted small"}>
          {noneOpen
            ? "⚠ None of these are reachable yet — every zone the wiki names is one this server hasn’t opened."
            : `${countOf(open, reach.length, "source")} reachable this era — the rest are marked.`}
        </p>
      )}
      <ul>
        {reach.map(({ source: s, shut, why }, i) => (
          <li key={i} className={shut ? "out-of-era" : undefined}>
            <span className={`badge kind-${s.kind}`}>{s.kind}</span>
            <ItemLink title={s.where} />
            {s.detail && <span className="muted small">{s.detail}</span>}
            {shut && (
              <span className="badge era-out" title={why}>
                {shut === "future" ? "not on this server" : "out of era"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
