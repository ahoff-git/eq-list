"use client";
import { useState } from "react";
import { useSettings, useWatcherStatus, useAppInfo } from "@/lib/hooks";
import { api } from "@/lib/api";
import { characterFromLogFile } from "@/shared/log-parser";
import { UI_SCALE } from "@/shared/constants";
import { CAST_SUGGESTIONS, isWatched } from "@/shared/cast-suggestions";
import type { CastWatch, DeepPartial, LogImportResult, Settings } from "@/shared/types";

/** Log location, match strictness, overlay look, and the debug toggle. */
export default function SettingsPanel() {
  const settings = useSettings();
  const status = useWatcherStatus();
  const info = useAppInfo();
  const [digesting, setDigesting] = useState(false);
  const [digested, setDigested] = useState<LogImportResult | null>(null);

  if (!settings) return <p className="muted">Loading settings…</p>;

  const patch = (p: DeepPartial<Settings>) => api()?.settings.update(p);
  const derivedName = characterFromLogFile(status.file) ?? "";

  // Cast alerts: watches are a whole-array replace (deepMerge swaps arrays wholesale).
  const ca = settings.castAlerts;
  const setWatches = (watches: CastWatch[]) => patch({ castAlerts: { watches } });
  const updateWatch = (id: string, p: Partial<CastWatch>) =>
    setWatches(ca.watches.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const removeWatch = (id: string) => setWatches(ca.watches.filter((w) => w.id !== id));
  const addWatch = () => setWatches([...ca.watches, { id: crypto.randomUUID(), spell: "", enabled: true }]);
  // Add a suggested crowd-control watch, unless an identical substring is already on the list.
  const addSuggestion = (spell: string) => {
    if (ca.watches.some((w) => w.spell.trim().toLowerCase() === spell.trim().toLowerCase())) return;
    setWatches([...ca.watches, { id: crypto.randomUUID(), spell, enabled: true }]);
  };

  async function browse() {
    const dir = await api()?.settings.pickLogDir();
    if (dir) patch({ logDir: dir });
  }

  async function digestLog() {
    setDigesting(true);
    try {
      const res = await api()?.log.import();
      if (res) setDigested(res);
    } finally {
      setDigesting(false);
    }
  }

  return (
    <div>
      <div className="setting">
        <label>EverQuest log folder</label>
        <div className="row">
          <input className="field" value={settings.logDir} onChange={(e) => patch({ logDir: e.target.value })} />
          <button className="btn" onClick={browse}>
            Browse…
          </button>
        </div>
        <span className="hint">
          {status.watching ? `Watching ${fileName(status.file)}` : status.error ?? "Not watching"}
        </span>
      </div>

      <div className="setting">
        <label>Specific log file (optional)</label>
        <input
          className="field"
          placeholder="Auto — follow the most recently written eqlog_*.txt"
          value={settings.activeLogFile}
          onChange={(e) => patch({ activeLogFile: e.target.value })}
        />
        <span className="hint">Leave blank to auto-detect the active character.</span>
      </div>

      <div className="setting">
        <label>Digest a past log</label>
        <div className="row">
          <button className="btn" onClick={digestLog} disabled={digesting}>
            {digesting ? "Digesting…" : "Eat a log file…"}
          </button>
        </div>
        <span className="hint">
          Pick an old EverQuest log and fold its kills, drops and locations into your learned mob
          data (observed drop rates + roam areas) — without watching it live. Your live combat/session
          stats aren’t touched. Results appear right away: the Hunt tab pools every zone, while the map
          shows the zone you’re viewing (only kills the log placed with a nearby <kbd>/loc</kbd> get a marker).
          {digested && (
            <>
              {" "}
              <b>Digested {digested.kills} kills / {digested.drops} drops</b> from {fileName(digested.file)}.
            </>
          )}
        </span>
      </div>

      <div className="setting">
        <label>Match mode</label>
        <div className="row">
          {(["exact", "contains"] as const).map((m) => (
            <label key={m} className="row" style={{ gap: 4 }}>
              <input type="radio" name="match" checked={settings.matchMode === m} onChange={() => patch({ matchMode: m })} />
              {m}
            </label>
          ))}
        </div>
        <span className="hint">“exact” matches the whole item name; “contains” matches partial names.</span>
      </div>

      <div className="setting">
        <label>Window opacity — {(settings.overlay.opacity * 100).toFixed(0)}%</label>
        <input
          type="range"
          min={0.2}
          max={1}
          step={0.05}
          value={settings.overlay.opacity}
          onChange={(e) => patch({ overlay: { opacity: Number(e.target.value) } })}
        />
      </div>

      <div className="setting">
        <label>Interface scale — {(settings.overlay.fontScale * 100).toFixed(0)}%</label>
        <input
          type="range"
          min={UI_SCALE.min}
          max={UI_SCALE.max}
          step={UI_SCALE.step}
          value={settings.overlay.fontScale}
          onChange={(e) => patch({ overlay: { fontScale: Number(e.target.value) } })}
        />
        <span className="hint">
          100% is full size — the scale only goes down, since an overlay wants to take up less
          room, not more. Scales the whole interface (text, spacing and icons together), and
          applies to the map window too.
        </span>
      </div>

      <Toggle
        label="Keep completed items visible"
        checked={settings.overlay.showObtained}
        onChange={(v) => patch({ overlay: { showObtained: v } })}
      />
      <Toggle
        label="Follow your zone (auto-narrow to what's obtainable where you are)"
        checked={settings.overlay.followZone}
        onChange={(v) => patch({ overlay: { followZone: v } })}
      />
      <Toggle
        label="Damage meter: split spells by invocation as rows (not just on hover)"
        checked={settings.overlay.splitByMode}
        onChange={(v) => patch({ overlay: { splitByMode: v } })}
      />
      <Toggle
        label="Map: mark how trustworthy each kill's position is (right-click a marker to hide)"
        checked={settings.overlay.showKillConfidence}
        onChange={(v) => patch({ overlay: { showKillConfidence: v } })}
      />

      <Toggle
        label="Connect to the peer-to-peer network"
        checked={settings.connectPeers}
        onChange={(v) => patch({ connectPeers: v })}
      />
      <Toggle
        label="Share my location with other players"
        checked={settings.shareLocation}
        disabled={!settings.connectPeers}
        onChange={(v) => patch({ shareLocation: v })}
      />
      <div className="setting" style={{ paddingTop: 0, borderTop: "none" }}>
        <label>Player name</label>
        <input
          className="field"
          placeholder={derivedName || "Your character name"}
          value={settings.playerName}
          onChange={(e) => patch({ playerName: e.target.value })}
        />
        <span className="hint">
          Shown to peers when you click (ping) the map. Blank uses your log’s character name
          {derivedName ? ` (${derivedName})` : ""}.
        </span>
      </div>
      <div className="setting" style={{ paddingTop: 0, borderTop: "none" }}>
        <span className="hint">
          Off by default. <b>Connect</b> to see other players and ping the map — click a spot and your
          name shows there for everyone in that zone. <b>Share</b> also broadcasts your live position as
          you type <kbd>/loc</kbd>.
        </span>
        {settings.connectPeers && (
          <input
            className="field"
            placeholder="awari bootstrap URL — blank uses the default"
            value={settings.bootstrapUrl}
            onChange={(e) => patch({ bootstrapUrl: e.target.value })}
            style={{ marginTop: 6 }}
          />
        )}
      </div>

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
              <div className="row" key={w.id} style={{ gap: 6, marginBottom: 4 }}>
                <input type="checkbox" checked={w.enabled} onChange={(e) => updateWatch(w.id, { enabled: e.target.checked })} />
                <input
                  className="field"
                  value={w.spell}
                  placeholder="spell name (or part of it)"
                  onChange={(e) => updateWatch(w.id, { spell: e.target.value })}
                />
                <button className="btn ghost sm" title="Remove" onClick={() => removeWatch(w.id)}>
                  ✕
                </button>
              </div>
            ))}
            <div className="row" style={{ gap: 8, marginTop: 6 }}>
              <button className="btn sm" onClick={addWatch}>
                + Add spell
              </button>
              <button className="btn sm" onClick={() => api()?.alerts.test()} title="Preview the alert banner (and beep)">
                Test alert
              </button>
            </div>

            <div className="cast-suggest">
              <span className="hint" style={{ display: "block", margin: "10px 0 4px" }}>
                Suggested — common crowd control, grouped by effect. Many CC spells aren’t named
                “Fear” or “Charm” (this server’s root is <i>Instill</i>), so click to watch a whole
                family. ✓ means it’s already on your list.
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
                        onClick={() => addSuggestion(s.spell)}
                      >
                        {added ? "✓ " : "+ "}
                        {s.spell}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="setting">
        <span className="hint">
          Pin (always-on-top), minimize, and hide are on the title bar. Debug logging, the debug log,
          window reset, and Quit live in the system-tray icon.
        </span>
      </div>

      <div className="setting">
        <label>Shortcuts</label>
        <div className="hotkeys">
          {(info?.hotkeys ?? []).map((h) => (
            <div className="hotkey" key={h.action}>
              <kbd>{h.label}</kbd>
              <span>{h.action}</span>
              <span className={`hk-status ${h.registered ? "ok" : "bad"}`}>
                {h.registered ? "active" : "in use by another app"}
              </span>
            </div>
          ))}
          <div className="hotkey">
            <kbd>Esc</kbd>
            <span>Close the overlay / screengrab window</span>
            <span />
          </div>
        </div>
      </div>

      <div className="setting">
        <label>Screengrab item lookup</label>
        <span className="hint">
          Press <kbd>{screengrabLabel(info)}</kbd> (or the button below), then drag a box over an item
          name on screen (on any monitor). The text is read with OCR and dropped into the Search box
          here, so you can pick the item. The first lookup downloads the OCR model (~a few MB, needs
          internet) so it may take a moment; later lookups are fast. Turn on Debug logging above to
          print the recognized text to the console.
        </span>
        <div className="row" style={{ marginTop: 6 }}>
          <button className="btn" onClick={() => api()?.lookup.open()}>
            Test screengrab lookup
          </button>
        </div>
      </div>
    </div>
  );
}

function screengrabLabel(info: ReturnType<typeof useAppInfo>): string {
  return info?.hotkeys.find((h) => /screengrab/i.test(h.action))?.label ?? "Ctrl/Cmd+Shift+L";
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="setting">
      <label className="row" style={{ gap: 8, opacity: disabled ? 0.5 : 1 }}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    </div>
  );
}

function fileName(p?: string): string {
  if (!p) return "";
  return p.split(/[\\/]/).pop() ?? p;
}
