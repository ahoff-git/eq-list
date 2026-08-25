"use client";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { clock, count } from "@/shared/format";
import { confidenceTier } from "@/shared/kill-confidence";
import { mobChoices, type KillFilters } from "@/shared/kill-filters";
import ItemLink, { NameList } from "./ItemLink";
import { Caret } from "./ui";
import KillFilterBar from "./KillFilterBar";
import { ZoneDifficultyTag } from "./ZoneTag";
import type { KillEmphasis, KillRecord } from "@/shared/types";

/** How many mob groups to show before the "show more" fold. Distinct mobs per zone are few. */
const MAX_GROUPS = 40;

/** Distinct drops to name in a group's header before summarising the rest as "+N". */
const MAX_HEAD_DROPS = 6;

/**
 * The kills behind the heatmap, with the same confidence marker the map draws — so a faint
 * dot on the map and its row here tell the same story. Filters are lifted to the parent
 * because the map is filtered by the same object.
 *
 * Kills are grouped by mob: one row per mob you can open, rather than a row per kill, so
 * killing the same thing 300 times reads as "grikbar kobold ×300" and not 300 identical lines.
 *
 * **Hovering a row lights its kills up on the map** (`onEmphasize`) — a mob's row lights all of
 * them, an individual kill lights just that one. The list says what died; the map says where, and
 * pointing at a name is the natural way to ask "where were those?".
 *
 * **Peers' kills are in here too**, in the same groups as your own, marked with who shared them. They
 * used to go straight to the canvas and appear in no list at all, which meant the map had markers
 * nothing on screen explained and every filter applied to only half of them. A mob dying somewhere is
 * evidence of where it spawns whoever saw it — so it's one list, with `shared` in the filters for when
 * you want only what you saw yourself.
 *
 * The filter bar is **one row whose shape doesn't change**: every control is always there, including the
 * shared toggle, so nothing reflows when a peer connects and starts sharing. It used to wrap onto a
 * second line and eat the map.
 *
 * **The zone is the window's, the difficulty is the row's.** This list is already one camp — the map's
 * title names it — so a zone per row would repeat it forty times. What a row can add is which *copy*
 * of the camp it was recorded in, which the list otherwise flattens: a kill at difficulty 3 and one at
 * difficulty 0 are the same place and not the same evidence
 * ([ADR 0136](../../../specs/decisions/0136-logged-data-says-where-it-happened.md)).
 */
export default function KillList({
  kills,
  filters,
  onFilters,
  showConfidence,
  onEmphasize,
}: {
  kills: KillRecord[];
  filters: KillFilters;
  onFilters: (next: KillFilters) => void;
  showConfidence: boolean;
  onEmphasize?: (emphasis: KillEmphasis | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // One openable entry per mob (newest first), so 300 kills of the same thing read as a single
  // row with a count — not a wall of identical names. The map still plots every individual kill.
  const groups = useMemo(() => groupByMob(kills), [kills]);
  const shownGroups = expanded ? groups : groups.slice(0, MAX_GROUPS);
  // The mobs actually present, so the filter offers real choices rather than a free-text box —
  // each carrying whether it has ever dropped anything, which is what the "dropped" box needs to
  // know before it hides one.
  const mobs = useMemo(() => mobChoices(kills), [kills]);
  const shared = useMemo(() => kills.filter((k) => k.sharedBy).length, [kills]);

  return (
    // Leaving the list clears the emphasis outright. The rows hand it back and forth between a mob
    // and one of its kills, so without a backstop here, walking the cursor out of a kill row would
    // leave that mob lit up on the map for good.
    <div className="kill-list no-drag" onMouseLeave={() => onEmphasize?.(null)}>
      <KillFilterBar
        icon="☠"
        what="kills"
        toggledBy="shows and hides this list"
        filters={filters}
        onFilters={onFilters}
        mobs={mobs}
        tally={
          <>
            {count(groups.length, "mob")} · {count(kills.length, "kill")}
            {shared > 0 && <span title={`${shared} of them shared by other players`}> · {shared} shared</span>}
          </>
        }
      />

      {kills.length === 0 ? (
        <p className="muted small">
          No kills match. Kills are recorded as they happen, and placed using your last{" "}
          <kbd>/loc</kbd> — so the more often you send one, the better the map gets.
        </p>
      ) : (
        <div className="kill-rows">
          {shownGroups.map((g) => (
            <MobGroup key={g.mob} group={g} showConfidence={showConfidence} onEmphasize={onEmphasize} />
          ))}
          {!expanded && groups.length > shownGroups.length && (
            <button className="btn ghost sm" onClick={() => setExpanded(true)}>
              show {groups.length - shownGroups.length} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface MobGroupData {
  mob: string;
  /** This mob's kills, newest first. */
  kills: KillRecord[];
}

/** Bucket kills by mob, keeping newest-first order both between groups and within each. */
function groupByMob(kills: KillRecord[]): MobGroupData[] {
  const byMob = new Map<string, KillRecord[]>();
  for (const kill of kills) {
    const list = byMob.get(kill.mob);
    if (list) list.push(kill);
    else byMob.set(kill.mob, [kill]); // first sighting is the newest, so groups stay newest-first
  }
  return [...byMob.entries()].map(([mob, ks]) => ({ mob, kills: ks }));
}

/** Distinct items a group dropped, most-dropped first, with how many times each was seen. */
function summarizeDrops(kills: KillRecord[]): { item: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const kill of kills) {
    for (const item of kill.drops ?? []) counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([item, count]) => ({ item, count }))
    .sort((a, b) => b.count - a.count);
}

/** One mob's kills as a single openable row: a count and drop summary, expanding to each kill. */
function MobGroup({
  group,
  showConfidence,
  onEmphasize,
}: {
  group: MobGroupData;
  showConfidence: boolean;
  /**
   * Required-but-nullable rather than optional, deliberately. As an optional prop it was simply
   * never passed here, and because every call site is `onEmphasize?.(…)` nothing failed — it just
   * meant hovering a row lit nothing up, silently, for the whole feature. Demanding the prop makes
   * forgetting it a compile error; the parent's own prop stays optional, as its callers' choice.
   */
  onEmphasize: ((emphasis: KillEmphasis | null) => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  // A shared kill carries no time, so it can't claim to be the newest — the heading shows the newest
  // one that *has* a time, and falls back to nothing rather than to a dash-shaped lie.
  const newest = group.kills.find((k) => k.at) ?? group.kills[0];
  const drops = useMemo(() => summarizeDrops(group.kills), [group.kills]);
  const shared = group.kills.filter((k) => k.sharedBy).length;
  // Someone else's kill *in your own log* — a bystander got the blow. Counted apart from a peer's,
  // because the two are different facts: one you watched, the other you were told.
  const others = group.kills.filter((k) => k.mine === false && !k.sharedBy).length;
  const headDrops = drops.slice(0, MAX_HEAD_DROPS);

  return (
    <div className={`kill-group ${open ? "open" : ""}`}>
      <div
        className="kill-group-head"
        onClick={() => setOpen((o) => !o)}
        // Hovering the mob picks out every one of its kills on the map.
        onMouseEnter={() => onEmphasize?.({ mobs: [group.mob] })}
        onMouseLeave={() => onEmphasize?.(null)}
      >
        <Caret open={open} />
        {/* The mob's name is a link like any other name in the app — clicking it looks the mob up
            rather than opening the row, which is what the caret and the rest of the head are for. */}
        <ItemLink title={group.mob} className="kr-mob" />
        <span className="kg-count muted small">×{group.kills.length}</span>
        {others > 0 && (
          <span
            className="muted small"
            title={`${others} killed by someone else in earshot — still evidence the mob is here, but not counted in your drop rates.`}
          >
            {others} by others
          </span>
        )}
        {shared > 0 && (
          <span
            className="muted small"
            title={`${shared} shared by other players. Evidence of where this spawns; no evidence about what it drops for you.`}
          >
            {shared} shared
          </span>
        )}
        <span className="spacer" />
        {headDrops.length > 0 && (
          <span className="kr-drops">
            <NameList
              names={headDrops.map((d) => d.item)}
              extra={(_, i) => headDrops[i].count > 1 && <span className="muted small"> ×{headDrops[i].count}</span>}
            />
            {drops.length > headDrops.length && (
              <span className="muted small"> +{drops.length - headDrops.length}</span>
            )}
          </span>
        )}
        <span className="kr-time">{clock(newest.at)}</span>
      </div>
      {open && (
        <div className="kill-rows kg-rows">
          {group.kills.map((kill) => (
            <KillRow key={kill.id} kill={kill} showConfidence={showConfidence} onEmphasize={onEmphasize} />
          ))}
        </div>
      )}
    </div>
  );
}

function KillRow({
  kill,
  showConfidence,
  onEmphasize,
}: {
  kill: KillRecord;
  showConfidence: boolean;
  /** Demanded, not optional — see `MobGroup`. */
  onEmphasize: ((emphasis: KillEmphasis | null) => void) | undefined;
}) {
  const tier = confidenceTier(kill.confidence);

  return (
    <div
      className="kill-row"
      // One kill, so the map points at exactly where this one died. The group's own hover fires
      // again on the way out, which is why leaving sends null rather than the group.
      onMouseEnter={() => onEmphasize?.({ id: kill.id })}
      onMouseLeave={() => onEmphasize?.({ mobs: [kill.mob] })}
    >
      <span className="kr-time">{clock(kill.at)}</span>
      {showConfidence && <ConfidenceMark kill={kill} />}
      <ItemLink title={kill.mob} className="kr-mob" />
      {kill.sharedBy ? (
        <span
          className="muted small"
          title={`Shared by ${kill.sharedBy}. Their position, from their own /loc — evidence of where this spawns, and none about what it drops for you.`}
        >
          from {kill.sharedBy}
        </span>
      ) : (
        kill.mine === false && (
          <span
            className="muted small"
            title={`${kill.killer} killed this, not you. It still says the mob is here, but it doesn't count towards your drop rates — you never had the corpse.`}
          >
            by {kill.killer}
          </span>
        )
      )}
      {kill.drops?.length ? (
        <NameList names={kill.drops} className="kr-drops" />
      ) : (
        <span className="muted small" title={kill.sharedBy ? "A peer shares the kill, not the loot" : undefined}>
          {kill.sharedBy ? "—" : "no drop"}
        </span>
      )}
      <span className="spacer" />
      {/* Nothing at all for an ordinary zone: a blank here would read as a value we failed to record,
          where in fact there is nothing to say. */}
      <ZoneDifficultyTag zone={kill.zone} />
      <span className="muted small" title={tier.why}>
        {kill.y !== undefined ? `${Math.round(kill.y)}, ${Math.round(kill.x ?? 0)}` : "no position"}
      </span>
    </div>
  );
}

/**
 * The marker. Right-clicking it turns the markers off — the quickest way to dismiss
 * something you've stopped needing is on the thing itself, and it's also in Settings.
 */
export function ConfidenceMark({ kill }: { kill: KillRecord }) {
  const tier = confidenceTier(kill.confidence);
  const detail = [
    tier.why,
    kill.fixAgeSec !== undefined ? `Position was ${kill.fixAgeSec}s old.` : "",
    kill.speed ? `You were moving about ${kill.speed} units/s.` : "",
    "Right-click to hide these markers.",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className="conf-mark"
      style={{ color: tier.color }}
      title={detail}
      onContextMenu={(e) => {
        e.preventDefault();
        void api()?.settings.update({ overlay: { showKillConfidence: false } });
      }}
    >
      {tier.glyph}
    </span>
  );
}
