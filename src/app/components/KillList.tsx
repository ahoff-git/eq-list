"use client";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { confidenceTier, CONFIDENCE_TIERS } from "@/shared/kill-confidence";
import type { KillFilters, KillWindow } from "@/shared/kill-filters";
import ItemLink from "./ItemLink";
import type { KillRecord } from "@/shared/types";

/**
 * The kills behind the heatmap, with the same confidence marker the map draws — so a faint
 * dot on the map and its row here tell the same story. Filters are lifted to the parent
 * because the map is filtered by the same object.
 */
export default function KillList({
  kills,
  filters,
  onFilters,
  showConfidence,
}: {
  kills: KillRecord[];
  filters: KillFilters;
  onFilters: (next: KillFilters) => void;
  showConfidence: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const set = <K extends keyof KillFilters>(key: K, value: KillFilters[K]) =>
    onFilters({ ...filters, [key]: value });

  const shown = expanded ? kills : kills.slice(0, 40);
  // The mobs actually present, so the filter offers real choices rather than a free-text box.
  const mobs = useMemo(() => [...new Set(kills.map((k) => k.mob))].sort(), [kills]);

  return (
    <div className="kill-list no-drag">
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
          {kills.length} kill{kills.length === 1 ? "" : "s"}
        </span>
      </div>

      {kills.length === 0 ? (
        <p className="muted small">
          No kills match. Kills are recorded as they happen, and placed using your last{" "}
          <kbd>/loc</kbd> — so the more often you send one, the better the map gets.
        </p>
      ) : (
        <div className="kill-rows">
          {shown.map((kill) => (
            <KillRow key={kill.id} kill={kill} showConfidence={showConfidence} />
          ))}
          {!expanded && kills.length > shown.length && (
            <button className="btn ghost sm" onClick={() => setExpanded(true)}>
              show {kills.length - shown.length} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function KillRow({ kill, showConfidence }: { kill: KillRecord; showConfidence: boolean }) {
  const tier = confidenceTier(kill.confidence);

  return (
    <div className="kill-row">
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

function clock(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
