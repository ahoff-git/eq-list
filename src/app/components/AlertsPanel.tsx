"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { percent } from "@/shared/format";
import { useRead } from "@/lib/hooks";
import { CAST_SUGGESTIONS, isWatched, type CastSuggestion } from "@/shared/cast-suggestions";
import AlertStyleFields from "./AlertStyleFields";
import CastWatchRow, { type WatchPane } from "./CastWatchRow";
import WatchLibrary from "./WatchLibrary";
import WatchShare from "./WatchShare";
import {
  alertStyle,
  applyStyleEdit,
  nameOwnStyle,
  newStyleId,
  nextStyleName,
  OWN_STYLE,
} from "@/shared/alert-styles";
import type { LibraryRule } from "@/shared/watch-library";
import { CheckField, ConfigRow } from "./ui";
import type { AlertStyle, CastWatch, DeepPartial, DisplayInfo, NamedAlertStyle, Settings } from "@/shared/types";

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
  // Which watch is unfolded, and at which drawer — one across the whole list, so a long list of
  // watches stays a list rather than a wall of editors.
  const [open, setOpen] = useState<{ id: string; pane: WatchPane } | null>(null);
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
  /**
   * Copy a rule, next to the one it came from and already open.
   *
   * The quickest route to "the same but for X" — which is what most second rules are — and it opens
   * because a duplicate you can't tell apart from its original is a trap. Its own style *tweaks*
   * come along; a saved style is shared by id, so the copy simply wears the same one.
   */
  const duplicateWatch = (id: string) => {
    const from = ca.watches.find((w) => w.id === id);
    if (!from) return;
    const copy: CastWatch = { ...from, id: crypto.randomUUID(), conditions: from.conditions?.map((c) => ({ ...c })) };
    const at = ca.watches.findIndex((w) => w.id === id) + 1;
    setWatches([...ca.watches.slice(0, at), copy, ...ca.watches.slice(at)]);
    setOpen({ id: copy.id, pane: "match" });
  };
  /** Take a library rule, and open it when it's carrying a word only the player can supply. */
  const addLibraryRule = (rule: LibraryRule) => {
    const added: CastWatch = { id: crypto.randomUUID(), enabled: true, ...rule.watch };
    setWatches([...ca.watches, added]);
    if (rule.fill) setOpen({ id: added.id, pane: "match" });
  };

  // Saved styles: a look with a name, worn by id, so changing it **here** changes every rule
  // wearing it. That is the deliberate path; changing one from inside a rule forks it instead
  // (`alert-styles.ts`), which is why the two live in different places and read differently.
  const setStyles = (styles: NamedAlertStyle[]) => patch({ castAlerts: { styles } });
  const saved = ca.styles ?? [];
  const saveStyle = () =>
    setStyles([...saved, { id: newStyleId(saved), name: nextStyleName(saved), style: alertStyle(ca) }]);

  /**
   * A rule's look changed. Which of the three things that means — its own look, a saved style
   * nobody else wears, or a fork of a shared one — is `applyStyleEdit`'s call, and both halves are
   * written in **one** patch: a rule pointing at a style that doesn't exist yet would render as the
   * defaults for a frame.
   */
  const editWatchStyle = (id: string, over: Partial<AlertStyle>) => {
    const watch = ca.watches.find((w) => w.id === id);
    if (!watch) return;
    const edit = applyStyleEdit(ca, watch, over);
    patch({
      castAlerts: {
        styles: edit.styles,
        watches: ca.watches.map((w) => (w.id === id ? { ...w, ...edit.watch } : w)),
      },
    });
  };
  /** Wear a different look: a saved style by id, its own, or the defaults. */
  const wearStyle = (id: string, choice: string) => {
    const watch = ca.watches.find((w) => w.id === id);
    if (!watch) return;
    if (choice === OWN_STYLE) {
      // Keeping its own look means baking in what it looks like now, so nothing changes on screen.
      updateWatch(id, { styleId: undefined, style: watch.style ?? { ...alertStyle(ca, watch) } });
      return;
    }
    // Wearing something means wearing it — any own look is dropped, or the picker would be lying.
    updateWatch(id, { styleId: choice || undefined, style: undefined });
  };
  /** Promote a rule's own look into the shared list. */
  const nameWatchStyle = (id: string) => {
    const watch = ca.watches.find((w) => w.id === id);
    if (!watch) return;
    const edit = nameOwnStyle(ca, watch);
    patch({
      castAlerts: {
        styles: edit.styles,
        watches: ca.watches.map((w) => (w.id === id ? { ...w, ...edit.watch } : w)),
      },
    });
  };
  const renameStyle = (id: string, name: string) => setStyles(saved.map((s) => (s.id === id ? { ...s, name } : s)));
  const updateStyle = (id: string, over: Partial<AlertStyle>) =>
    setStyles(saved.map((s) => (s.id === id ? { ...s, style: { ...s.style, ...over } } : s)));
  // A watch wearing a deleted style falls back to the defaults on its own (`alertStyle`), so the
  // rules that referenced it are left alone rather than rewritten behind the player's back.
  const removeStyle = (id: string) => setStyles(saved.filter((s) => s.id !== id));
  // Add a suggested watch, unless an identical substring is already on the list. A raw-text
  // suggestion ("invites you") is about what the game said, so it isn't also matched as a spell,
  // and it brings its own wording where EQ's sentence isn't one worth reading mid-fight.
  const addSuggestion = (s: CastSuggestion) => {
    if (ca.watches.some((w) => w.spell.trim().toLowerCase() === s.spell.trim().toLowerCase())) return;
    const line = s.onLine ? { onLine: true, onCast: false } : {};
    const message = s.message ? { message: s.message } : {};
    setWatches([...ca.watches, { id: crypto.randomUUID(), spell: s.spell, enabled: true, ...line, ...message }]);
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
        <CheckField
          className="setting-check"
          label="Cast alerts — flash when a watched spell is being cast (to prep a dispel)"
          checked={ca.enabled}
          onChange={(enabled) => patch({ castAlerts: { enabled } })}
        />
        <span className="hint">
          Watches the log for “<i>… begins casting <b>&lt;spell&gt;</b></i>” and flashes a banner so you can
          react before it lands. Matching is by substring, case-insensitive, so “Fear” catches any spell whose
          name contains it. Enemy casts the log doesn’t name (“begins to cast a spell”) can’t be identified.
          Each watch has three drawers: <b>⚟</b> what sets it off (casts, fades, raw log text, and any
          number of <b>conditions</b> — “caster isn’t your warder”, “zone is Lower Guk”, or a second
          spelling), <b>⏱</b> when it speaks (a <b>delay</b> turns a warning into a reminder: your own mez
          with “25” to be told to recast it, a placeholder’s death with “8m” to be told it’s back — plus
          repeats and the words that call one off), <b>🎨</b> how it looks, and <b>✓</b> a check — what’s
          wrong with the rule, and which of the log’s recent lines it <i>would</i> have fired on. The chips
          on each row say what it currently does; <b>⧉</b> copies a rule.
        </span>
        {ca.enabled && (
          <div style={{ marginTop: 8 }}>
            <div className="row" style={{ gap: 14, marginBottom: 8 }}>
              <CheckField label="Beep" checked={ca.sound} onChange={(sound) => patch({ castAlerts: { sound } })} />
              <CheckField label="Screen flash" checked={ca.flash} onChange={(flash) => patch({ castAlerts: { flash } })} />
              <CheckField
                label="Include my own casts"
                checked={ca.includeSelf}
                onChange={(includeSelf) => patch({ castAlerts: { includeSelf } })}
              />
            </div>
            {ca.watches.map((w) => (
              <CastWatchRow
                key={w.id}
                watch={w}
                alerts={ca}
                open={open?.id === w.id ? open.pane : null}
                onOpen={(pane) => setOpen(pane ? { id: w.id, pane } : null)}
                onChange={(p) => updateWatch(w.id, p)}
                onRemove={() => removeWatch(w.id)}
                onDuplicate={() => duplicateWatch(w.id)}
                onStyleEdit={(over) => editWatchStyle(w.id, over)}
                onWear={(choice) => wearStyle(w.id, choice)}
                onNameStyle={() => nameWatchStyle(w.id)}
              />
            ))}
            <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
              <button className="btn sm" onClick={addWatch}>
                + Add watch
              </button>
              <button className="btn sm" onClick={() => api()?.alerts.test()} title="Preview the alert banner (and beep)">
                Test alert
              </button>
              <WatchLibrary watches={ca.watches} onAdd={addLibraryRule} />
              <WatchShare watches={ca.watches} onImport={(added) => setWatches([...ca.watches, ...added])} />
            </div>

            <div className="cast-suggest">
              <span className="hint" style={{ display: "block", margin: "10px 0 4px" }}>
                Suggested — common crowd control, grouped by effect, plus buffs <i>fading</i> and
                things <i>said to you</i>. Many CC spells aren’t named “Fear” or “Charm” (this
                server’s root is <i>Instill</i>), so click to watch a whole family. ✓ means it’s
                already on your list. Anything else in your log works too: add a watch, tick
                <b> raw text</b>, and paste the sentence.
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

              {/* Saved styles: the same controls again, once per named look. **This** is the place a
                  shared style is changed for everyone wearing it — doing the same thing from inside
                  a rule forks instead, which is why the two are different places rather than one
                  place with a mode. */}
              <ConfigRow label="Saved styles" align="top">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="hint" style={{ display: "block", marginBottom: 4 }}>
                    A look with a name, worn by any number of rules. Editing one <b>here</b> changes every
                    rule wearing it — that&apos;s what it&apos;s for. Changing it from inside a rule makes that
                    rule a copy instead, so one rule can never quietly restyle the others.
                  </span>
                  {saved.length === 0 && (
                    <span className="muted small">
                      None yet — save the style above as a named one to share it between rules, then pick it
                      in a rule&apos;s 🎨 drawer.
                    </span>
                  )}
                  {saved.map((s) => (
                    <div key={s.id} className="saved-style">
                      <div className="row" style={{ gap: 6 }}>
                        <input
                          className="field"
                          style={{ flex: 1, minWidth: 0 }}
                          value={s.name}
                          onChange={(e) => renameStyle(s.id, e.target.value)}
                        />
                        <span className="muted small" style={{ whiteSpace: "nowrap" }}>
                          worn by {ca.watches.filter((w) => w.styleId === s.id).length}
                        </span>
                        <button
                          className="btn ghost sm"
                          title="Delete this style — rules wearing it fall back to the defaults"
                          onClick={() => removeStyle(s.id)}
                        >
                          ✕
                        </button>
                      </div>
                      <AlertStyleFields
                        style={s.style}
                        locations={ca.locations}
                        onChange={(over) => updateStyle(s.id, over)}
                      />
                    </div>
                  ))}
                  <button className="btn sm" style={{ marginTop: 4 }} onClick={saveStyle}>
                    ＋ Save the style above
                  </button>
                </div>
              </ConfigRow>

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
