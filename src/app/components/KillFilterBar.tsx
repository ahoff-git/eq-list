"use client";
import type { ReactNode } from "react";
import { CONFIDENCE_TIERS } from "@/shared/kill-confidence";
import type { KillFilters, KillWindow } from "@/shared/kill-filters";

/** The confidence floors the picker offers, matching `CONFIDENCE_TIERS` best-first. */
const CONFIDENCE_FLOORS = [0.8, 0.5, 0.2, 0.01];

/**
 * The bar that heads a "what died here" panel: which mob, what it dropped, whose kills.
 *
 * **One bar, used by both panels.** The ☠ kill list had it and the 📖 knowledge panel had a header of
 * its own — a whole row spent on "14 mobs observed in Kerra Ridge" and a button — so opening both spent
 * two rows saying two different things before either list started, and the map was nearly gone. Now each
 * panel is headed by this, so the row you spend is a row that filters.
 *
 * Both panels share **one `KillFilters` object**, which is the same reasoning `kill-filters.ts` already
 * gives for the map and the list sharing it: two views of one set of kills must not be able to disagree
 * about which kills those are.
 *
 * Not every control means something everywhere, and the ones that don't are **absent rather than
 * inert**. A time window and a position-confidence floor are facts about an individual kill; mob
 * knowledge is a lifetime tally with no position of its own, and windowing it would quietly hide what
 * you learned last week.
 */
export default function KillFilterBar({
  icon,
  what,
  toggledBy,
  filters,
  onFilters,
  mobs,
  withWindow = true,
  withPosition = true,
  tally,
  children,
}: {
  /** The toolbar glyph that opens this panel, shown here so the two are obviously the same thing. */
  icon: string;
  /** What this panel is, in a word. */
  what: string;
  /** How to word "the button that opens me", for the hover. */
  toggledBy: string;
  filters: KillFilters;
  onFilters: (next: KillFilters) => void;
  /** The mobs actually present, so the picker offers real choices rather than a free-text box. */
  mobs: string[];
  withWindow?: boolean;
  withPosition?: boolean;
  /** What this panel counts, right-aligned — the one part that differs between them. */
  tally?: ReactNode;
  /** Anything else this panel needs in its bar (the knowledge panel's "Forget peers'"). */
  children?: ReactNode;
}) {
  const set = <K extends keyof KillFilters>(key: K, value: KillFilters[K]) =>
    onFilters({ ...filters, [key]: value });

  return (
    <div className="row wrap kill-filters">
      <span className="kf-what" title={`${what} — the ${icon} button in the toolbar ${toggledBy}`}>
        <span className="kf-icon">{icon}</span>
        <span className="small muted">{what}</span>
      </span>

      {withWindow && (
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
      )}

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
        <input type="checkbox" checked={filters.droppedOnly} onChange={(e) => set("droppedOnly", e.target.checked)} />
        <span className="small">dropped</span>
      </label>

      {/* Always here, whether or not anyone is sharing — a bar that grows a control when a peer
          connects is a bar that reflows while you're using it. */}
      <label
        className="row"
        style={{ gap: 4 }}
        title="Include what other players have shared. A mob dying somewhere is evidence of where it spawns whoever saw it — but it says nothing about what it drops for you, so shared kills never count towards your own rates."
      >
        <input type="checkbox" checked={filters.shared} onChange={(e) => set("shared", e.target.checked)} />
        <span className="small">shared</span>
      </label>

      {withPosition && (
        <select
          className="map-zone-select"
          value={filters.minConfidence}
          onChange={(e) => set("minConfidence", Number(e.target.value))}
          title="Hide kills whose position is less trustworthy than this"
        >
          <option value={0}>any position</option>
          {CONFIDENCE_TIERS.slice(0, CONFIDENCE_FLOORS.length).map((tier, i) => (
            <option key={tier.label} value={CONFIDENCE_FLOORS[i]}>
              {tier.glyph} {tier.label} or better
            </option>
          ))}
        </select>
      )}

      <span className="spacer" />
      {tally && <span className="muted small kill-tally">{tally}</span>}
      {children}
    </div>
  );
}
