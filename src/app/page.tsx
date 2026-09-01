"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { openMapWindow } from "@/lib/showOnMap";
import SearchPanel from "./components/SearchPanel";
import ItemSearchPanel from "./components/ItemSearchPanel";
import WindowButtons from "./components/WindowButtons";
import Titlebar from "./components/Titlebar";
import ScaleButtons from "./components/ScaleButtons";
import ListPanel from "./components/ListPanel";
import HuntPanel, { type HuntGrouping } from "./components/HuntPanel";
import SpawnPanel from "./components/SpawnPanel";
import BuffPanel from "./components/BuffPanel";
import SettingsPanel from "./components/SettingsPanel";
import SessionPanel from "./components/SessionPanel";
import AlertsPanel from "./components/AlertsPanel";
import type { AwariPeer, BuffView, Settings } from "@/shared/types";
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
import PeersPanel from "./components/PeersPanel";
import PeerOfferToasts from "./components/PeerOfferToasts";
import PeerVersionToast from "./components/PeerVersionToast";
import { useBuffs, useMaximized, useRendererDebug, useShoppingList, useSettings, useUiScale, useWindowOpacity } from "@/lib/hooks";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { NavProvider, useNav } from "@/lib/nav";
import { PASS_THROUGH, useClickThrough } from "@/lib/clickThrough";
import { useWindowPin } from "@/lib/windowToggles";
import AwariHost from "@/lib/awari/host";
import { OVERLAY_HOTKEY, UI_SCALE } from "@/shared/constants";

type Tab = "list" | "hunt" | "timers" | "buffs" | "loot" | "search" | "items" | "damage" | "session" | "alerts" | "peers" | "settings";

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
  // Read here rather than only in the panel, so the tab itself can say how many buffs are down —
  // the one number in this feature that is worth seeing without opening it.
  const buffs = useBuffs();
  // Only the roster, for the tab's own count — the panel does its own reading. Cheap: it's a
  // brokered event this window is already receiving as the connection's owner.
  const [peers, setPeers] = useState<AwariPeer[]>([]);
  /**
   * The peer an offer notice sent us to look at, so the Peers tab can pick their row out
   * ([ADR 0143](../../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)).
   *
   * Cleared on **leaving** the tab rather than after a timeout: the highlight answers "which of
   * these was it?", and that question stays open for as long as the reader is still on the screen
   * that asked it.
   */
  const [focusPeer, setFocusPeer] = useState<string | null>(null);
  const viewPeer = useCallback(
    (peerId: string) => {
      setFocusPeer(peerId);
      setTab("peers");
    },
    [setTab],
  );
  useEffect(() => {
    if (tab !== "peers") setFocusPeer(null);
  }, [tab]);
  useEffect(() => {
    const a = api();
    if (!a) return;
    const offPeers = a.awari.onPeers(setPeers);
    const offStatus = a.awari.onStatus((s) => {
      if (!s.connected) setPeers([]);
    });
    return () => {
      offPeers();
      offStatus();
    };
  }, []);
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
    // Beside Timers, because it is the same kind of thing: a board of what is running out. It goes
    // *before* Loot for the same reason Timers goes before Alerts — `TabBar` collapses from the end,
    // and a buff that dropped is something you need to see mid-fight, which is exactly when you
    // cannot go hunting through a » menu for it. The count is what is currently **missing**, since
    // that is the only number here anyone acts on.
    { key: "buffs", label: buffsLabel(buffs) },
    { key: "loot", label: "Loot" },
    // Fourth, not last but one. `TabBar` collapses whatever doesn't fit into its » menu from the
    // **end**, and at the window's default width only six tabs fit — so putting alerts after
    // Settings would have left the feature *less* reachable than when it was a group inside
    // Settings. The count is the *enabled* rules, since that's what's live, and "off" is worth
    // saying out loud here: a silent overlay looks identical to one with nothing to say.
    { key: "alerts", label: alertsLabel(settings?.castAlerts) },
    { key: "search", label: "Search" },
    // Straight after Search, because it is the same drawer opened from the other side: Search finds
    // the page for a name you have, Items finds the name for a shape you want. Neither is wanted
    // mid-fight, so both sit late enough that `TabBar` may fold them into the » menu.
    { key: "items", label: "Items" },
    { key: "damage", label: "Damage" },
    { key: "session", label: "Session" },
    // Before Settings, and after everything you look at while playing. It is the same kind of thing
    // as Settings — a place you go to decide something and then leave — but it also has a live half
    // (who is here, what has arrived), which is why it isn't a group inside it
    // ([ADR 0141](../../specs/decisions/0141-the-room-is-a-meeting-place.md)). `TabBar` collapses
    // from the end, so this and Settings are the two that go into the » menu first, which is right:
    // neither is needed mid-fight.
    { key: "peers", label: peersLabel(peers.length, settings?.connectPeers) },
    { key: "settings", label: "Settings" },
  ];

  if (inElectron === null) return null; // brief pre-mount frame
  if (!inElectron) return <LandingView />;

  return (
    <NavProvider onOpen={showSearch}>
      <NavKeys />
      <AwariHost />
      {/* Mounted by the shell, not by the Peers tab: a notice about a tab you aren't on has to come
          from something that is always mounted. */}
      <PeerOfferToasts onView={viewPeer} />
      {/* Says once, if ever, that this build is behind the room — and points at the tab where the
          rows say which peers it is behind. */}
      <PeerVersionToast onView={() => setTab("peers")} />
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
          {tab === "buffs" && <BuffPanel />}
          {tab === "loot" && <LootPanel />}
          {tab === "search" && <SearchPanel prefill={prefill} onPrefillUsed={prefillUsed} />}
          {tab === "items" && <ItemSearchPanel />}
          {tab === "damage" && <DamagePanel />}
          {tab === "session" && <SessionPanel />}
          {tab === "alerts" && <AlertsPanel />}
          {tab === "peers" && <PeersPanel focusPeer={focusPeer} />}
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
 * What the Peers tab says about itself: how many other people are in the room.
 *
 * `(off)` for the same reason Alerts has one — a room with nobody in it and a connection that was
 * never switched on look identical from the tab strip, and only one of them is worth opening. The
 * count is silent at zero, because "nobody yet" is the resting state of a small room and a permanent
 * `(0)` would stop being read.
 */
function peersLabel(peers: number, connected: boolean | undefined): string {
  if (!connected) return "Peers (off)";
  return peers ? `Peers (${peers})` : "Peers";
}

/**
 * What the Buffs tab says about itself: how many of the buffs you keep up are **currently missing**.
 *
 * Deliberately the lapsed count and not the tracked one. "Buffs (14)" would be a boast about how many
 * spells the app knows, which nobody needs on a tab; "Buffs (2)" means two things are down and is the
 * whole reason to look. Silent when everything is up, because a number that is always there stops
 * being read.
 */
function buffsLabel(view: BuffView): string {
  const down = view.lapsed.length;
  return down ? `Buffs (${down})` : "Buffs";
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
