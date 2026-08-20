"use client";
import { api } from "@/lib/api";
import { count, countOf } from "@/shared/format";
import { placeableReading } from "@/shared/lucy-era";
import { groupDropsByZone, otherSources } from "@/shared/sources";
import { ZoneLink } from "./MapLink";
import type { LucyEra, LucyItem } from "@/shared/types";

/**
 * **What Lucy says about an item**, kept visibly apart from what this game's own wiki says.
 *
 * Lucy is Live EverQuest's item database — the app's third and least trusted source, read only where
 * eqlwiki is silent ([ADR 0124](../../../specs/decisions/0124-lucy-is-a-second-opinion.md)). It knows
 * roughly every item EverQuest ever shipped, which is precisely why it must never be mistaken for a
 * statement about *this* build: the game it describes is twenty-five years and a dozen expansions
 * further on, and a stat card from it is a strong hint about what an item *is* and no claim at all
 * about where you'll find it here.
 *
 * So everything here is under one heading that names the source, every block says whose claim it is,
 * and the era verdict shows its working — because that verdict is **derived** (from the zones, see
 * `lucy-era.ts`) rather than read off the page, and a derived judgement that can't be checked is one
 * a player has no reason to believe.
 */
export default function LucySays({ item }: { item: LucyItem }) {
  const zoneDrops = groupDropsByZone(item.sources);
  const others = otherSources(item.sources);
  const shown = zoneDrops.reduce((n, z) => n + z.mobs.length, 0) + others.length;

  return (
    <section className="lucy-says">
      <h4 className="muted small lucy-head">
        From Lucy · Live EverQuest, not this build
        <EraBadge era={item.era} why={item.eraWhy} />
        <span className="spacer" />
        <LucyLink target={item.id} />
      </h4>

      {item.card && (
        <div className="page-card">
          {item.card.icon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="pc-icon" src={item.card.icon} alt="" width={40} height={40} />
          )}
          <div className="pc-lines">
            {item.card.lines.map((l, i) => (
              <div className="pc-line" key={i}>
                {l}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deliberately not `ItemDrops`: that component reconciles wiki claims with your own kills
          (ADR 0025), and folding a third game's loot table into that arithmetic would put Live
          EverQuest's drop lists into a rate measured on this server. These are quotes, not evidence. */}
      {zoneDrops.length > 0 && (
        <>
          <p className="muted small lucy-note">
            Lucy has it dropping in {count(zoneDrops.length, "zone")} —{" "}
            {item.era === "out-of-era" ? "none of which this server runs" : "the ones this server runs first"}.
          </p>
          <ul className="lucy-list">
            {zoneDrops.map((z) => (
              <li key={z.zone}>
                <LucyZone zone={z.zone} />
                <span className="muted small"> — {z.mobs.join(", ")}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {others.length > 0 && (
        <>
          <p className="muted small lucy-note">Lucy also has it sold or given by:</p>
          <ul className="lucy-list">
            {others.map((s) => (
              <li key={`${s.kind}|${s.where}`}>
                <span className={`badge kind-${s.kind}`}>{s.kind}</span> {s.where}
                {s.detail && <span className="muted small"> — {s.detail}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* A capped list that didn't say so would read as "these are all of them" (see SOURCE_CAP). */}
      {item.sourceRows > shown && (
        <p className="muted small lucy-note">
          Showing {countOf(shown, item.sourceRows, "source")} — Lucy lists a great many for common
          items, and the ones you could reach are kept.
        </p>
      )}

      {item.sourceRows === 0 && (
        <p className="muted small lucy-note">
          Lucy names no mob or merchant for it, so it says nothing about where to get one.
        </p>
      )}
    </section>
  );
}

/**
 * **↗ Lucy** — the same button wherever an item is named, sitting beside the ↗ eqlwiki one.
 *
 * Every item gets one, because the case it exists for is the item eqlwiki has *nothing* on: there, the
 * eqlwiki link leads to a page that doesn't exist and this one leads to an answer. Pass Lucy's `id`
 * when a page has been fetched (an exact link) and the item's **name** when it hasn't — the name goes
 * to Lucy's search, which redirects to the item when the name matches one. So the link needs no
 * lookup, and this app makes no request to put it on screen; the browser does the asking.
 *
 * **Items only.** A mob, a zone or a quest gets no button: Lucy is an *item* database, its own NPC
 * links lead off to Allakhazam proper, and a link that reliably lands on "0 found" is worse than none.
 *
 * `show` is the `askLucy` setting, and it is a **prop rather than a hook** because this renders once
 * per shopping-list row: `useSettings` costs an IPC read and a listener per instance, so a forty-item
 * list would pay forty of each to learn one flag, and re-render all forty when any setting changed.
 * Whoever is already watching settings passes it down. Default `true` is for `LucySays`, which cannot
 * be on screen with Lucy switched off — its item comes from an IPC call that answers `null` when it is.
 *
 * Hidden rather than disabled when off. A browser link isn't this app talking to anyone, so the switch
 * arguably doesn't cover it — but a user who turned Lucy off and then met Lucy buttons on every row
 * would read the switch as broken, and that is the one thing a setting must never look like.
 */
export function LucyLink({
  target,
  label = "↗ Lucy",
  show = true,
}: {
  target: number | string;
  label?: string;
  show?: boolean;
}) {
  if (!show) return null;
  const known = typeof target === "number";
  return (
    <button
      className="btn ghost sm"
      title={
        known
          ? "Open this item on lucy.allakhazam.com — Live EverQuest's database, not this build"
          : "Look this item up on lucy.allakhazam.com — Live EverQuest's database, not this build. It may not exist there, or not under this name"
      }
      onClick={(ev) => {
        // The list's rows are clickable themselves, and this button sits inside one.
        ev.stopPropagation();
        void api()?.lucy.openInBrowser(target);
      }}
    >
      {label}
    </button>
  );
}

/**
 * One of Lucy's zone names — a **map link only when we can place it**.
 *
 * A zone we can't place has no map here and, usually, isn't a zone this server runs at all, so
 * offering a link would open a window with nothing in it. The name is still shown, since it is the
 * evidence behind the era badge. Where we can place it, the link uses **our** name for the zone:
 * `Ruins of Old Paineel 2.0 (The Hole)` has no map and `The Hole` does.
 */
function LucyZone({ zone }: { zone: string }) {
  const ours = placeableReading(zone);
  if (!ours) return <span title="Not a zone this server runs, as far as the gazetteer knows">{zone}</span>;
  return <ZoneLink zone={ours}>{zone}</ZoneLink>;
}

/**
 * The era verdict, with its reasoning in the hover.
 *
 * "Era unknown" gets a badge of its own rather than being left blank, because the blank would read as
 * "in era" — and for a source that describes a much later game, silence in that direction is the one
 * misreading worth spending a badge to prevent.
 */
export function EraBadge({ era, why }: { era: LucyEra; why: string }) {
  if (era === "in-era") return <span className="badge era-ok" title={why}>in era?</span>;
  if (era === "out-of-era") return <span className="badge era-out" title={why}>out of era</span>;
  return (
    <span className="badge era-unknown" title={why}>
      era ?
    </span>
  );
}
