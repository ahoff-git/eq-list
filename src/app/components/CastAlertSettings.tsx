"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { percent } from "@/shared/format";
import { useRead } from "@/lib/hooks";
import { CAST_SUGGESTIONS, isWatched, type CastSuggestion } from "@/shared/cast-suggestions";
import AlertStyleFields from "./AlertStyleFields";
import CastWatchRow from "./CastWatchRow";
import type { CastWatch, DeepPartial, DisplayInfo, Settings } from "@/shared/types";

/** A stable empty, so a render before the monitor list arrives doesn't look like a change. */
const NO_DISPLAYS: DisplayInfo[] = [];

/**
 * The cast-alerts group of Settings: what to watch for, how loudly to say it, and where on screen.
 *
 * Its own component because it's the one settings group with **state and behaviour** rather than a
 * value per row — a list of watches you add to and reorder, a per-watch style editor that opens one at
 * a time, and named screen spots you place by clicking the overlay. Nine handlers and two pieces of
 * state existed for this alone, and mixed in with the rest of Settings they made a 500-line component
 * where the log folder and a per-watch colour picker sat at the same depth.
 *
 * `patch` is the panel's — settings are merged, never replaced, so a group can only ever describe its
 * own corner of them.
 */
export default function CastAlertSettings({
  settings,
  patch,
}: {
  settings: Settings;
  patch: (p: DeepPartial<Settings>) => void;
}) {
  // Which watch's own-style editor is expanded (only one at a time).
  const [styling, setStyling] = useState<string | null>(null);
  // True while placing a custom alert spot (the overlay is catching a click).
  const [placing, setPlacing] = useState(false);
  // Connected monitors, for the alert-overlay "which screen" picker (only offered with >1).
  const displays = useRead((a) => a.display.list(), NO_DISPLAYS, []);

  // Cast alerts: watches are a whole-array replace (deepMerge swaps arrays wholesale).
  const ca = settings.castAlerts;
  const setWatches = (watches: CastWatch[]) => patch({ castAlerts: { watches } });
  const updateWatch = (id: string, p: Partial<CastWatch>) =>
    setWatches(ca.watches.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const removeWatch = (id: string) => setWatches(ca.watches.filter((w) => w.id !== id));
  const addWatch = () => setWatches([...ca.watches, { id: crypto.randomUUID(), spell: "", enabled: true }]);
  // Add a suggested watch, unless an identical substring is already on the list. A line
  // suggestion ("invites you") is about what the game said, so it isn't also matched as a spell.
  const addSuggestion = (s: CastSuggestion) => {
    if (ca.watches.some((w) => w.spell.trim().toLowerCase() === s.spell.trim().toLowerCase())) return;
    const line = s.onLine ? { onLine: true, onCast: false } : {};
    setWatches([...ca.watches, { id: crypto.randomUUID(), spell: s.spell, enabled: true, ...line }]);
  };

  // Custom alert spots (locations): a whole-array replace, like watches.
  const setLocations = (locations: typeof ca.locations) => patch({ castAlerts: { locations } });
  const renameLocation = (id: string, name: string) =>
    setLocations(ca.locations.map((l) => (l.id === id ? { ...l, name } : l)));
  const removeLocation = (id: string) => setLocations(ca.locations.filter((l) => l.id !== id));
  // Let the user click a point on the overlay; add it as a named spot they can then rename / pick.
  const placeSpot = async () => {
    setPlacing(true);
    try {
      const p = await api()?.alerts.placeLocation();
      if (p) setLocations([...ca.locations, { id: crypto.randomUUID(), name: `Spot ${ca.locations.length + 1}`, ...p }]);
    } finally {
      setPlacing(false);
    }
  };

  return (
      <div className="setting">
        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            checked={ca.enabled}
            onChange={(e) => patch({ castAlerts: { enabled: e.target.checked } })}
          />
          Cast alerts — flash when a watched spell is being cast (to prep a dispel)
        </label>
        <span className="hint">
          Watches the log for “<i>… begins casting <b>&lt;spell&gt;</b></i>” and flashes a banner so you can
          react before it lands. Matching is by substring, case-insensitive, so “Fear” catches any spell whose
          name contains it. Enemy casts the log doesn’t name (“begins to cast a spell”) can’t be identified.
          Tick <b>line</b> on a watch to match the words of a whole log line instead — “invites you” catches
          “<i>BunnySlayer invites you to a party</i>”.
        </span>
        {ca.enabled && (
          <div style={{ marginTop: 8 }}>
            <div className="row" style={{ gap: 14, marginBottom: 8 }}>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={ca.sound} onChange={(e) => patch({ castAlerts: { sound: e.target.checked } })} />
                Beep
              </label>
              <label className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={ca.flash} onChange={(e) => patch({ castAlerts: { flash: e.target.checked } })} />
                Screen flash
              </label>
              <label className="row" style={{ gap: 6 }}>
                <input
                  type="checkbox"
                  checked={ca.includeSelf}
                  onChange={(e) => patch({ castAlerts: { includeSelf: e.target.checked } })}
                />
                Include my own casts
              </label>
            </div>
            {ca.watches.map((w) => (
              <CastWatchRow
                key={w.id}
                watch={w}
                alerts={ca}
                styling={styling === w.id}
                onStyling={(open) => setStyling(open ? w.id : null)}
                onChange={(p) => updateWatch(w.id, p)}
                onRemove={() => removeWatch(w.id)}
              />
            ))}
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <button className="btn sm" onClick={addWatch}>
                + Add watch
              </button>
              <button className="btn sm" onClick={() => api()?.alerts.test()} title="Preview the alert banner (and beep)">
                Test alert
              </button>
            </div>

            <div className="cast-suggest">
              <span className="hint" style={{ display: "block", margin: "10px 0 4px" }}>
                Suggested — common crowd control, grouped by effect, plus things <i>said to you</i>.
                Many CC spells aren’t named “Fear” or “Charm” (this server’s root is <i>Instill</i>),
                so click to watch a whole family. ✓ means it’s already on your list.
              </span>
              {CAST_SUGGESTIONS.map((group) => (
                <div className="row wrap cs-row" key={group.category}>
                  <span className="muted small cs-cat">{group.category}</span>
                  {group.suggestions.map((s) => {
                    const added = isWatched(ca.watches, s);
                    return (
                      <button
                        key={s.spell}
                        className={`btn sm ghost cs-chip ${added ? "added" : ""}`}
                        title={s.note}
                        disabled={added}
                        onClick={() => addSuggestion(s)}
                      >
                        {added ? "✓ " : "+ "}
                        {s.label ?? s.spell}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="alert-style">
              <span className="hint" style={{ display: "block", margin: "12px 0 6px" }}>
                Alert style — color, sound, where it shows and how it moves. The banner floats over the
                game in its own overlay; the beep comes from this window.
              </span>

              <AlertStyleFields
                style={ca}
                locations={ca.locations}
                onChange={(over) => patch({ castAlerts: over })}
              />

              <div className="row astyle-row" style={{ alignItems: "flex-start" }}>
                <span className="astyle-label">Custom spots</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {ca.locations.length === 0 && (
                    <span className="muted small">
                      None yet — place one to pin an alert anywhere on the overlay, then pick it in Position.
                    </span>
                  )}
                  {ca.locations.map((loc) => (
                    <div className="row" key={loc.id} style={{ gap: 6, marginBottom: 4 }}>
                      <input
                        className="field sm"
                        value={loc.name}
                        onChange={(e) => renameLocation(loc.id, e.target.value)}
                      />
                      <span className="muted small" style={{ whiteSpace: "nowrap" }}>
                        {percent(loc.fx)}, {percent(loc.fy)}
                      </span>
                      <button className="btn ghost sm" title="Remove this spot" onClick={() => removeLocation(loc.id)}>
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn sm"
                    style={{ marginTop: 4 }}
                    onClick={placeSpot}
                    disabled={placing}
                    title="Click a point on the alert overlay to place a spot alerts can appear at"
                  >
                    {placing ? "Click the overlay… (Esc to cancel)" : "＋ Place a spot"}
                  </button>
                </div>
              </div>

              {displays.length > 1 && (
                <div className="row astyle-row">
                  <span className="astyle-label">Monitor</span>
                  <select
                    className="field sm"
                    value={String(ca.displayId ?? displays.find((d) => d.primary)?.id ?? "")}
                    onChange={(e) => patch({ castAlerts: { displayId: Number(e.target.value) } })}
                  >
                    {displays.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
  );
}
