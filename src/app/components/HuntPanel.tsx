"use client";
import { useEffect, useMemo } from "react";
import {
  useShoppingList,
  useCurrentZone,
  useEntrySources,
  useSettings,
  useMobLoot,
  useMobKnowledge,
} from "@/lib/hooks";
import { bestRate, reconcileDrops } from "@/shared/drop-truth";
import { mobKey } from "@/shared/mob-stats";
import ItemLink from "./ItemLink";
import ZonePicker from "./ZonePicker";
import { api } from "@/lib/api";
import { buildHunt, neededEntries, huntInputsFor } from "@/shared/hunt";
import { zoneMatches, sourceZones } from "@/shared/sources";
import { distinct } from "@/shared/sorting";
import { CheckField, Empty } from "./ui";
import type { Zone } from "@/shared/map/types";

/** How many zones the picker offers unfiltered — the hunt's list is short, so show it all. */
const ZONE_MATCHES = 40;

/**
 * The Hunt tab answers "where do I go to farm what's left?" It takes every item
 * you still need, looks up who drops each (`useEntrySources`, cached), and inverts
 * that into zones → mobs → the needed items they drop (`buildHunt`). The zone
 * you're currently in (from the log) floats to the top. Items with no known drop are
 * called out separately. Names navigate within the app.
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
}: {
  pickedZone: string | null;
  onPickedZone: (zone: string | null) => void;
}) {
  const list = useShoppingList();
  const zone = useCurrentZone();
  const settings = useSettings();
  const followZone = settings?.overlay.followZone ?? false;
  const setFollowZone = (on: boolean) => api()?.settings.update({ overlay: { followZone: on } });
  // Effective filter: the log's zone when "follow" is on, else the manual pick (null = all zones).
  const narrow = followZone ? zone : pickedZone;

  const needed = useMemo(() => neededEntries(list.entries, list.questRuns), [list]);
  const { sources, loading } = useEntrySources(needed);

  // Full hunt (all zones) — drives the zone options and the "no drop source" list,
  // so both stay accurate no matter what the filter is set to.
  const allZones = useMemo(
    () => buildHunt(huntInputsFor(needed, sources, list.questRuns)),
    [needed, sources, list.questRuns],
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

  /** Ask the map to ring this mob's kills (null takes the ask back). */
  const emphasize = (mob: string | null) => api()?.map.emphasize(mob ? { mob } : null);
  // Leaving the tab fires no `mouseleave`, so without this the map stays lit with nothing
  // pointing at it — the same backstop the kill list has, for the one exit a row can't see.
  useEffect(() => () => void api()?.map.emphasize(null), []);

  // Only zones something on your list drops in — the picker is for narrowing this hunt, not for
  // browsing the world. Shaped as `Zone` because that's what `ZonePicker` matches over; there's no
  // map file behind a wiki zone name, so the name is also its key.
  const zoneOptions = useMemo<Zone[]>(() => {
    const byLower = new Map<string, string>();
    for (const e of needed) {
      for (const z of sourceZones(sources[e.name] ?? [])) {
        const k = z.toLowerCase();
        if (!byLower.has(k)) byLower.set(k, z);
      }
    }
    return [...byLower.values()].sort((a, b) => a.localeCompare(b)).map((name) => ({ name, key: name }));
  }, [needed, sources]);

  const zones = useMemo(() => {
    const filtered = narrow ? allZones.filter((z) => zoneMatches(narrow, z.zone)) : allZones;
    if (!zone) return filtered;
    // Float the current zone to the top without disturbing the rest of the order.
    return [...filtered].sort((a, b) => Number(zoneMatches(zone, b.zone)) - Number(zoneMatches(zone, a.zone)));
  }, [allZones, zone, narrow]);

  if (needed.length === 0) {
    return (
      <Empty title="Nothing left to hunt." hint="Everything on your list is complete — add more on the Search tab." />
    );
  }

  return (
    <div className="hunt">
      <div className="row" style={{ marginBottom: 12, gap: 10 }}>
        <p className="muted small" style={{ margin: 0 }}>
          Kill these to finish your list.
        </p>
        <span className="spacer" />
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
      </div>

      {loading && zones.length === 0 && <p className="muted">Looking up drop sources…</p>}

      {!loading && zones.length === 0 && narrow && (
        <p className="muted small">Nothing on your list drops in {narrow}.</p>
      )}
      {!loading && allZones.length === 0 && (
        <p className="muted small">None of your needed items have a known drop source.</p>
      )}

      {zones.map((z) => {
        const here = zone ? zoneMatches(zone, z.zone) : false;
        return (
          <div className={`hunt-zone ${here ? "here" : ""}`} key={z.zone}>
            <div className="hunt-zone-head">
              {/* A zone has a wiki page too, and "what else is in here" is the question a hunt
                  raises next — so its name opens like every other name in the app. */}
              <ItemLink title={z.zone} className="hz-name" />
              {here && <span className="badge kind-drop">you are here</span>}
            </div>
            {z.mobs.map((m) => {
              // `known` is keyed by mobKey (article/case-folded) so the wiki's
              // "a gnoll" meets the kill log's "gnoll".
              const mob = known[mobKey(m.mob)];
              return (
                <div
                  className="hunt-mob"
                  key={m.mob}
                  // The whole row is about this mob, items included, so it's all one target —
                  // there's nothing in it that would want to point somewhere else.
                  onMouseEnter={() => emphasize(m.mob)}
                  onMouseLeave={() => emphasize(null)}
                >
                  <ItemLink title={m.mob} className="hm-name" />
                  <span className="hm-items">
                    {m.items.map((it) => {
                      const [truth] = reconcileDrops(
                        { [it.item]: mobLoot[m.mob]?.[it.item] },
                        Object.fromEntries((mob?.drops ?? []).map((d) => [d.item, d.count])),
                        mob?.kills ?? 0,
                      );
                      const shown = bestRate(truth);
                      return (
                        <ItemLink
                          key={it.item}
                          title={it.item}
                          className="hunt-item"
                          label={
                            <>
                              {it.item} <span className="muted">{it.obtained}/{it.needed}</span>
                              {shown.source !== "none" && (
                                <span
                                  className={`badge rarity rate-${shown.source}`}
                                  title={rateWhy(truth, shown.source)}
                                >
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
                          }
                        />
                      );
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {!loading && noSource.length > 0 && (
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

/** Say which source a rate came from, and why that one is leading. */
function rateWhy(truth: ReturnType<typeof reconcileDrops>[number], source: "observed" | "wiki"): string {
  if (source === "observed") {
    return `Seen ${truth.seen} times in ${truth.kills} of your own kills${
      truth.wikiRate ? ` — the wiki says ${truth.wikiRate}` : " — the wiki doesn't list it at all"
    }.`;
  }
  return `The wiki's figure${
    truth.kills ? `, from an older build. You've killed it ${truth.kills} times so far` : ""
  } — your own kills take over once there are enough of them.`;
}
