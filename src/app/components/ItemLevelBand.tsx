"use client";
import { figure } from "@/shared/format";
import type { ItemCriteria } from "@/shared/item-search";

/** The level cap in this era. At the slider's far right it means "no cap", which is also the truth. */
const MAX_PLAYER_LEVEL = 60;

/**
 * "What can I use?", as a floor you type and a cap you drag.
 *
 * The two halves get different controls on purpose. A floor is a number you know ("nothing under 30")
 * and type once. The **cap** is the one you re-ask as you level, and you want to watch the list move
 * as it goes — so it is a slider, and at the far right it means no cap at all rather than 60, which is
 * also the truth once you are there.
 *
 * The note underneath is said once here rather than on every row: the level is *derived*, its quality
 * varies by where it came from, and a bound is silent about what nothing could place — which is
 * thousands of items ([ADR 0163](../../../specs/decisions/0163-an-item-wears-the-level-of-what-drops-it.md)).
 */
export default function ItemLevelBand({
  criteria,
  unplaced,
  onChange,
}: {
  criteria: ItemCriteria;
  /** How many items no bound can speak about, so the note can own up to them. */
  unplaced: number;
  onChange: (patch: Partial<ItemCriteria>) => void;
}) {
  return (
    <div className="row wrap level-band">
      <span className="muted small">Level</span>
      <input
        className="field sm"
        type="number"
        min={1}
        placeholder="any"
        title="Lowest level you'd use it at"
        value={criteria.levelMin ?? ""}
        onChange={(e) => onChange({ levelMin: e.target.value.trim() ? Number(e.target.value) : undefined })}
      />
      <span className="muted">–</span>
      <input
        className="level-slider"
        type="range"
        min={1}
        max={MAX_PLAYER_LEVEL}
        step={1}
        value={criteria.levelMax ?? MAX_PLAYER_LEVEL}
        title="Hide anything you'd have to be higher than this to use"
        onChange={(e) => {
          const at = Number(e.target.value);
          onChange({ levelMax: at >= MAX_PLAYER_LEVEL ? undefined : at });
        }}
      />
      <span className="level-cap">{criteria.levelMax ?? `${MAX_PLAYER_LEVEL}+`}</span>
      {criteria.levelMax !== undefined && (
        <button className="btn sm" onClick={() => onChange({ levelMax: undefined })} title="No level cap">
          ✕
        </button>
      )}
      <span className="muted small">
        from the card if it says, else the mob that drops it, the quest that gives it, or its zone
        {unplaced > 0 ? ` · ${figure(unplaced)} unplaced, always shown` : ""}.
      </span>
    </div>
  );
}
