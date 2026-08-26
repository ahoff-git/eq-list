"use client";
import { useState } from "react";
import { useAppInfo, useSettings } from "@/lib/hooks";
import { api } from "@/lib/api";
import { MAP_UI_SCALE, OVERLAY_OPACITY, UI_SCALE } from "@/shared/constants";
import LogSettings from "./LogSettings";
import SelfCheck from "./SelfCheck";
import DataHealth from "./DataHealth";
import { percent } from "@/shared/format";
import { CheckField } from "./ui";
import type { DeepPartial, Settings } from "@/shared/types";

/**
 * Log location, match strictness, overlay look, and the debug toggle.
 *
 * Alerts used to be here and are their own tab now (`AlertsPanel`): a rule is something you build and
 * come back to, not a preference you set once, and it had grown to several screens of its own. **Peer
 * networking went the same way** and for a sharper reason — it wasn't only large, it was *scattered*:
 * the connection and the name here, two share toggles on the map toolbar, the rest in the Peers tab.
 * One subject with three homes ([ADR 0146](../../../specs/decisions/0146-one-home-for-the-peer-network.md)).
 */
export default function SettingsPanel() {
  const settings = useSettings();
  const info = useAppInfo();

  if (!settings) return <p className="muted">Loading settings…</p>;

  const patch = (p: DeepPartial<Settings>) => api()?.settings.update(p);

  return (
    <div>
      {/* First, deliberately. Settings is where you land when something isn't working, and the
          check's answer is nearly always about the controls immediately below it — so it reads
          diagnosis first, then the knobs that fix what it named. */}
      <SelfCheck />
      <LogSettings settings={settings} patch={patch} />
      {/* Above Forget, deliberately: "this needs re-reading" and "throw this away" are neighbouring
          thoughts, and the recoverable one should be met first. */}
      <DataHealth />
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

/** A setting that's a yes or a no: the shared `CheckField`, in the frame every setting sits in. */
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
      <CheckField className="setting-check" label={label} checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

