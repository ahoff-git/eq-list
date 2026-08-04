"use client";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { confidenceTier, CONFIDENCE_TIERS } from "@/shared/kill-confidence";
import type { KillFilters, KillWindow } from "@/shared/kill-filters";
import ItemLink from "./ItemLink";
import type { KillRecord } from "@/shared/types";

/** How many mob groups to show before the "show more" fold. Distinct mobs per zone are few. */
const MAX_GROUPS = 40;

/** Distinct drops to name in a group's header before summarising the rest as "+N". */
const MAX_HEAD_DROPS = 6;

/** Which kills to pick out on the map: one mob's, or a single kill. */
export interface KillEmphasis {
  mob?: string;
  id?: string;
}

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
  const set = <K extends keyof KillFilters>(key: K, value: KillFilters[K]) =>
    onFilters({ ...filters, [key]: value });

  // One openable entry per mob (newest first), so 300 kills of the same thing read as a single
  // row with a count — not a wall of identical names. The map still plots every individual kill.
  const groups = useMemo(() => groupByMob(kills), [kills]);
  const shownGroups = expanded ? groups : groups.slice(0, MAX_GROUPS);
  // The mobs actually present, so the filter offers real choices rather than a free-text box.
  const mobs = useMemo(() => [...new Set(kills.map((k) => k.mob))].sort(), [kills]);

  return (
    // Leaving the list clears the emphasis outright. The rows hand it back and forth between a mob
    // and one of its kills, so without a backstop here, walking the cursor out of a kill row would
    // leave that mob lit up on the map for good.
    <div className="kill-list no-drag" onMouseLeave={() => onEmphasize?.(null)}>
      <div className="row wrap kill-filters">
        <div className="segmented">
          {(["10m", "1h", "session", "all"] as KillWindow[]).map((w) => (
            <button
              key={w}
              className={`seg ${filters.window === w ? "active" : ""}`}
              onClick={() => set("window", w)}
              title={w === "all" ? "Every kill ever recorded" : `Kills in the last ${w}`}
            >
              {w}
            </button>
          ))}
        </div>

        <select
          className="map-zone-select"
          value={filters.mob}
          onChange={(e) => set("mob", e.target.value)}
          title="Only this mob"
        >
          <option value="">any mob</option>
          {mobs.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <input
          className="field sm kill-drop"
          placeholder="dropped…"
          value={filters.drop}
          onChange={(e) => set("drop", e.target.value)}
          title="Only kills that dropped an item matching this"
        />

        <label className="row" style={{ gap: 4 }} title="Only kills that dropped something">
          <input
            type="checkbox"
            checked={filters.droppedOnly}
            onChange={(e) => set("droppedOnly", e.target.checked)}
          />
          <span className="small">dropped</span>
        </label>

        <select
          className="map-zone-select"
          value={filters.minConfidence}
          onChange={(e) => set("minConfidence", Number(e.target.value))}
          title="Hide kills whose position is less trustworthy than this"
        >
          <option value={0}>any position</option>
          {CONFIDENCE_TIERS.slice(0, 4).map((tier, i) => (
            <option key={tier.label} value={[0.8, 0.5, 0.2, 0.01][i]}>
              {tier.glyph} {tier.label} or better
            </option>
          ))}
        </select>

        <span className="spacer" />
        <span className="muted small">
          {groups.length} mob{groups.length === 1 ? "" : "s"} · {kills.length} kill{kills.length === 1 ? "" : "s"}
        </span>
      </div>

      {kills.length === 0 ? (
        <p className="muted small">
          No kills match. Kills are recorded as they happen, and placed using your last{" "}
          <kbd>/loc</kbd> — so the more often you send one, the better the map gets.
        </p>
      ) : (
        <div className="kill-rows">
          {shownGroups.map((g) => (
            <MobGroup key={g.mob} group={g} showConfidence={showConfidence} />
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
  onEmphasize?: (emphasis: KillEmphasis | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const newest = group.kills[0];
  const drops = useMemo(() => summarizeDrops(group.kills), [group.kills]);
  const others = group.kills.filter((k) => k.mine === false).length;
  const headDrops = drops.slice(0, MAX_HEAD_DROPS);

  return (
    <div className={`kill-group ${open ? "open" : ""}`}>
      <div
        className="kill-group-head"
        onClick={() => setOpen((o) => !o)}
        // Hovering the mob picks out every one of its kills on the map.
        onMouseEnter={() => onEmphasize?.({ mob: group.mob })}
        onMouseLeave={() => onEmphasize?.(null)}
      >
        <span className="caret">{open ? "▾" : "▸"}</span>
        <span className="kr-mob">{group.mob}</span>
        <span className="kg-count muted small">×{group.kills.length}</span>
        {others > 0 && (
          <span
            className="muted small"
            title={`${others} killed by someone else — still evidence the mob is here, but not counted in your drop rates.`}
          >
            {others} by others
          </span>
        )}
        <span className="spacer" />
        {headDrops.length > 0 && (
          <span className="kr-drops">
            {headDrops.map((d, i) => (
              <span key={d.item}>
                {i > 0 && ", "}
                <ItemLink title={d.item} />
                {d.count > 1 && <span className="muted small"> ×{d.count}</span>}
              </span>
            ))}
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
  onEmphasize?: (emphasis: KillEmphasis | null) => void;
}) {
  const tier = confidenceTier(kill.confidence);

  return (
    <div
      className="kill-row"
      // One kill, so the map points at exactly where this one died. The group's own hover fires
      // again on the way out, which is why leaving sends null rather than the group.
      onMouseEnter={() => onEmphasize?.({ id: kill.id })}
      onMouseLeave={() => onEmphasize?.({ mob: kill.mob })}
    >
      <span className="kr-time">{clock(kill.at)}</span>
      {showConfidence && <ConfidenceMark kill={kill} />}
      <span className="kr-mob">{kill.mob}</span>
      {kill.mine === false && (
        <span
          className="muted small"
          title={`${kill.killer} killed this, not you. It still says the mob is here, but it doesn't count towards your drop rates — you never had the corpse.`}
        >
          by {kill.killer}
        </span>
      )}
      {kill.drops?.length ? (
        <span className="kr-drops">
          {kill.drops.map((d, i) => (
            <span key={`${d}-${i}`}>
              {i > 0 && ", "}
              <ItemLink title={d} />
            </span>
          ))}
        </span>
      ) : (
        <span className="muted small">no drop</span>
      )}
      <span className="spacer" />
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

/** A kill's time of day, as the list and the map's hover both show it. */
export function clock(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
