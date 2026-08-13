"use client";
import type { ReactNode } from "react";
import { CONFIDENCE_TIERS } from "@/shared/kill-confidence";
import { withDroppedOnly, type KillFilters, type KillWindow, type MobChoice } from "@/shared/kill-filters";
import { CheckField, PickField, segCls } from "./ui";

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
  /**
   * The mobs actually present, so the picker offers real choices rather than a free-text box —
   * each with whether it has ever dropped anything, which is what keeps it and the "dropped" box
   * from being able to ask for a set that cannot exist.
   */
  mobs: MobChoice[];
  withWindow?: boolean;
  withPosition?: boolean;
  /** What this panel counts, right-aligned — the one part that differs between them. */
  tally?: ReactNode;
  /** Anything else this panel needs in its bar (the knowledge panel's "Forget peers'"). */
  children?: ReactNode;
}) {
  const set = <K extends keyof KillFilters>(key: K, value: KillFilters[K]) =>
    onFilters({ ...filters, [key]: value });

  // While "dropped" is on, a mob that has never dropped anything isn't a choice — offering it is
  // offering an empty panel. Same rule as `withDroppedOnly`, seen from the other control: neither
  // order of clicks can reach a pair of filters with no answer.
  const pickable = filters.droppedOnly ? mobs.filter((m) => m.dropped) : mobs;
  // Does ticking the box let the picked mob go? Worth saying in the hover *before* it happens —
  // a filter that quietly resets another filter is only kind if you saw it coming.
  const releasesMob = !!filters.mob && !filters.droppedOnly && !withDroppedOnly(filters, true, mobs).mob;

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
              className={segCls(filters.window === w)}
              onClick={() => set("window", w)}
              title={w === "all" ? "Every kill ever recorded" : `Kills in the last ${w}`}
            >
              {w}
            </button>
          ))}
        </div>
      )}

      <PickField
        className="map-zone-select"
        value={filters.mob}
        onChange={(mob) => set("mob", mob)}
        blank="any mob"
        options={pickable.map((m) => ({ value: m.mob, label: m.mob }))}
        title={
          filters.droppedOnly
            ? "Only this mob — while 'dropped' is on, only mobs that have dropped something are offered"
            : "Only this mob"
        }
      />

      <input
        className="field sm kill-drop"
        placeholder="dropped…"
        value={filters.drop}
        onChange={(e) => set("drop", e.target.value)}
        title="Only kills that dropped an item matching this"
      />

      <CheckField
        label="dropped"
        checked={filters.droppedOnly}
        onChange={(on) => onFilters(withDroppedOnly(filters, on, mobs))}
        title={`Only kills that dropped something${
          releasesMob ? ` — ${filters.mob} never has, so ticking this goes back to any mob` : ""
        }`}
      />

      {/* Always here, whether or not anyone is sharing — a bar that grows a control when a peer
          connects is a bar that reflows while you're using it. */}
      <CheckField
        label="shared"
        checked={filters.shared}
        onChange={(on) => set("shared", on)}
        title="Include what other players have shared. A mob dying somewhere is evidence of where it spawns whoever saw it — but it says nothing about what it drops for you, so shared kills never count towards your own rates."
      />

      {withPosition && (
        <PickField
          className="map-zone-select"
          value={filters.minConfidence}
          // The one numeric filter, so it's the one that converts. "Any" is 0 here rather than blank.
          onChange={(floor) => set("minConfidence", Number(floor))}
          blank="any position"
          blankValue="0"
          options={CONFIDENCE_TIERS.slice(0, CONFIDENCE_FLOORS.length).map((tier, i) => ({
            value: String(CONFIDENCE_FLOORS[i]),
            label: `${tier.glyph} ${tier.label} or better`,
          }))}
          title="Hide kills whose position is less trustworthy than this"
        />
      )}

      <span className="spacer" />
      {tally && <span className="muted small kill-tally">{tally}</span>}
      {children}
    </div>
  );
}
