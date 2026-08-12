"use client";
import { useState } from "react";
import { useAppInfo, useSettings, useWatcherStatus } from "@/lib/hooks";
import { api } from "@/lib/api";
import { characterFromLogFile } from "@/shared/log-parser";
import { MAP_UI_SCALE, OVERLAY_OPACITY, UI_SCALE } from "@/shared/constants";
import CastAlertSettings from "./CastAlertSettings";
import LogSettings from "./LogSettings";
import { percent } from "@/shared/format";
import type { DeepPartial, Settings } from "@/shared/types";

/** Log location, match strictness, overlay look, and the debug toggle. */
export default function SettingsPanel() {
  const settings = useSettings();
  const status = useWatcherStatus();
  const info = useAppInfo();

  if (!settings) return <p className="muted">Loading settings…</p>;

  const patch = (p: DeepPartial<Settings>) => api()?.settings.update(p);
  const derivedName = characterFromLogFile(status.file) ?? "";

  return (
    <div>
      <LogSettings settings={settings} patch={patch} />
      <ForgetData />

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
        <label>Window opacity — {percent(settings.overlay.opacity)}</label>
        <input
          type="range"
          min={OVERLAY_OPACITY.min}
          max={OVERLAY_OPACITY.max}
          step={OVERLAY_OPACITY.step}
          value={settings.overlay.opacity}
          onChange={(e) => patch({ overlay: { opacity: Number(e.target.value) } })}
        />
        <span className="hint">
          One look for every window. Each window&apos;s ◐ button flips <em>that</em> window to fully
          opaque on its own, so you can read the map through clear glass while the list stays
          translucent — a moment&apos;s override, not a saved setting.
        </span>
      </div>

      <div className="setting">
        <label>Interface scale — {percent(settings.overlay.fontScale)}</label>
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
          room, not more. Scales the whole interface (text, spacing and icons together). The map
          window has its own, below.
        </span>
      </div>

      <div className="setting">
        <label>Map window scale — {percent(settings.overlay.mapFontScale)}</label>
        <input
          type="range"
          min={MAP_UI_SCALE.min}
          max={MAP_UI_SCALE.max}
          step={MAP_UI_SCALE.step}
          value={settings.overlay.mapFontScale}
          onChange={(e) => patch({ overlay: { mapFontScale: Number(e.target.value) } })}
        />
        <span className="hint">
          Kept separate because the two windows want different sizes: the list is text you shrink
          to reclaim desk space, the map is a picture you want as large as it will go — so this one
          goes past 100%, up to {percent(MAP_UI_SCALE.max)}. Either window&apos;s
          A− / A+ buttons move its own value.
        </span>
      </div>

      <Toggle
        label="Keep completed items visible"
        checked={settings.overlay.showObtained}
        onChange={(v) => patch({ overlay: { showObtained: v } })}
      />
      <Toggle
        label="Hunt tab: follow your zone (auto-narrow to what's obtainable where you are)"
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

      <CastAlertSettings settings={settings} patch={patch} />

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

/**
 * Forgetting recorded data — and the **second question** that guards what it taught.
 *
 * The records (individual kills, the loot feed) are replaceable: eat the logs again. The
 * observations built from them — drop rates over hundreds of kills, roam areas, vendor prices —
 * are not, once the logs are gone. So the first click never touches them, and taking them needs a
 * separate, differently-worded answer (ADR 0056). No native confirm dialog: this window is
 * always-on-top over the game, and a modal there is a blackout (ADR 0052).
 */
function ForgetData() {
  const [asking, setAsking] = useState(false);
  const [done, setDone] = useState("");

  async function forget(scope: "records" | "everything") {
    await api()?.kills.clear(scope);
    setAsking(false);
    setDone(scope === "everything" ? "Forgot the records and everything they taught." : "Forgot the records. Observations kept.");
  }

  return (
    <div className="setting">
      <label>Forget recorded data</label>
      {asking ? (
        <div className="row wrap">
          <button className="btn" onClick={() => void forget("records")}>
            Keep observations
          </button>
          <button className="btn danger" onClick={() => void forget("everything")}>
            Forget observations too
          </button>
          <button className="btn ghost" onClick={() => setAsking(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="row">
          <button className="btn" onClick={() => { setDone(""); setAsking(true); }}>
            Forget kills and loot…
          </button>
        </div>
      )}
      <span className="hint">
        {asking ? (
          <>
            This clears your recorded kills and the loot feed. <b>Observations</b> — every observed
            drop rate, roam area and vendor price learned from them — can be kept: they took months
            of play to gather and can’t be rebuilt from logs you no longer have. Eating your logs
            again restores the records either way.
          </>
        ) : (
          <>
            Clears the individual kill records and the loot feed. You’ll be asked separately whether
            to keep what they taught. {done && <b>{done}</b>}
          </>
        )}
      </span>
    </div>
  );
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

