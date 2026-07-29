"use client";
import { useMemo } from "react";
import {
  useShoppingList,
  useCurrentZone,
  useEntrySources,
  useSettings,
  useMobLoot,
  useMobKnowledge,
} from "@/lib/hooks";
import { bestRate, reconcileDrops } from "@/shared/drop-truth";
import ItemLink from "./ItemLink";
import { buildHunt, neededEntries, huntInputsFor } from "@/shared/hunt";
import { zoneMatches, sourceZones } from "@/shared/sources";

/**
 * The Hunt tab answers "where do I go to farm what's left?" It takes every item
 * you still need, looks up who drops each (`useEntrySources`, cached), and inverts
 * that into zones → mobs → the needed items they drop (`buildHunt`). The zone
 * you're currently in (from the log) floats to the top. A zone filter (incl. the
 * "follow your zone" setting) narrows to one zone; the picked zone is owned by the
 * parent so it survives tab switches. Items with no known drop are called out
 * separately. Names navigate within the app.
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
  // Effective filter: the log's zone when "follow" is on, else the manual pick.
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
  const mobNames = useMemo(() => [...new Set(allZones.flatMap((z) => z.mobs.map((m) => m.mob)))], [allZones]);
  const mobLoot = useMobLoot(mobNames);
  // The wiki describes an older, since-modified game, so its rates are a starting point. Our
  // own kills are this build — they take over once there are enough of them, and either way
  // the badge says which you're reading (see `drop-truth.ts`).
  const known = useMobKnowledge(mobNames.join("|"));

  const zoneOptions = useMemo(() => {
    const byLower = new Map<string, string>();
    for (const e of needed) {
      for (const z of sourceZones(sources[e.name] ?? [])) {
        const k = z.toLowerCase();
        if (!byLower.has(k)) byLower.set(k, z);
      }
    }
    return [...byLower.values()].sort((a, b) => a.localeCompare(b));
  }, [needed, sources]);

  const zones = useMemo(() => {
    const filtered = narrow ? allZones.filter((z) => zoneMatches(narrow, z.zone)) : allZones;
    if (!zone) return filtered;
    // Float the current zone to the top without disturbing the rest of the order.
    return [...filtered].sort((a, b) => Number(zoneMatches(zone, b.zone)) - Number(zoneMatches(zone, a.zone)));
  }, [allZones, zone, narrow]);

  if (needed.length === 0) {
    return (
      <div className="empty">
        <p>Nothing left to hunt.</p>
        <p className="small">Everything on your list is complete — add more on the Search tab.</p>
      </div>
    );
  }

  return (
    <div className="hunt">
      <div className="row" style={{ marginBottom: 12, gap: 10 }}>
        <p className="muted small" style={{ margin: 0 }}>
          Kill these to finish your list.
        </p>
        <span className="spacer" />
        {followZone ? (
          <span className="muted small" title="Following your current zone (change in Settings)">
            📍 {zone ?? "no zone"} only
          </span>
        ) : (
          <select
            className="field"
            style={{ width: "auto" }}
            value={pickedZone ?? ""}
            onChange={(e) => onPickedZone(e.target.value || null)}
            title="Show only what's obtainable in a zone"
          >
            <option value="">All zones</option>
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        )}
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
              <span className="hz-name">{z.zone}</span>
              {here && <span className="badge kind-drop">you are here</span>}
            </div>
            {z.mobs.map((m) => (
              <div className="hunt-mob" key={m.mob}>
                <ItemLink title={m.mob} className="hm-name" />
                <span className="hm-items">
                  {m.items.map((it) => {
                    const mob = known[m.mob];
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
            ))}
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
