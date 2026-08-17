"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { percent } from "@/shared/format";
import { useRead, useSettings } from "@/lib/hooks";
import { CAST_SUGGESTIONS, isWatched, type CastSuggestion } from "@/shared/cast-suggestions";
import AlertStyleFields from "./AlertStyleFields";
import StyleRow from "./StyleRow";
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
import { CheckField } from "./ui";
import { buildVocabulary, NO_VOCABULARY, type Vocabulary } from "@/shared/log-vocabulary";
import { parseLogText } from "@/shared/log-parser";
import type { AlertStyle, CastWatch, DeepPartial, DisplayInfo, NamedAlertStyle, Settings } from "@/shared/types";

/** A stable empty, so a render before the monitor list arrives doesn't look like a change. */
const NO_DISPLAYS: DisplayInfo[] = [];

/** The one thing open in the tab: a rule's drawer, the defaults' look, or a saved style's. */
type OpenTarget =
  | { kind: "rule"; id: string; pane: WatchPane }
  | { kind: "defaults" }
  | { kind: "style"; id: string };

/**
 * The **Alerts** tab: the rules, what they look like, and where on screen they land.
 *
 * A tab rather than a group inside Settings, which is where it started. That was the right size while
 * an alert was a substring and three checkboxes; a rule now has conditions, timing, cancelling
 * phrases, a check with a log replay, a library, share codes and shared styles — and none of that is a
 * *preference*. Settings is where you answer a question once (where the log lives, how translucent the
 * window is); this is a workspace you come back to, which is what a tab is for. It also stops the
 * whole feature sitting several screens down a scroll shared with the log folder.
 *
 * Everything else about it is unchanged, including that it holds `castAlerts` in Settings: the *data*
 * is a setting, and settings are merged rather than replaced, so this only ever describes its own
 * corner of them.
 */
export default function AlertsPanel() {
  const settings = useSettings();
  /**
   * What is unfolded — **one thing in the whole tab**, whether that's a rule's drawer, the defaults'
   * look, or a saved style's.
   *
   * One piece of state rather than three, because that's what makes the rule enforceable: the style
   * controls are identical wherever they appear, so two of them open at once is two sets of colour
   * swatches with nothing to say which is which.
   */
  const [open, setOpen] = useState<OpenTarget | null>(null);
  // True while placing a custom alert spot (the overlay is catching a click).
  const [placing, setPlacing] = useState(false);
  // Connected monitors, for the alert-overlay "which screen" picker (only offered with >1).
  const displays = useRead((a) => a.display.list(), NO_DISPLAYS, []);
  /**
   * The words this player's log actually uses, for completing a trigger as it's typed.
   *
   * Read once when the tab opens — a slice of the log, the same one a check starts from — and built
   * into a trie here rather than per field, since every box on the tab draws on the same words and
   * rebuilding it per keystroke is exactly what the structure exists to avoid.
   */
  const [vocabulary, setVocabulary] = useState<Vocabulary>(NO_VOCABULARY);
  useEffect(() => {
    void api()
      ?.log.recent()
      .then((tail) => setVocabulary(buildVocabulary(parseLogText(tail?.text ?? ""))));
  }, []);

  // After the hooks, never before them: an early return above would change the hook order.
  if (!settings) return <p className="muted">Loading alerts…</p>;

  const patch = (p: DeepPartial<Settings>) => api()?.settings.update(p);
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
    setOpen({ kind: "rule", id: copy.id, pane: "match" });
  };
  /** Take a library rule, and open it when it's carrying a word only the player can supply. */
  const addLibraryRule = (rule: LibraryRule) => {
    const added: CastWatch = { id: crypto.randomUUID(), enabled: true, ...rule.watch };
    setWatches([...ca.watches, added]);
    if (rule.fill) setOpen({ kind: "rule", id: added.id, pane: "match" });
  };

  // Saved styles: a look with a name, worn by id, so changing it **here** changes every rule
  // wearing it. That is the deliberate path; changing one from inside a rule forks it instead
  // (`alert-styles.ts`), which is why the two live in different places and read differently.
  const setStyles = (styles: NamedAlertStyle[]) => patch({ castAlerts: { styles } });
  const saved = ca.styles ?? [];
  /** New style, copied from the defaults, **open** — making one and editing it are the same gesture. */
  const saveStyle = () => {
    const fresh = { id: newStyleId(saved), name: nextStyleName(saved), style: alertStyle(ca) };
    setStyles([...saved, fresh]);
    setOpen({ kind: "style", id: fresh.id });
  };

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
          Each rule has four drawers: <b>🎯</b> what sets it off — casts, fades, raw log text, and any
          number of <b>conditions</b> (“caster isn’t your warder”, “zone is Lower Guk”, or a second
          spelling); <b>⏱</b> when it speaks — a <b>delay</b> turns a warning into a reminder, so your own
          mez with “25” means <i>recast it</i> and a placeholder’s death with “8m” means <i>it’s back</i>;
          <b>🎨</b> how it looks; and <b>✓</b> a <b>check</b> — what’s wrong with the rule, and which of the
          log’s recent lines it <i>would</i> have fired on. The chips on each row say what it currently
          does; <b>🔔</b> rings that rule now, and <b>⧉</b> copies it.
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
                open={open?.kind === "rule" && open.id === w.id ? open.pane : null}
                onOpen={(pane) => setOpen(pane ? { kind: "rule", id: w.id, pane } : null)}
                onChange={(p) => updateWatch(w.id, p)}
                onRemove={() => removeWatch(w.id)}
                onDuplicate={() => duplicateWatch(w.id)}
                onStyleEdit={(over) => editWatchStyle(w.id, over)}
                onWear={(choice) => wearStyle(w.id, choice)}
                onNameStyle={() => nameWatchStyle(w.id)}
                vocabulary={vocabulary}
              />
            ))}
            <div className="row wrap" style={{ gap: 8, marginTop: 6 }}>
              <button className="btn sm" onClick={addWatch}>
                + Add watch
              </button>
              {/* No list-wide "Test alert": it fired the *first usable* rule, so it answered about a
                  rule you weren't looking at. 🔔 on a row rings that rule; ▶ Preview alert in a style
                  editor shows that look. */}
              <WatchLibrary watches={ca.watches} onAdd={addLibraryRule} />
              <WatchShare watches={ca.watches} onImport={(added) => setWatches([...ca.watches, ...added])} />
              {/* What the completions are drawn from. Said out loud for the same reason the check
                  quotes how many lines it read: "no suggestion" and "nothing to suggest from" look
                  identical in an empty box, and only one of them is about your typing. */}
              <span className="muted small" title="Spell, caster, mob and zone names read from your log. Type a few letters and press Tab to complete.">
                {vocabulary.size ? `${vocabulary.size} words learned from your log` : "no log read yet — no suggestions"}
              </span>
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

            {/* Looks. **One editor is open in this whole tab at a time** — including the ones inside
                a rule's 🎨 drawer — because the controls are identical wherever they appear, and
                three of them on screen is three sets of colour swatches with nothing to say which
                is which. So every look is a *row* you can read (name, colours, who wears it) and a
                button that opens the one editor; creating a new one opens it too, so making and
                editing are the same gesture. */}
            <div className="alert-style">
              <span className="hint" style={{ display: "block", margin: "12px 0 6px" }}>
                How an alert looks — color, sound, where it shows and how it moves. The banner floats over
                the game in its own overlay; the beep comes from this window. Rules follow the
                <b> defaults</b> unless they wear a <b>saved style</b> or have a look of their own.
              </span>

              <StyleRow
                name="Defaults"
                style={alertStyle(ca)}
                note={`worn by ${ca.watches.filter((w) => !w.styleId && !w.style).length}`}
                open={open?.kind === "defaults"}
                onOpen={() => setOpen(open?.kind === "defaults" ? null : { kind: "defaults" })}
              />
              {open?.kind === "defaults" && (
                <div className="style-editor">
                  <AlertStyleFields style={ca} locations={ca.locations} onChange={(over) => patch({ castAlerts: over })} />
                </div>
              )}

              {/* A saved style is changed for **everyone wearing it** here; doing the same from
                  inside a rule forks instead ([ADR 0086]), which is why the two are different
                  places rather than one place with a mode. */}
              {saved.map((s) => (
                <div key={s.id}>
                  <StyleRow
                    name={s.name}
                    style={s.style}
                    note={`worn by ${ca.watches.filter((w) => w.styleId === s.id).length}`}
                    open={open?.kind === "style" && open.id === s.id}
                    onOpen={() =>
                      setOpen(open?.kind === "style" && open.id === s.id ? null : { kind: "style", id: s.id })
                    }
                    onRename={(name) => renameStyle(s.id, name)}
                    onRemove={() => removeStyle(s.id)}
                  />
                  {open?.kind === "style" && open.id === s.id && (
                    <div className="style-editor">
                      <AlertStyleFields
                        style={s.style}
                        locations={ca.locations}
                        onChange={(over) => updateStyle(s.id, over)}
                      />
                    </div>
                  )}
                </div>
              ))}
              <button
                className="btn sm"
                style={{ marginTop: 4 }}
                title="A new saved style, copied from the defaults — rules can then wear it by name"
                onClick={saveStyle}
              >
                ＋ New saved style
              </button>

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
                      {/* A spot's name is what you'll pick it by in Position, so it gets room. */}
                      <input
                        className="field"
                        style={{ flex: 1, minWidth: 0 }}
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
                  {/* A monitor's label is "Monitor 1 — 2560×1440": nothing about it is short. */}
                  <select
                    className="field sm pick wide"
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
