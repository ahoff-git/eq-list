"use client";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useShoppingList,
  useCurrentZone,
  useEntrySources,
  useSettings,
  useMobLoot,
  useMobKnowledge,
  useHuntTargets,
} from "@/lib/hooks";
import { bestRate, reconcileDrops, type DropTruth, type ShownRate } from "@/shared/drop-truth";
import { mobKey } from "@/shared/mob-stats";
import ItemLink from "./ItemLink";
import ZonePicker from "./ZonePicker";
import { api } from "@/lib/api";
import { ringMob } from "@/lib/showOnMap";
import {
  bestPlacesFirst,
  buildHunt,
  huntByItem,
  huntHasWork,
  huntInputsFor,
  huntTargetPlaces,
  huntZoneOptions,
  neededEntries,
  type HuntPlace,
  type HuntZone,
} from "@/shared/hunt";
import { zoneMatches } from "@/shared/sources";
import { distinct } from "@/shared/sorting";
import { zoneLevelText, zoneLevelWhy, zoneLevels } from "@/shared/zones/levels";
import { CheckField, Empty, segCls } from "./ui";
import type { Zone } from "@/shared/map/types";

/** How many zones the picker offers unfiltered — the hunt's list is short, so show it all. */
const ZONE_MATCHES = 40;

/** Which question the page is answering. See `huntByItem` for why both exist. */
export type HuntGrouping = "zone" | "item";

/** One mob's claim on one item, as both sources see it, ready to draw. */
interface RatedPlace extends HuntPlace {
  truth: DropTruth;
  shown: ShownRate;
  /** `shown.value`, hoisted because it's what `bestPlacesFirst` orders on. */
  rate?: number;
}

interface RatedItemGroup {
  item: string;
  needed: number;
  obtained: number;
  places: RatedPlace[];
}

/** What both views need to reconcile a mob's loot: the wiki's list against your own kills. */
type TruthFor = (mob: string, item: string) => DropTruth;

/**
 * The Hunt tab answers "where do I go to farm what's left?" It takes every item
 * you still need, looks up who drops each (`useEntrySources`, cached), and inverts
 * that into zones → mobs → the needed items they drop (`buildHunt`). The zone
 * you're currently in (from the log) floats to the top. Items with no known drop are
 * called out separately. Names navigate within the app.
 *
 * **Two ways round, because a hunt is two questions.** *By zone* is "I'm going to Lower Guk — what
 * does that get me?"; *by item* is "I need this thing — where is it likeliest to drop?", which the
 * zone view can only answer by being read four times and compared by eye. Same built hunt, inverted
 * (`huntByItem`), so every rule `buildHunt` applies holds in both
 * ([ADR 0125](../../../specs/decisions/0125-a-hunt-is-two-questions.md)).
 *
 * **The filter follows the grouping**, in one control rather than two: a zone picker while grouped by
 * zone, and a search over the things on your list while grouped by item. Narrowing to a zone is
 * meaningless in a view whose entire answer is *which zone*, so by item deliberately looks
 * everywhere — the pick that would contradict it is the pick that isn't offered.
 *
 * The zone control is the map's: a type-to-find `ZonePicker` plus a **follow** checkbox,
 * so choosing a zone and tracking the one you're in are both one gesture away rather than
 * one of them being a trip to Settings. Follow is still the `overlay.followZone` setting —
 * one source of truth, so the Settings toggle and this checkbox can't disagree. The picked
 * zone is owned by the parent so it survives tab switches, and it survives turning follow
 * on and off again too: coming back to the zone you were studying is the useful answer.
 *
 * **Pointing at a mob picks its kills out on the map** (`map.emphasize`), exactly as hovering a row
 * in the map's own ☠ list does. The hunt says what to kill; the map says where you found it last
 * time, which is the next question and the one this list can't answer. It's a hint, not a command:
 * it never opens the map, and with the map closed or looking elsewhere nothing happens.
 */
export default function HuntPanel({
  pickedZone,
  onPickedZone,
  grouping,
  onGrouping,
}: {
  pickedZone: string | null;
  onPickedZone: (zone: string | null) => void;
  grouping: HuntGrouping;
  onGrouping: (grouping: HuntGrouping) => void;
}) {
  const list = useShoppingList();
  const zone = useCurrentZone();
  const settings = useSettings();
  const followZone = settings?.overlay.followZone ?? false;
  const setFollowZone = (on: boolean) => api()?.settings.update({ overlay: { followZone: on } });
  // Effective filter: the log's zone when "follow" is on, else the manual pick (null = all zones).
  const narrow = followZone ? zone : pickedZone;
  /**
   * The by-item view's own filter: one thing on your list, or all of them.
   *
   * Held here rather than by the parent, unlike the zone pick — a zone filter persists because you
   * stay in a zone for an hour, while "where does this one thing drop" is a question you ask, read
   * the answer to, and are done with. It also can't strand you: an item you finish leaves the list,
   * and a filter that outlived it would show an empty page on the next visit.
   */
  const [pickedItem, setPickedItem] = useState<string | null>(null);

  const needed = useMemo(() => neededEntries(list.entries, list.questRuns), [list]);
  const { sources, loading } = useEntrySources(needed);
  // Mobs you put on the list to kill for their own sake, placed by where you've actually killed
  // them — the wiki gives a mob page no sources, so this is the only honest answer available.
  const targets = useHuntTargets(list.entries);

  // Full hunt (all zones) — drives the zone options and the "no drop source" list,
  // so both stay accurate no matter what the filter is set to.
  const allZones = useMemo(
    () => buildHunt(huntInputsFor(needed, sources, list.questRuns), targets),
    [needed, sources, list.questRuns, targets],
  );
  const covered = new Set(allZones.flatMap((z) => z.mobs.flatMap((m) => m.items.map((i) => i.item))));
  const noSource = needed.filter((e) => !covered.has(e.name));

  // Drop rates come from each mob's loot page (the item's "Drops From" has none).
  const mobNames = useMemo(() => distinct(allZones.flatMap((z) => z.mobs.map((m) => m.mob))), [allZones]);
  const mobLoot = useMobLoot(mobNames);
  // The wiki describes an older, since-modified game, so its rates are a starting point. Our
  // own kills are this build — they take over once there are enough of them, and either way
  // the badge says which you're reading (see `drop-truth.ts`).
  const known = useMobKnowledge(mobNames.join("|"));

  /**
   * What one mob's page and your own kills between them say about one item.
   *
   * Both views need it — the by-zone one to badge a drop, the by-item one to *order* by it — so it's
   * one function rather than two copies of the same reconciliation, which could otherwise sort by a
   * different figure than the badge beside it shows.
   */
  const truthFor = useCallback<TruthFor>(
    (mob, item) => {
      // `known` is keyed by mobKey (article/case-folded) so the wiki's "a gnoll" meets the kill
      // log's "gnoll".
      const seen = known[mobKey(mob)];
      const [truth] = reconcileDrops(
        { [item]: mobLoot[mob]?.[item] },
        Object.fromEntries((seen?.drops ?? []).map((d) => [d.item, d.count])),
        seen?.kills ?? 0,
      );
      return truth;
    },
    [known, mobLoot],
  );

  /** Ask the map to ring this mob's kills (null takes the ask back). */
  /** Ring a mob's kills on an already-open map — the shared gesture (`showOnMap.ts`). */
  const emphasize = ringMob;
  // Leaving the tab fires no `mouseleave`, so without this the map stays lit with nothing
  // pointing at it — the same backstop the kill list has, for the one exit a row can't see.
  useEffect(() => () => ringMob(null), []);

  // Only zones something on your list drops in — the picker is for narrowing this hunt, not for
  // browsing the world. Shaped as `Zone` because that's what `ZonePicker` matches over; there's no
  // map file behind a wiki zone name, so the name is also its key.
  const zoneOptions = useMemo<Zone[]>(
    // Shaped as `Zone` because that's what `ZonePicker` matches over; there's no map file behind a
    // wiki zone name, so the name is also its key.
    () => huntZoneOptions(needed, sources, targets).map((name) => ({ name, key: name })),
    [needed, sources, targets],
  );

  const zones = useMemo(() => {
    const filtered = narrow ? allZones.filter((z) => zoneMatches(narrow, z.zone)) : allZones;
    if (!zone) return filtered;
    // Float the current zone to the top without disturbing the rest of the order.
    return [...filtered].sort((a, b) => Number(zoneMatches(zone, b.zone)) - Number(zoneMatches(zone, a.zone)));
  }, [allZones, zone, narrow]);

  // The item view is the same zones inverted, with each place priced and then sorted by that price —
  // which is the whole point of the view, so it happens here rather than being left to the markup.
  //
  // Built from **every** zone rather than the narrowed ones: this view answers "where in the world
  // is this likeliest to drop", and a zone filter is the one thing that can't be part of that answer
  // — which is why the control the zone filter lives in becomes the item filter here.
  const itemGroups = useMemo<RatedItemGroup[]>(
    () =>
      huntByItem(allZones).map((group) => ({
        ...group,
        places: bestPlacesFirst(
          group.places.map((place): RatedPlace => {
            const truth = truthFor(place.mob, group.item);
            const shown = bestRate(truth);
            return { ...place, truth, shown, rate: shown.value };
          }),
        ),
      })),
    [allZones, truthFor],
  );
  // Named mobs have no item to be grouped under, so they'd vanish from a by-item page (ADR 0098).
  const targetPlaces = useMemo(() => huntTargetPlaces(allZones), [allZones]);

  // What the picker offers while grouped by item: the things on the page, shaped as the picker
  // matches over — a name is a name, and the interaction is the one the zone filter already had.
  const itemOptions = useMemo<Zone[]>(
    () => itemGroups.map((g) => ({ name: g.item, key: g.item })),
    [itemGroups],
  );
  const shownItems = pickedItem ? itemGroups.filter((g) => g.item === pickedItem) : itemGroups;

  if (!huntHasWork(needed, targets)) {
    return (
      <Empty title="Nothing left to hunt." hint="Everything on your list is complete — add more on the Search tab." />
    );
  }

  return (
    <div className="hunt">
      <div className="row wrap" style={{ marginBottom: 12, gap: 10 }}>
        <div className="segmented">
          <button
            className={segCls(grouping === "zone")}
            title="Group by zone — what a trip there gets you"
            onClick={() => onGrouping("zone")}
          >
            By zone
          </button>
          <button
            className={segCls(grouping === "item")}
            title="Group by item — where each one is likeliest to drop, best rate first"
            onClick={() => onGrouping("item")}
          >
            By item
          </button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {grouping === "zone" ? "Kill these to finish your list." : "Best place to farm each one, anywhere."}
        </p>
        <span className="spacer" />
        {/* One control, filtering by whatever the page is grouped by: narrowing to a zone is
            meaningless in a view whose whole answer is *which* zone, and an item filter is
            meaningless in one that lists a zone's mobs. So it's a swap, not a second box —
            there is only so much room in this row, and a filter that doesn't apply is worse
            than no filter at all. */}
        {grouping === "zone" ? (
          <>
            <ZonePicker
              zones={zoneOptions}
              limit={ZONE_MATCHES}
              // While following, the box shows the zone that's actually filtering — leaving it blank
              // would mark "All zones" as the live choice, which is the one thing it isn't.
              value={followZone ? (zone ?? "") : (pickedZone ?? "")}
              blankLabel="All zones"
              placeholder={followZone ? "📍 no zone yet" : "All zones"}
              // Naming a zone is the opposite of following one, so it takes over rather than being
              // silently overridden by wherever you happen to be standing.
              onPick={(name) => {
                if (followZone) setFollowZone(false);
                onPickedZone(name);
              }}
            />
            <CheckField
              className="follow-toggle"
              label="follow"
              checked={followZone}
              onChange={(on) => void setFollowZone(on)}
              title="Narrow to the zone you're in, and move with you (the same Settings toggle)"
            />
          </>
        ) : (
          <ZonePicker
            zones={itemOptions}
            limit={ZONE_MATCHES}
            noun="item"
            value={pickedItem ?? ""}
            blankLabel="All items"
            placeholder="All items"
            onPick={setPickedItem}
          />
        )}
      </div>

      {loading && allZones.length === 0 && <p className="muted">Looking up drop sources…</p>}

      {!loading && grouping === "zone" && zones.length === 0 && narrow && (
        <p className="muted small">Nothing on your list drops in {narrow}.</p>
      )}
      {/* The picker only offers items that are on the page, so this is the one that got finished
          (or filtered away by a list edit) while its name was still in the box. */}
      {!loading && grouping === "item" && pickedItem && shownItems.length === 0 && (
        <p className="muted small">Nothing left to farm for {pickedItem}.</p>
      )}
      {!loading && allZones.length === 0 && (
        <p className="muted small">None of your needed items have a known drop source.</p>
      )}

      {grouping === "zone" ? (
        <ZoneGroups zones={zones} here={zone} truthFor={truthFor} emphasize={emphasize} />
      ) : (
        <ItemGroups
          groups={shownItems}
          // Asked about one item, the mobs you're hunting for their own sake aren't an answer.
          targets={pickedItem ? [] : targetPlaces}
          here={zone}
          emphasize={emphasize}
        />
      )}

      {/* Also an answer about the whole list rather than about the one item asked for. */}
      {!loading && !(grouping === "item" && pickedItem) && noSource.length > 0 && (
        <div className="hunt-nosource">
          <h4 className="muted small">No known drop source ({noSource.length})</h4>
          <p className="muted small">
            {noSource.map((e) => e.name).join(", ")} — likely from a vendor, quest, or recipe. Open them to see how.
          </p>
        </div>
      )}
    </div>
  );
}

/** Zones → mobs → the needed items they drop: what a trip somewhere gets you. */
function ZoneGroups({
  zones,
  here,
  truthFor,
  emphasize,
}: {
  zones: HuntZone[];
  here: string | null;
  truthFor: TruthFor;
  emphasize: (mob: string | null) => void;
}) {
  return (
    <>
      {zones.map((z) => {
        const youAreHere = here ? zoneMatches(here, z.zone) : false;
        return (
          <div className={`hunt-zone ${youAreHere ? "here" : ""}`} key={z.zone}>
            <div className="hunt-zone-head">
              <ZoneName zone={z.zone} here={youAreHere} />
            </div>
            {z.mobs.map((m) => (
              <div
                className="hunt-mob"
                key={m.mob}
                // The whole row is about this mob, items included, so it's all one target —
                // there's nothing in it that would want to point somewhere else.
                onMouseEnter={() => emphasize(m.mob)}
                onMouseLeave={() => emphasize(null)}
              >
                <ItemLink title={m.mob} className="hm-name" />
                {/* Says why this row is here at all: a target was asked for by name, and may
                    have no items under it whatsoever. */}
                {m.target && <TargetFlag />}
                <span className="hm-items">
                  {m.items.map((it) => {
                    const truth = truthFor(m.mob, it.item);
                    return (
                      <ItemLink
                        key={it.item}
                        title={it.item}
                        className="hunt-item"
                        label={
                          <>
                            {it.item} <span className="muted">{it.obtained}/{it.needed}</span>
                            <Rate truth={truth} />
                          </>
                        }
                      />
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

/**
 * Items → everywhere they drop, best rate first: where to farm one thing.
 *
 * The rate leads each row because it is what the rows are sorted by — a list ordered by a number
 * that isn't the first thing you read is a list you have to take on trust.
 */
function ItemGroups({
  groups,
  targets,
  here,
  emphasize,
}: {
  groups: RatedItemGroup[];
  targets: HuntPlace[];
  here: string | null;
  emphasize: (mob: string | null) => void;
}) {
  return (
    <>
      {groups.map((g) => (
        <div className="hunt-item-group" key={g.item}>
          <div className="hunt-item-head">
            <ItemLink title={g.item} className="hi-name" />
            <span className="muted small">
              {g.obtained}/{g.needed}
            </span>
          </div>
          {g.places.map((p) => (
            <PlaceRow key={`${p.zone}|${p.mob}`} place={p} here={here} emphasize={emphasize}>
              <Rate truth={p.truth} shown={p.shown} always />
            </PlaceRow>
          ))}
        </div>
      ))}

      {targets.length > 0 && (
        <div className="hunt-item-group">
          <div className="hunt-item-head">
            <span className="hi-name">On your list to kill</span>
          </div>
          {targets.map((p) => (
            <PlaceRow key={`${p.zone}|${p.mob}`} place={p} here={here} emphasize={emphasize} />
          ))}
        </div>
      )}
    </>
  );
}

/** One mob, in one zone — the row the by-item view is made of. */
function PlaceRow({
  place,
  here,
  emphasize,
  children,
}: {
  place: HuntPlace;
  here: string | null;
  emphasize: (mob: string | null) => void;
  children?: ReactNode;
}) {
  const youAreHere = here ? zoneMatches(here, place.zone) : false;
  return (
    <div
      className={`hunt-place ${youAreHere ? "here" : ""}`}
      onMouseEnter={() => emphasize(place.mob)}
      onMouseLeave={() => emphasize(null)}
    >
      {children}
      <ItemLink title={place.mob} className="hm-name" />
      <span className="hp-in muted">in</span>
      <ZoneName zone={place.zone} here={youAreHere} />
      {place.target && <TargetFlag />}
    </div>
  );
}

/**
 * A zone, as both views write it: its name, what level the wiki says it is, and whether you're
 * standing in it. One component so a zone can't read one way in the header and another in a row.
 */
function ZoneName({ zone, here }: { zone: string; here: boolean }) {
  // What you're walking into, from the zone's own wiki page — the question "go here" raises and the
  // list itself can't answer. Absent for the cities, which state no monster levels.
  const levels = zoneLevels(zone);
  return (
    <>
      {/* A zone has a wiki page too, and "what else is in here" is the question a hunt raises
          next — so its name opens like every other name in the app. */}
      <ItemLink title={zone} className="hz-name" />
      {levels && (
        <span className="hz-levels" title={zoneLevelWhy(levels, zone)}>
          lv {zoneLevelText(levels)}
        </span>
      )}
      {here && <span className="badge kind-drop">you are here</span>}
    </>
  );
}

/** A mob you asked for by name, rather than one that happens to drop something. */
function TargetFlag() {
  return (
    <span className="hm-target" title="On your list — you want to kill this one">
      on your list
    </span>
  );
}

/**
 * The drop rate, and what to make of it.
 *
 * `always` is for the by-item view, where the rate is the column everything is sorted by: a row that
 * simply omitted it would read as "no chance" rather than "nobody has measured this", and would sit
 * in the list at a position it never explains.
 */
function Rate({ truth, shown = bestRate(truth), always = false }: { truth: DropTruth; shown?: ShownRate; always?: boolean }) {
  return (
    <>
      {shown.source === "none" ? (
        always && (
          <span className="badge rarity rate-none" title="Neither the wiki nor your own kills have a rate for this yet.">
            —
          </span>
        )
      ) : (
        <span className={`badge rarity rate-${shown.source}`} title={rateWhy(truth, shown.source)}>
          {shown.text}
          {shown.source === "observed" ? "✓" : ""}
        </span>
      )}
      {truth.suspicious && (
        <span
          className="badge era-out"
          title={`The wiki lists this, but ${truth.kills} kills haven't produced one. The wiki describes an older build — treat the claim with suspicion.`}
        >
          unseen in {truth.kills}
        </span>
      )}
    </>
  );
}

/** Say which source a rate came from, and why that one is leading. */
function rateWhy(truth: DropTruth, source: "observed" | "wiki"): string {
  if (source === "observed") {
    return `Seen ${truth.seen} times in ${truth.kills} of your own kills${
      truth.wikiRate ? ` — the wiki says ${truth.wikiRate}` : " — the wiki doesn't list it at all"
    }.`;
  }
  return `The wiki's figure${
    truth.kills ? `, from an older build. You've killed it ${truth.kills} times so far` : ""
  } — your own kills take over once there are enough of them.`;
}
