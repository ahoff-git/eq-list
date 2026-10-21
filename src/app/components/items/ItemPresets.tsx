"use client";
import { useState } from "react";
import { TextField } from "@/app/components/ui";
import { activePreset, presetName, removePreset, savePreset, type ItemPreset } from "@/shared/items/item-presets";

/**
 * Saved setups for the Items tab: criteria, value weights and best-in-slot choices under one name
 * (`item-presets.ts`). Pick one and everything is put back; save the current setup under a new name or
 * over an old one. The picker shows which preset is live, and stops showing it the moment anything
 * is changed — so "is this still my caster set?" has an answer.
 */
export default function ItemPresets({
  presets,
  onPresets,
  current,
  onApply,
}: {
  presets: readonly ItemPreset[];
  onPresets: (next: ItemPreset[]) => void;
  current: Omit<ItemPreset, "name">;
  onApply: (preset: ItemPreset) => void;
}) {
  const live = activePreset(presets, current);
  const [naming, setNaming] = useState<string | null>(null);
  const save = () => {
    if (naming === null || !presetName(naming)) return;
    onPresets(savePreset(presets, { name: naming, ...current }));
    setNaming(null);
  };

  return (
    <div className="row wrap item-presets">
      <span className="muted small">Preset</span>
      <select
        className="select-sm"
        value={live ?? ""}
        onChange={(e) => {
          const p = presets.find((x) => x.name === e.target.value);
          if (p) onApply(p);
        }}
        title={presets.length ? "Put a saved setup back — criteria, weights and best-in-slot choices" : "Nothing saved yet"}
      >
        <option value="">{live ? "" : presets.length ? "(unsaved changes)" : "none saved"}</option>
        {presets.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>
      {naming === null ? (
        <>
          <button className="btn sm" onClick={() => setNaming(live ?? "")} title="Save the criteria, weights and best-in-slot choices showing now">
            Save…
          </button>
          {live && (
            <button className="btn ghost sm" onClick={() => onPresets(removePreset(presets, live))} title={`Forget the preset "${live}"`}>
              Delete
            </button>
          )}
        </>
      ) : (
        <>
          <TextField
            className="field"
            autoFocus
            placeholder="Name it — caster set, tank set…"
            value={naming}
            onChange={setNaming}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setNaming(null);
            }}
          />
          <button className="btn sm primary" onClick={save} disabled={!presetName(naming)}>
            {presets.some((p) => p.name.toLowerCase() === presetName(naming).toLowerCase()) ? "Replace" : "Save"}
          </button>
          <button className="btn ghost sm" onClick={() => setNaming(null)}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
