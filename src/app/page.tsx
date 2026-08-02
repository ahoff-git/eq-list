"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import SearchPanel from "./components/SearchPanel";
import ListPanel from "./components/ListPanel";
import HuntPanel from "./components/HuntPanel";
import SettingsPanel from "./components/SettingsPanel";
import SessionPanel from "./components/SessionPanel";
import DamagePanel from "./components/DamagePanel";
import LootPanel from "./components/LootPanel";
import StatusBar from "./components/StatusBar";
import LandingView from "./components/LandingView";
import PinButton from "./components/PinButton";
import CastAlerts from "./components/CastAlerts";
import UpdateBanner from "./components/UpdateBanner";
import TabBar, { type TabItem } from "./components/TabBar";
import { useRendererDebug, useShoppingList, useSettings } from "@/lib/hooks";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { NavProvider, useNav } from "@/lib/nav";
import AwariHost from "@/lib/awari/host";
import { OVERLAY_HOTKEY, UI_SCALE, clampUiScale } from "@/shared/constants";

type Tab = "list" | "hunt" | "loot" | "search" | "damage" | "session" | "settings";

/**
 * The single app window: a frameless, translucent float (the "overlay" look) that
 * hosts everything — list, hunt, search, session, settings. The titlebar is the
 * drag handle and carries the window controls (pin / minimize / hide-to-tray).
 */
export default function Home() {
  const [tab, setTab] = usePersistentState<Tab>(STORAGE_KEYS.activeTab, "list");
  const [prefill, setPrefill] = useState<{ text: string; n: number } | null>(null);
  // Undetermined until mounted (keeps SSR/first-client render consistent).
  const [inElectron, setInElectron] = useState<boolean | null>(null);
  const list = useShoppingList();
  const settings = useSettings();
  // This window owns the awari connection, so its diagnostics are the ones worth having.
  useRendererDebug();
  const pinned = settings?.overlay.alwaysOnTop ?? true;
  const sliderOpacity = settings?.overlay.opacity ?? 1;
  // Scale lives in settings (main applies it as the window's zoom factor); the titlebar just
  // nudges it, so the Settings slider and these buttons are the same one value.
  const uiScale = settings?.overlay.fontScale ?? UI_SCALE.max;
  const stepUiScale = (direction: number) => {
    const next = clampUiScale(uiScale + direction * UI_SCALE.step);
    if (next !== uiScale) api()?.settings.update({ overlay: { fontScale: next } });
  };
  // Transient "full opacity" toggle: flip between 100% and the settings slider value.
  const [opaque, setOpaque] = useState(false);
  // Owned here so the Hunt tab's zone filter survives switching tabs (and, persisted,
  // reopening the window).
  const [huntZone, setHuntZone] = usePersistentState<string | null>(STORAGE_KEYS.huntZone, null);

  // Stable so NavProvider's callbacks (and thus `nav`'s identity) don't churn each render
  // (`setTab` is a stable state setter).
  const showSearch = useCallback(() => setTab("search"), [setTab]);

  useEffect(() => {
    setInElectron(!!api());
  }, []);

  // Apply the live opacity (overrides the main-process value while toggled opaque).
  useEffect(() => {
    api()?.win.setOpacity(opaque ? 1 : sliderOpacity);
  }, [opaque, sliderOpacity]);

  // A screengrab lookup fills the Search box with OCR'd text and jumps here.
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.search.onPrefill((text) => {
      setTab("search");
      setPrefill({ text, n: Date.now() });
    });
  }, [setTab]);

  const tabItems: TabItem[] = [
    { key: "list", label: list.entries.length ? `List (${list.entries.length})` : "List" },
    { key: "hunt", label: "Hunt" },
    { key: "loot", label: "Loot" },
    { key: "search", label: "Search" },
    { key: "damage", label: "Damage" },
    { key: "session", label: "Session" },
    { key: "settings", label: "Settings" },
  ];

  if (inElectron === null) return null; // brief pre-mount frame
  if (!inElectron) return <LandingView />;

  return (
    <NavProvider onOpen={showSearch}>
      <NavKeys />
      <AwariHost />
      {/* Beep only — the banner + flash live in the dedicated click-through overlay window
          (/alert), which floats over the game. This window is the always-alive one that can
          reliably play the sound. */}
      <CastAlerts showVisual={false} />

      <div className="app glass">
        <div className="titlebar">
          <h1>
            <span className="mark">EQ</span> List
          </h1>
          <span className="spacer" />
          <div className="win-controls no-drag">
            <button className="wc" title="Open map window" onClick={() => api()?.map.open()}>
              🗺
            </button>
            <button
              className="wc"
              title={`Smaller interface — ${Math.round(uiScale * 100)}%`}
              onClick={() => stepUiScale(-1)}
              disabled={uiScale <= UI_SCALE.min}
            >
              A−
            </button>
            <button
              className="wc"
              title={`Larger interface — ${Math.round(uiScale * 100)}% (100% is full size)`}
              onClick={() => stepUiScale(1)}
              disabled={uiScale >= UI_SCALE.max}
            >
              A+
            </button>
            <button
              className={`wc ${opaque ? "on" : ""}`}
              title={
                opaque
                  ? "Opacity: 100% — click for translucent"
                  : `Opacity: ${Math.round(sliderOpacity * 100)}% — click for fully opaque`
              }
              onClick={() => setOpaque((o) => !o)}
            >
              ◐
            </button>
            <PinButton
              pinned={pinned}
              onToggle={() => api()?.settings.update({ overlay: { alwaysOnTop: !pinned } })}
              title={`Always on top: ${pinned ? "on" : "off"} · ${OVERLAY_HOTKEY.label} shows/hides`}
            />
            <button className="wc" title="Minimize" onClick={() => api()?.win.minimize()}>
              —
            </button>
            <button className="wc" title="Hide to tray" onClick={() => api()?.win.hide()}>
              ✕
            </button>
          </div>
        </div>

        <UpdateBanner />

        <TabBar items={tabItems} active={tab} onSelect={(k) => setTab(k as Tab)} />

        <div className="panel">
          {tab === "list" && <ListPanel />}
          {tab === "hunt" && <HuntPanel pickedZone={huntZone} onPickedZone={setHuntZone} />}
          {tab === "loot" && <LootPanel />}
          {tab === "search" && <SearchPanel prefill={prefill} />}
          {tab === "damage" && <DamagePanel />}
          {tab === "session" && <SessionPanel />}
          {tab === "settings" && <SettingsPanel />}
        </div>

        <StatusBar />
      </div>
    </NavProvider>
  );
}

/**
 * Browser-style back/forward for the in-app page history: the mouse thumb buttons
 * (forwarded from main as `app-command`) and Alt+←/→. Rendered inside NavProvider
 * so it can drive the shared history; renders nothing.
 */
function NavKeys() {
  const nav = useNav();
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.nav.onCommand((dir) => (dir === "back" ? nav.back() : nav.forward()));
  }, [nav]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nav.back();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nav.forward();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);
  return null;
}
