"use client";
import { ladderNote, levelledTitle, type Ladder } from "@/shared/upgrade-view";

/**
 * The `+N` slider on a page that levels — drag to see what the thing becomes as it ranks up.
 *
 * Controlled: the page view owns the level, because the card it draws is what the slider changes.
 * The read-out says the level the way the game would name it (`+4`, `VI`), and the note under it
 * says what a level does, so a number that moved is never a mystery.
 */
export default function UpgradeSlider({
  ladder,
  level,
  held,
  onChange,
}: {
  ladder: Ladder;
  level: number;
  /** The level the name you opened states, so you can get back to "mine" after looking ahead. */
  held: number;
  onChange: (level: number) => void;
}) {
  const label = levelledTitle("", ladder, level).trim() || (ladder.kind === "item" ? "+0" : "0");
  return (
    <div className="upgrade-slider">
      <div className="row">
        <span className="muted small">{ladder.kind === "item" ? "Grade" : "Spell level"}</span>
        <button className="btn sm" disabled={level <= 0} onClick={() => onChange(level - 1)} aria-label="One level down">
          −
        </button>
        <input
          className="level-slider"
          type="range"
          min={0}
          max={ladder.max}
          step={1}
          value={level}
          aria-label={ladder.kind === "item" ? "Item grade" : "Spell level"}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button className="btn sm" disabled={level >= ladder.max} onClick={() => onChange(level + 1)} aria-label="One level up">
          +
        </button>
        <span className="level-cap">{label}</span>
        {held > 0 && level !== held && (
          <button className="btn sm" onClick={() => onChange(held)} title="Back to the level of the one you opened">
            yours
          </button>
        )}
      </div>
      <div className="muted small">{ladderNote(ladder)}</div>
    </div>
  );
}
