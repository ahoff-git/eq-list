"use client";
import {
  DIFFICULTIES,
  DIFFICULTY_NAMES,
  INSTANCE_TYPES,
  difficultyMultiplier,
  type Difficulty,
  type DifficultySetting,
  type InstanceType,
} from "@/shared/mob/difficulty-scaling";

/**
 * The difficulty slider on a mob's page: D0–D4, the kind of instance, and whether the mob is
 * multi-class — the three things the wiki's health table is keyed by (ADR 0348).
 *
 * Controlled: the page view owns the setting, because the card it draws is what the slider changes.
 * The note says the multiplier and that it is an estimate, so a scaled number is never taken for a
 * reading.
 */
export default function DifficultySlider({ setting, onChange }: { setting: DifficultySetting; onChange: (setting: DifficultySetting) => void }) {
  const set = (patch: Partial<DifficultySetting>) => onChange({ ...setting, ...patch });
  const multiplier = difficultyMultiplier(setting);
  const note =
    multiplier === undefined
      ? `The wiki lists no ${setting.multiClass ? "multi-class" : "single-class"} mobs at ${DIFFICULTY_NAMES[setting.difficulty]} — figures as read.`
      : multiplier === 1
        ? "HP and damage as the wiki read them — taken to be an ordinary public zone at D0."
        : `HP and damage ×${multiplier.toFixed(2)}: the wiki's tiers, with an unmeasured multiplier per tier — an estimate.`;
  return (
    <div className="upgrade-slider">
      <div className="row">
        <span className="muted small">Difficulty</span>
        <input
          className="level-slider"
          type="range"
          min={0}
          max={DIFFICULTIES.length - 1}
          step={1}
          value={setting.difficulty}
          aria-label="Difficulty"
          onChange={(e) => set({ difficulty: Number(e.target.value) as Difficulty })}
        />
        <span className="level-cap">{DIFFICULTY_NAMES[setting.difficulty]}</span>
        <select className="field sm" value={setting.instance} aria-label="Instance type" onChange={(e) => set({ instance: e.target.value as InstanceType })}>
          {INSTANCE_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="small" title="Dual- or triple-class: common among D2 nameds and D3 raid bosses">
          <input type="checkbox" checked={setting.multiClass} onChange={(e) => set({ multiClass: e.target.checked })} /> multi-class
        </label>
      </div>
      <div className="muted small">{note}</div>
    </div>
  );
}
