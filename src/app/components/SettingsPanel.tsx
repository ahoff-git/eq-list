"use client";
import { useSettings, useWatcherStatus, useAppInfo } from "@/lib/hooks";
import { api } from "@/lib/api";
import { OVERLAY_HOTKEY } from "@/shared/constants";
import type { DeepPartial, Settings } from "@/shared/types";

/** Log location, match strictness, overlay look, and the debug toggle. */
export default function SettingsPanel() {
  const settings = useSettings();
  const status = useWatcherStatus();
  const info = useAppInfo();

  if (!settings) return <p className="muted">Loading settings…</p>;

  const patch = (p: DeepPartial<Settings>) => api()?.settings.update(p);

  async function browse() {
    const dir = await api()?.settings.pickLogDir();
    if (dir) patch({ logDir: dir });
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
        <label>Overlay opacity — {(settings.overlay.opacity * 100).toFixed(0)}%</label>
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
        <label>Overlay text size — {(settings.overlay.fontScale * 100).toFixed(0)}%</label>
        <input
          type="range"
          min={0.8}
          max={1.6}
          step={0.1}
          value={settings.overlay.fontScale}
          onChange={(e) => patch({ overlay: { fontScale: Number(e.target.value) } })}
        />
      </div>

      <Toggle
        label="Overlay always on top"
        checked={settings.overlay.alwaysOnTop}
        onChange={(v) => patch({ overlay: { alwaysOnTop: v } })}
      />
      <Toggle
        label={`Overlay click-through (ignore mouse) — ${OVERLAY_HOTKEY.label} still hides it`}
        checked={settings.overlay.clickThrough}
        onChange={(v) => patch({ overlay: { clickThrough: v } })}
      />
      <Toggle
        label="Keep completed items on the overlay"
        checked={settings.overlay.showObtained}
        onChange={(v) => patch({ overlay: { showObtained: v } })}
      />
      <Toggle
        label="Debug logging"
        checked={settings.debug}
        onChange={(v) => patch({ debug: v })}
      />
      <div className="setting" style={{ paddingTop: 0, borderTop: "none" }}>
        <div className="row">
          <button className="btn" onClick={() => api()?.app.openLog()}>
            Open debug log
          </button>
        </div>
        <span className="hint">
          Logs are written to a file (open above) as well as the launching terminal. Enable Debug
          logging, reproduce the issue (e.g. a screengrab), then open the log.
        </span>
      </div>

      <div className="setting">
        <label>Windows</label>
        <div className="row">
          <button className="btn" onClick={() => api()?.win.resetPositions()}>
            Reset window positions
          </button>
        </div>
        <span className="hint">Recenter the control window and overlay if they end up off-screen.</span>
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

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="setting">
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    </div>
  );
}

function fileName(p?: string): string {
  if (!p) return "";
  return p.split(/[\\/]/).pop() ?? p;
}
