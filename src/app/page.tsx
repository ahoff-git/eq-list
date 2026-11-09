"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { openMapWindow } from "@/lib/map/showOnMap";
import SearchPanel from "@/app/components/items/SearchPanel";
import ItemSearchPanel from "@/app/components/items/ItemSearchPanel";
import SpellSearchPanel from "@/app/components/spells/SpellSearchPanel";
import StancesPanel from "@/app/components/spells/StancesPanel";
import AAPanel from "@/app/components/aa/AAPanel";
import TradeskillsPanel from "@/app/components/tradeskills/TradeskillsPanel";
import CraftingLogPanel from "@/app/components/tradeskills/CraftingLogPanel";
import GameExportsPanel from "@/app/components/exports/GameExportsPanel";
import WindowButtons from "@/app/components/chrome/WindowButtons";
import Titlebar from "@/app/components/chrome/Titlebar";
import ScaleButtons from "@/app/components/chrome/ScaleButtons";
import ListPanel from "@/app/components/items/ListPanel";
import NowOverview from "@/app/components/now/NowOverview";
import HuntPanel, { type HuntGrouping } from "@/app/components/mob/HuntPanel";
import SpawnPanel from "@/app/components/mob/SpawnPanel";
import GoalsPanel from "@/app/components/goals/GoalsPanel";
import AchievementsPanel from "@/app/components/achievements/AchievementsPanel";
import BuffPanel from "@/app/components/buffs/BuffPanel";
import SettingsPanel from "@/app/components/chrome/SettingsPanel";
import SessionPanel from "@/app/components/combat/SessionPanel";
import AlertsPanel from "@/app/components/alerts/AlertsPanel";
import type { AwariPeer, BuffView, Settings } from "@/shared/types";
import DamagePanel from "@/app/components/combat/DamagePanel";
import LootPanel from "@/app/components/items/LootPanel";
import FactionPanel from "@/app/components/faction/FactionPanel";
import StatusBar from "@/app/components/chrome/StatusBar";
import StaleExportChip from "@/app/components/exports/StaleExportChip";
import DamageTakenChip from "@/app/components/combat/DamageTakenChip";
import { DEFAULT_DAMAGE_WINDOW, type DamageWindow } from "@/shared/combat/damage-window";
import PinButton from "@/app/components/chrome/PinButton";
import OpacityButton from "@/app/components/chrome/OpacityButton";
import ClickThroughButton from "@/app/components/chrome/ClickThroughButton";
import CastAlerts from "@/app/components/alerts/CastAlerts";
import UpdateBanner from "@/app/components/chrome/UpdateBanner";
import ReleaseBanner from "@/app/components/chrome/ReleaseBanner";
import WhatsNewPanel from "@/app/components/help/WhatsNewPanel";
import HowToPanel from "@/app/components/help/HowToPanel";
import { useReleases } from "@/lib/releases/useReleases";
import { MAP_WINDOW } from "@/shared/help/guide";
import WebDownloadBanner from "@/app/components/chrome/WebDownloadBanner";
import Toasts from "@/app/components/chrome/Toasts";
import TabBar, { type TabItem } from "@/app/components/chrome/TabBar";
import SearchBar, { type JumpTarget } from "@/app/components/chrome/SearchBar";
import PeersPanel from "@/app/components/peers/PeersPanel";
import PeerOfferToasts from "@/app/components/peers/PeerOfferToasts";
import AchievementAlertToasts from "@/app/components/achievements/AchievementAlertToasts";
import PeerVersionToast from "@/app/components/peers/PeerVersionToast";
import RaceUnlockAlerts from "@/app/components/faction/RaceUnlockAlerts";
import { useAchievementsRunning, useBuffs, useCapabilities, useGoalsRunning, useMaximized, useRendererDebug, useShoppingList, useSettings, useTradeskillProgress, useUiScale, useWatcherStatus, useWindowOpacity } from "@/lib/hooks";
import { usePersistentState } from "@/lib/usePersistentState";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { NavProvider, useNav } from "@/lib/chrome/nav";
import { useScrollMemory } from "@/lib/chrome/useScrollMemory";
import { OwnershipProvider } from "@/lib/exports/ownership";
import NavBar from "@/app/components/chrome/NavBar";
import { AREAS, SECTION_NAMES, areaOf, sectionToOpen, type AreaKey } from "@/shared/chrome/areas";
import { PASS_THROUGH, useClickThrough } from "@/lib/chrome/clickThrough";
import { useWindowPin } from "@/lib/chrome/windowToggles";
import AwariHost from "@/lib/awari/host";
import { OVERLAY_HOTKEY, UI_SCALE } from "@/shared/constants";
import { answerDeathsPage, offerStatsRead } from "@/lib/stats-read";
import { restoreStatsRecord } from "@/lib/items/stats-record";
import { characterFromLogFile } from "@/shared/log-parser";
import { useStatsStore } from "@/lib/items/stats-stamp";
import StaleStatsChip from "@/app/components/items/StaleStatsChip";
import StatBuffWatcher from "@/app/components/items/StatBuffWatcher";
import { showToast } from "@/lib/toast";
import { readNotice, wrongCharacter } from "@/shared/items/stats-read-notice";

type Tab = "overview" | "list" | "hunt" | "timers" | "goals" | "achievements" | "buffs" | "loot" | "faction" | "search" | "items" | "spells" | "stances" | "aa" | "tradeskills" | "crafting" | "combat" | "session" | "exports" | "alerts" | "peers" | "settings" | "help" | "updates";

/**
 * The app. This route *is* the app now, in Electron and in a plain browser tab alike — `api()`
 * always answers (Electron's bridge, or `src/lib/web-api.ts`), and `ControlWindow` asks
 * `useCapabilities()` for what this particular host can actually do rather than the renderer
 * branching on which host it is.
 */
export default function Home() {
  return (
    <NavProvider>
      <OwnershipProvider>
        <ControlWindow />
      </OwnershipProvider>
    </NavProvider>
  );
}

/**
 * The single app window: a frameless, translucent float (the "overlay" look) that
 * hosts everything — list, hunt, search, session, settings. The titlebar is the
 * drag handle (`Titlebar`: snaps at the screen edges, maximizes on a double-click) and
 * carries the window controls (pin / minimize / hide-to-tray).
 *
 * **Which tab shows is `nav`'s**, not this component's: a tab is one place on the trail that back
 * walks (ADR 0173), and a tab owned here would be a move the trail never recorded.
 */
function ControlWindow() {
  const nav = useNav();
  // Text handed to the Search box from outside it (see the onPrefill effect). Held here
  // because SearchPanel is unmounted while another tab shows, and cleared as soon as it
  // takes it — a prefill left sitting here would be re-applied by every later mount.
  const [prefill, setPrefill] = useState<string | null>(null);
  const list = useShoppingList();
  // Read here rather than only in the panel, so the tab itself can say how many buffs are down —
  // the one number in this feature that is worth seeing without opening it.
  const buffs = useBuffs();
  // The Crafting log section's count — sittings your log records.
  const crafted = useTradeskillProgress().crafting.sittings.length;
  // The lightweight "how many" read, not `useGoals`'s ticking one — the tab label only ever needs a
  // count, and it would otherwise re-render the whole shell once a second regardless of which tab
  // is open.
  const goalsRunning = useGoalsRunning();
  // Same restrained "how many" read as `goalsRunning`, for the same reason — the tab label wants a
  // count, not the ticking clocks the panel itself reads.
  const achievementsRunning = useAchievementsRunning();
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
  const openTab = nav.openTab;
  const viewPeer = useCallback(
    (peerId: string) => {
      setFocusPeer(peerId);
      openTab("peers");
    },
    [openTab],
  );
  // Its own callback rather than an inline arrow at the call site: `PeerVersionToast`'s effect
  // depends on `onView`'s identity, so a fresh function every render would tear down and
  // re-subscribe its listener every render too — the churn `viewPeer` above is already careful to
  // avoid for the sibling toast.
  const viewPeers = useCallback(() => openTab("peers"), [openTab]);
  useEffect(() => {
    if (nav.tab !== "peers") setFocusPeer(null);
  }, [nav.tab]);
  /** The achievement a completion toast sent us to look at — the same pattern as `focusPeer`
   *  (ADR 0143), on its third tab. */
  const [focusAchievement, setFocusAchievement] = useState<string | null>(null);
  const viewAchievement = useCallback(
    (achievementId: string) => {
      setFocusAchievement(achievementId);
      openTab("achievements");
    },
    [openTab],
  );
  useEffect(() => {
    if (nav.tab !== "achievements") setFocusAchievement(null);
  }, [nav.tab]);
  /** The dump the stale-export chip sent us to read — the same pattern again, on the exports tab.
   *  An object, not the bare key, so clicking the chip again after picking another view still lands. */
  const [focusExport, setFocusExport] = useState<{ fileType: string } | null>(null);
  const viewExport = useCallback(
    (fileType: string) => {
      setFocusExport({ fileType });
      openTab("exports");
    },
    [openTab],
  );
  useEffect(() => {
    if (nav.tab !== "exports") setFocusExport(null);
  }, [nav.tab]);
  /**
   * What "damage taken" is read over, owned here so the status bar's pill and the loadout builder's
   * section read the same window, plus how often the pill has sent us to that section (a count, so a
   * second click lands again — the same pattern as `focusExport`, on the Items tab).
   */
  const [damageWindow, setDamageWindow] = usePersistentState<DamageWindow>(STORAGE_KEYS.damageWindow, DEFAULT_DAMAGE_WINDOW);
  const [focusDamage, setFocusDamage] = useState(0);
  const viewDamage = useCallback(() => {
    setFocusDamage((n) => n + 1);
    openTab("items");
  }, [openTab]);
  useEffect(() => {
    if (nav.tab !== "items") setFocusDamage(0);
  }, [nav.tab]);
  // The stats reminder's way in (ADR 0369): the loadout builder, on the same count-so-a-second-click-lands pattern.
  const [focusStats, setFocusStats] = useState(0);
  const viewStats = useCallback(() => {
    setFocusStats((n) => n + 1);
    openTab("items");
  }, [openTab]);
  useEffect(() => {
    if (nav.tab !== "items") setFocusStats(0);
  }, [nav.tab]);
  /**
   * Which release notes the player is owed (ADR 0373). Owned here, not by either panel: the banner in
   * the frame and the What's new panel answer to the same record, and the tab label counts what is unread.
   */
  const releases = useReleases();
  /** The guide a release note's "How-to →" sent us to — the same pattern again, on the How-to section. */
  const [focusGuide, setFocusGuide] = useState<{ id: string } | null>(null);
  const viewGuide = useCallback(
    (id: string) => {
      setFocusGuide({ id });
      openTab("help");
    },
    [openTab],
  );
  useEffect(() => {
    if (nav.tab !== "help") setFocusGuide(null);
  }, [nav.tab]);
  /** Where a guide's button goes: a tab, or the map, which is a window of its own. */
  const openGuideTarget = useCallback((target: string) => (target === MAP_WINDOW ? openMapWindow() : openTab(target)), [openTab]);
  // Only someone with a stats read needs the buff board watched for stat buffs coming and going — the
  // reminder compares a buff then against now — and watching means loading the spell catalogue.
  const { stamp: statsStamp } = useStatsStore();
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
  // What this host can actually do — a browser tab has no game log and no native window chrome.
  const capabilities = useCapabilities();
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
  // This window scales itself: the scale is a CSS zoom on its own shell div, because Chromium's
  // own zoom is per-origin and every window here shares one (see `useUiScale`).
  const appShellRef = useRef<HTMLDivElement>(null);
  // Back, forward and breadcrumbs return to where each place was scrolled; a fresh move starts at the top.
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollMemory(panelRef, `${nav.tab}|${nav.current ?? ""}`, nav.arrival === "history");
  useUiScale(appShellRef, settings?.overlay.fontScale);
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

  const prefillUsed = useCallback(() => setPrefill(null), []);
  // Going to the tab is what closes any page open on it — the box is a different place from a page (ADR 0173).
  const lookUp = useCallback(
    (text: string) => {
      openTab("search");
      setPrefill(text);
    },
    [openTab],
  );

  // A screengrab lookup fills the Search box with OCR'd text and jumps here (so does a
  // name clicked in the map window, which has no search of its own).
  useEffect(() => api()?.search.onPrefill(lookUp), [lookUp]);

  // The other screengrab: the Inventory window's stats page, read as numbers. What a figure means is only
  // known to the loadout planner (how far it is from what the plan counts), so the read waits for it and
  // the Items tab opens on the planner; what was read, and what wasn't sure, is said here either way.
  // What the last read left behind — figures still awaiting a yes, and the stamp if this window lost it (ADR 0371).
  useEffect(() => {
    void restoreStatsRecord();
  }, []);

  // A window that isn't the followed character's is refused outright (their HP is not yours to file), and the
  // toast says whose it was. What the read answers on the Deaths page — max HP, regen — goes straight there.
  const followed = characterFromLogFile(useWatcherStatus().file) ?? undefined;
  useEffect(
    () =>
      api()?.stats.onRead((read) => {
        if (read && !wrongCharacter(read, followed) && Object.keys(read.values).length) {
          offerStatsRead(read);
          answerDeathsPage(read);
          openTab("items");
        }
        showToast({ ...readNotice(read, { followed }), key: "stats-read", ms: 8000 });
      }),
    [openTab, followed],
  );

  // A caller elsewhere already knows the exact title (a map marker naming a mob eqlwiki or the
  // kill log itself named) — open straight to its page rather than a results list with one match
  // sitting in it. `openPage` alone already puts the search tab under it (`PAGE_TAB`), the same as
  // any other in-app link click.
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.search.onOpenPage((title) => nav.openPage(title));
  }, [nav]);

  // Every one of these reads a live EverQuest log — no log on this host, nothing for the tab to show.
  const needsLog = !capabilities.log;
  const noLog = "Needs the desktop app — no EverQuest log to read here.";

  // Every section by its key — what used to be a tab each (ADR 0320). The label carries a count only
  // where the number is worth acting on; a log-fed section is greyed out on a host with no log.
  const logged = { disabled: needsLog, disabledReason: noLog };
  const sectionItems: Record<Tab, TabItem> = {
    overview: { key: "overview", label: SECTION_NAMES.overview, ...logged },
    buffs: { key: "buffs", label: buffsLabel(buffs), ...logged },
    timers: { key: "timers", label: SECTION_NAMES.timers, ...logged },
    goals: { key: "goals", label: goalsLabel(goalsRunning), ...logged },
    achievements: { key: "achievements", label: achievementsLabel(achievementsRunning), ...logged },
    alerts: { key: "alerts", label: alertsLabel(settings?.castAlerts), ...logged },
    list: { key: "list", label: SECTION_NAMES.list },
    hunt: { key: "hunt", label: SECTION_NAMES.hunt },
    search: { key: "search", label: SECTION_NAMES.search },
    items: { key: "items", label: SECTION_NAMES.items },
    spells: { key: "spells", label: SECTION_NAMES.spells },
    stances: { key: "stances", label: SECTION_NAMES.stances },
    aa: { key: "aa", label: SECTION_NAMES.aa },
    exports: { key: "exports", label: SECTION_NAMES.exports, ...logged },
    faction: { key: "faction", label: SECTION_NAMES.faction, ...logged },
    tradeskills: { key: "tradeskills", label: SECTION_NAMES.tradeskills },
    crafting: { key: "crafting", label: crafted ? `${SECTION_NAMES.crafting} (${crafted})` : SECTION_NAMES.crafting, ...logged },
    combat: { key: "combat", label: SECTION_NAMES.combat, ...logged },
    session: { key: "session", label: SECTION_NAMES.session, ...logged },
    loot: { key: "loot", label: SECTION_NAMES.loot, ...logged },
    settings: { key: "settings", label: SECTION_NAMES.settings },
    help: { key: "help", label: SECTION_NAMES.help },
    updates: { key: "updates", label: updatesLabel(releases.answered ? 0 : releases.fresh.length) },
    peers: { key: "peers", label: peersLabel(peers.length, settings?.connectPeers) },
  };
  const usable = (section: string) => !sectionItems[section as Tab]?.disabled;
  // A remembered trail can name a tab this build no longer has (renamed, or dropped): show the
  // home section rather than an empty panel.
  const tab: Tab = Object.hasOwn(sectionItems, nav.tab) ? (nav.tab as Tab) : "list";
  const area = areaOf(tab) ?? AREAS[0];
  // The section each area was last left on, so picking an area lands where you were — one click
  // back to the board you use, not two.
  const [lastSections, setLastSections] = usePersistentState<Record<string, string>>(STORAGE_KEYS.areaSections, {});
  useEffect(() => {
    setLastSections((prev) => (prev[area.key] === tab ? prev : { ...prev, [area.key]: tab }));
  }, [area.key, tab, setLastSections]);
  const areaItems: TabItem[] = AREAS.map((a) => ({
    key: a.key,
    label: areaLabel(a.key, { buffsDown: buffs.lapsed.length, listed: list.entries.length }),
    disabled: !a.sections.some(usable),
    disabledReason: noLog,
  }));
  const jumpTargets: JumpTarget[] = AREAS.flatMap((a) => a.sections.map((k) => ({ section: sectionItems[k as Tab], area: a.label })));
  const openArea = (key: string) => {
    const picked = AREAS.find((a) => a.key === key);
    if (picked) openTab(sectionToOpen(picked, lastSections, usable));
  };

  return (
    <>
      <NavKeys />
      <AwariHost />
      {/* Mounted by the shell, not by the Peers tab: a notice about a tab you aren't on has to come
          from something that is always mounted. */}
      <PeerOfferToasts onView={viewPeer} />
      {/* Same reasoning, third tab: the 🎉 completion banner lives on the click-through overlay,
          which can't catch a click — this is the interactive echo of that same event. */}
      <AchievementAlertToasts onView={viewAchievement} />
      {/* Says once, if ever, that this build is behind the room — and points at the tab where the
          rows say which peers it is behind. */}
      <PeerVersionToast onView={viewPeers} />
      {/* Opt-in per race on the Faction tab's Race Unlocks view — silent until a reader asks. */}
      <RaceUnlockAlerts />
      {/* Beep only — the banner + flash live in the dedicated click-through overlay window
          (/alert), which floats over the game. This window is the always-alive one that can
          reliably play the sound. */}
      <CastAlerts showVisual={false} />
      <div ref={appShellRef} className={`app glass ${maximized ? "maximized" : ""}`}>
        <Titlebar>
          <h1>
            <span className="mark">EQ</span> List
          </h1>
          <span className="spacer" />
          <div className="win-controls no-drag">
            <button className="wc" title="Open the map" onClick={openMapWindow}>
              🗺
            </button>
            {/* Everything past here is native-window chrome — pinning, opacity and click-through
                all assume a frameless window sitting over the game, which a browser tab doesn't
                have. A plain document has its own titlebar and its own way to close, so there is
                nothing to disable-and-grey here; the cluster simply isn't drawn. */}
            {capabilities.windowing && (
              <>
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
              </>
            )}
          </div>
        </Titlebar>

        <UpdateBanner />
        <ReleaseBanner releases={releases} onOpen={() => openTab("updates")} />
        <WebDownloadBanner />

        <TabBar items={areaItems} active={area.key} onSelect={openArea} />
        {/* Every area draws its section row, and the trail always has its row, so the panel starts
            at the same height on every screen (ADR 0333). */}
        <TabBar className="sections" items={area.sections.map((k) => sectionItems[k as Tab])} active={tab} onSelect={openTab} />

        {/* Where you have been, under the tabs and above the panel — because the trail crosses both
            (ADR 0173) — and the search bar beside it, in the frame on every screen (ADR 0346). */}
        <div className="nav-row">
          <NavBar />
          <SearchBar targets={jumpTargets} onJump={openTab} onOpenPage={nav.openPage} onLookUp={lookUp} />
        </div>

        {/* The one region click-through hands to the game — see `PASS_THROUGH`. */}
        <div className="panel" ref={panelRef} {...PASS_THROUGH}>
          {tab === "overview" && <NowOverview />}
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
          {tab === "goals" && <GoalsPanel />}
          {tab === "achievements" && <AchievementsPanel focusId={focusAchievement} />}
          {tab === "buffs" && <BuffPanel />}
          {tab === "loot" && <LootPanel />}
          {tab === "faction" && <FactionPanel />}
          {tab === "search" && <SearchPanel prefill={prefill} onPrefillUsed={prefillUsed} />}
          {tab === "items" && <ItemSearchPanel damage={{ window: damageWindow, onWindow: setDamageWindow, focus: focusDamage }} statsFocus={focusStats} />}
          {tab === "spells" && <SpellSearchPanel />}
          {tab === "stances" && <StancesPanel />}
          {tab === "aa" && <AAPanel />}
          {tab === "tradeskills" && <TradeskillsPanel />}
          {tab === "crafting" && <CraftingLogPanel />}
          {tab === "combat" && <DamagePanel />}
          {tab === "session" && <SessionPanel />}
          {tab === "exports" && <GameExportsPanel focus={focusExport} />}
          {tab === "alerts" && <AlertsPanel />}
          {tab === "peers" && <PeersPanel focusPeer={focusPeer} onViewPeer={viewPeer} />}
          {tab === "settings" && <SettingsPanel />}
          {tab === "help" && <HowToPanel focus={focusGuide} sectionLabel={(k) => sectionItems[k as Tab]?.label} onOpen={openGuideTarget} />}
          {tab === "updates" && <WhatsNewPanel releases={releases} onGuide={viewGuide} />}
        </div>

        {statsStamp && <StatBuffWatcher />}
        <StatusBar>
          {capabilities.log && <DamageTakenChip window={damageWindow} onOpen={viewDamage} />}
          {capabilities.log && capabilities.lookup && <StaleStatsChip onOpen={viewStats} />}
          {capabilities.log && <StaleExportChip onOpen={viewExport} />}
        </StatusBar>
      </div>

      {/* Outside `.app`, which clips its children (`overflow: hidden`): a notice is drawn over the
          window, not inside the panel that raised it — so it survives switching tabs. */}
      <Toasts />
    </>
  );
}

/**
 * What an area says about itself on the top row. Only two carry a number, each the one worth seeing
 * without opening the area: Now counts buffs that are **down** (the reason to look mid-fight), List
 * counts what's on it. The rest name themselves — their sections carry their own counts.
 */
function areaLabel(key: AreaKey, counts: { buffsDown: number; listed: number }): string {
  const label = AREAS.find((a) => a.key === key)?.label ?? key;
  if (key === "now" && counts.buffsDown) return `${label} (${counts.buffsDown})`;
  if (key === "list" && counts.listed) return `${label} (${counts.listed})`;
  return label;
}

/**
 * What the Alerts tab says about itself: how many rules are live, or that none of them are.
 *
 * `(off)` earns its place because the failure it describes is invisible — an overlay with alerts
 * switched off looks exactly like one with nothing to warn you about, and you'd only find out during
 * the fight where it mattered.
 */
function alertsLabel(alerts: Settings["castAlerts"] | undefined): string {
  const name = SECTION_NAMES.alerts;
  if (!alerts) return name;
  if (!alerts.enabled) return `${name} (off)`;
  const live = alerts.watches.filter((w) => w.enabled).length;
  return live ? `${name} (${live})` : name;
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
  const name = SECTION_NAMES.peers;
  if (!connected) return `${name} (off)`;
  return peers ? `${name} (${peers})` : name;
}

/**
 * What the Goals tab says about itself: how many timeboxed farming goals are currently running.
 *
 * Silent at zero for the same reason `alertsLabel`'s count is: a tab with nothing running looks
 * exactly like a tab whose feature nobody has used, and only the number tells them apart when there
 * is one to show.
 */
function goalsLabel(running: number): string {
  return running ? `${SECTION_NAMES.goals} (${running})` : SECTION_NAMES.goals;
}

/** What the What's new section says about itself: how many releases are waiting to be read, while any are. */
function updatesLabel(unread: number): string {
  return unread ? `${SECTION_NAMES.updates} (${unread})` : SECTION_NAMES.updates;
}

function achievementsLabel(running: number): string {
  return running ? `${SECTION_NAMES.achievements} (${running})` : SECTION_NAMES.achievements;
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
  return down ? `${SECTION_NAMES.buffs} (${down})` : SECTION_NAMES.buffs;
}

/**
 * Browser-style back/forward for the in-app page history: an ordinary mouse's thumb buttons,
 * the rarer hardware that sends a real `app-command`, and Alt+←/→. Rendered inside NavProvider
 * so it can drive the shared history; renders nothing.
 *
 * The thumb buttons are read as `mouseup` with `button` 3 (back) / 4 (forward) — the standard
 * DOM codes for them — rather than through `app-command`: Chromium consumes an ordinary XButton
 * click itself (there's no browser history here for it to navigate, so nothing visible happens)
 * before it ever reaches the native translation to `WM_APPCOMMAND`, so main's `app-command`
 * listener (`windows.ts`) never sees it. Capture phase, so a page under the pointer can't swallow
 * it first by stopping propagation.
 */
function NavKeys() {
  const nav = useNav();
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.nav.onCommand((dir) => (dir === "back" ? nav.back() : nav.forward()));
  }, [nav]);
  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        nav.back();
      } else if (e.button === 4) {
        e.preventDefault();
        nav.forward();
      }
    };
    window.addEventListener("mouseup", onMouseUp, true);
    return () => window.removeEventListener("mouseup", onMouseUp, true);
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
