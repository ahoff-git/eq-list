"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { openMapWindow } from "@/lib/showOnMap";
import SearchPanel from "./components/SearchPanel";
import WindowButtons from "./components/WindowButtons";
import Titlebar from "./components/Titlebar";
import ScaleButtons from "./components/ScaleButtons";
import ListPanel from "./components/ListPanel";
import HuntPanel, { type HuntGrouping } from "./components/HuntPanel";
import SpawnPanel from "./components/SpawnPanel";
import SettingsPanel from "./components/SettingsPanel";
import SessionPanel from "./components/SessionPanel";
import AlertsPanel from "./components/AlertsPanel";
import type { Settings } from "@/shared/types";
import DamagePanel from "./components/DamagePanel";
import LootPanel from "./components/LootPanel";
import StatusBar from "./components/StatusBar";
import LandingView from "./components/LandingView";
import PinButton from "./components/PinButton";
import OpacityButton from "./components/OpacityButton";
import ClickThroughButton from "./components/ClickThroughButton";
import CastAlerts from "./components/CastAlerts";
import UpdateBanner from "./components/UpdateBanner";
import Toasts from "./components/Toasts";
import TabBar, { type TabItem } from "./components/TabBar";
import { useMaximized, useRendererDebug, useShoppingList, useSettings, useUiScale, useWindowOpacity } from "@/lib/hooks";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { NavProvider, useNav } from "@/lib/nav";
import { PASS_THROUGH, useClickThrough } from "@/lib/clickThrough";
import { useWindowPin } from "@/lib/windowToggles";
import AwariHost from "@/lib/awari/host";
import { OVERLAY_HOTKEY, UI_SCALE } from "@/shared/constants";

type Tab = "list" | "hunt" | "timers" | "loot" | "search" | "damage" | "session" | "alerts" | "settings";

/**
 * The single app window: a frameless, translucent float (the "overlay" look) that
 * hosts everything — list, hunt, search, session, settings. The titlebar is the
 * drag handle (`Titlebar`: snaps at the screen edges, maximizes on a double-click) and
 * carries the window controls (pin / minimize / hide-to-tray).
 */
export default function Home() {
  const [tab, setTab] = usePersistentState<Tab>(STORAGE_KEYS.activeTab, "list");
  // Text handed to the Search box from outside it (see the onPrefill effect). Held here
  // because SearchPanel is unmounted while another tab shows, and cleared as soon as it
  // takes it — a prefill left sitting here would be re-applied by every later mount.
  const [prefill, setPrefill] = useState<string | null>(null);
  // Undetermined until mounted (keeps SSR/first-client render consistent).
  const [inElectron, setInElectron] = useState<boolean | null>(null);
  const list = useShoppingList();
  // Squares the window's corners while maximized (see globals.css).
  const maximized = useMaximized();
  const settings = useSettings();
  // This window owns the awari connection, so its diagnostics are the ones worth having.
  useRendererDebug();
  // Pin, ◐ and 👻 are all *this window's* remembered state, restored by main when it opens and
  // written back as you flip them (ADR 0074) — the map keeps its own answers to the same three.
  const { pinned, toggle: togglePinned } = useWindowPin();
  const sliderOpacity = settings?.overlay.opacity ?? 1;
  // Scale lives in settings (main applies it as the window's zoom factor); the titlebar just
  // nudges it, so the Settings slider and these buttons are the same one value. The map window
  // has its own, stepped by its own copy of these buttons.
  const uiScale = settings?.overlay.fontScale ?? UI_SCALE.max;
  // This window scales itself: the scale is a CSS zoom per document, because Chromium's own zoom
  // is per-origin and every window here shares one (see `useUiScale`).
  useUiScale(settings?.overlay.fontScale);
  // The ◐ override: this window at 100% rather than the settings slider. The map window has its own
  // over the same saved value, so flipping one window solid leaves the other as it was.
  const { opaque, toggle: toggleOpaque } = useWindowOpacity(settings ? sliderOpacity : undefined);
  // Clicks over the panel go to the game; the titlebar, tabs and status bar stay ours.
  const clickThrough = useClickThrough();
  // Owned here so the Hunt tab's zone filter survives switching tabs (and, persisted,
  // reopening the window).
  const [huntZone, setHuntZone] = usePersistentState<string | null>(STORAGE_KEYS.huntZone, null);
  // And which question it's answering — by zone ("what does a trip there get me?") or by item
  // ("where is this likeliest to drop?"). Owned here for the same reason, and defaulting to zone
  // because that is the view the tab has always opened on.
  const [huntGrouping, setHuntGrouping] = usePersistentState<HuntGrouping>(STORAGE_KEYS.huntGrouping, "zone");

  // Stable so NavProvider's callbacks (and thus `nav`'s identity) don't churn each render
  // (`setTab` is a stable state setter).
  const showSearch = useCallback(() => setTab("search"), [setTab]);
  const prefillUsed = useCallback(() => setPrefill(null), []);

  useEffect(() => {
    setInElectron(!!api());
  }, []);

  // A screengrab lookup fills the Search box with OCR'd text and jumps here (so does a
  // name clicked in the map window, which has no search of its own).
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.search.onPrefill((text) => {
      setTab("search");
      setPrefill(text);
    });
  }, [setTab]);

  const tabItems: TabItem[] = [
    { key: "list", label: list.entries.length ? `List (${list.entries.length})` : "List" },
    { key: "hunt", label: "Hunt" },
    // Beside Hunt, which is the tool it belongs with. `TabBar` collapses from the *end*, so a
    // ninth tab put after Settings would be the first one to disappear at the default width —
    // and a timer you cannot see is worse than no timer (ADR 0092).
    { key: "timers", label: "Timers" },
    { key: "loot", label: "Loot" },
    // Fourth, not last but one. `TabBar` collapses whatever doesn't fit into its » menu from the
    // **end**, and at the window's default width only six tabs fit — so putting alerts after
    // Settings would have left the feature *less* reachable than when it was a group inside
    // Settings. The count is the *enabled* rules, since that's what's live, and "off" is worth
    // saying out loud here: a silent overlay looks identical to one with nothing to say.
    { key: "alerts", label: alertsLabel(settings?.castAlerts) },
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

      <div className={`app glass ${maximized ? "maximized" : ""}`}>
        <Titlebar>
          <h1>
            <span className="mark">EQ</span> List
          </h1>
          <span className="spacer" />
          <div className="win-controls no-drag">
            <button className="wc" title="Open map window" onClick={openMapWindow}>
              🗺
            </button>
            <ScaleButtons
              scale={uiScale}
              onScale={(next) => api()?.settings.update({ overlay: { fontScale: next } })}
            />
            <OpacityButton opaque={opaque} opacity={sliderOpacity} onToggle={toggleOpaque} />
            <ClickThroughButton on={clickThrough.on} what="the list" onToggle={clickThrough.toggle} />
            <PinButton
              pinned={pinned}
              onToggle={togglePinned}
              title={`Always on top: ${pinned ? "on" : "off"} · ${OVERLAY_HOTKEY.label} shows/hides`}
            />
            {/* Hide, not close: the app keeps watching the log from the tray. */}
            <WindowButtons dismissTitle="Hide to tray" dismiss={() => api()?.win.hide()} />
          </div>
        </Titlebar>

        <UpdateBanner />

        <TabBar items={tabItems} active={tab} onSelect={(k) => setTab(k as Tab)} />

        {/* The one region click-through hands to the game — see `PASS_THROUGH`. */}
        <div className="panel" {...PASS_THROUGH}>
          {tab === "list" && <ListPanel />}
          {tab === "hunt" && (
            <HuntPanel
              pickedZone={huntZone}
              onPickedZone={setHuntZone}
              grouping={huntGrouping}
              onGrouping={setHuntGrouping}
            />
          )}
          {tab === "timers" && <SpawnPanel />}
          {tab === "loot" && <LootPanel />}
          {tab === "search" && <SearchPanel prefill={prefill} onPrefillUsed={prefillUsed} />}
          {tab === "damage" && <DamagePanel />}
          {tab === "session" && <SessionPanel />}
          {tab === "alerts" && <AlertsPanel />}
          {tab === "settings" && <SettingsPanel />}
        </div>

        <StatusBar />
      </div>

      {/* Outside `.app`, which clips its children (`overflow: hidden`): a notice is drawn over the
          window, not inside the panel that raised it — so it survives switching tabs. */}
      <Toasts />
    </NavProvider>
  );
}

/**
 * What the Alerts tab says about itself: how many rules are live, or that none of them are.
 *
 * `(off)` earns its place because the failure it describes is invisible — an overlay with alerts
 * switched off looks exactly like one with nothing to warn you about, and you'd only find out during
 * the fight where it mattered.
 */
function alertsLabel(alerts: Settings["castAlerts"] | undefined): string {
  if (!alerts) return "Alerts";
  if (!alerts.enabled) return "Alerts (off)";
  const live = alerts.watches.filter((w) => w.enabled).length;
  return live ? `Alerts (${live})` : "Alerts";
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
