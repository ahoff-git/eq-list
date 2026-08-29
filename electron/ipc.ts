/**
 * ipc.ts — registers the request/response IPC handlers backing window.eql.
 * Handlers stay thin: they translate a call into a store/wiki/watcher method.
 * One-way main→renderer events (list/settings/loot/status) are wired in main.ts.
 */
import { ipcMain, dialog, shell, screen, BrowserWindow } from "electron";
import { CH } from "../src/shared/ipc-channels";
import { clampOpacity, p99ZoneUrl } from "../src/shared/constants";
import { placeName } from "../src/shared/zones/place";
import { characterFromLogFile } from "../src/shared/log-parser";
import { createLogger } from "../src/shared/logging";
import { WIKI_BASE, pingWiki } from "./wiki/api";
import { digestLog } from "./log-import";
import { createMapReader, createZoneNamer, listSources } from "./eq-maps";
import { createTravelRouter } from "./travel-graph";
import { sampleAlert, sampleRecord } from "./alert-router";
import { dataReport } from "./data-health";
import { selfCheck } from "./self-check";
import { createMapWindow, getAlertWindow, getMainWindow, getMapWindow, roleOf, setAlertInteractive, showInSearch } from "./windows";
import { resetPositions, setWindowToggles, windowToggles } from "./window-state";
import { endWindowDrag, moveWindowDrag, startWindowDrag } from "./window-drag";
import type { Store } from "./store";
import type { WikiClient } from "./wiki";
import type { LucyClient } from "./lucy";
import type { LogWatcher } from "./log-watcher";
import type { CombatTracker } from "./combat-stats";
import type { CombatHistory } from "./combat-history";
import type { HighScoreKeeper } from "./high-scores";
import type { XpTracker } from "./xp-progress";
import type { HpTracker } from "./hp-estimate";
import type { KillLog } from "./kill-log";
import type { LootLog } from "./loot-log";
import type { UpdateChecker } from "./update-check";
import type { MobKnowledgeStore } from "./mob-knowledge";
import type { PeerKillStore } from "./peer-kills";
import type { SpawnTracker } from "./spawn-tracker";
import type { BuffTracker } from "./buff-tracker";
import type { Lookup } from "./lookup";
import { readLogTail } from "./log-tail";
import type { AlertStyle, ForgetScope, ShoppingListEntry, WikiPage, DeepPartial, Settings, Rect, AppInfo, LocEvent, AwariPayload, AwariInbound, AwariOutbound, AwariStatus, AwariPeer, CastAlertEvent, KillEmphasis, MapFocus, SpawnKind, TravelAnswer, TravelEnd, TravelOptions, WindowToggles } from "../src/shared/types";
import { AWARI_MSG } from "../src/shared/types";
import { readContributor } from "../src/shared/contributors";
import type { DragEnd } from "../src/shared/window-snap";
import { createPeerShareHub, shareSources } from "./peer-share";
import type { ShareKind } from "../src/shared/peer-share";
import type { MapPin } from "../src/shared/map/pins";

const log = createLogger("ipc");

export interface IpcContext {
  store: Store;
  wiki: WikiClient;
  /** The supplementary item source, gated on `settings.askLucy` at this boundary. */
  lucy: LucyClient;
  combat: CombatTracker;
  history: CombatHistory;
  /** Personal bests — the board, and wiping it. */
  scores: HighScoreKeeper;
  xp: XpTracker;
  hp: HpTracker;
  killLog: KillLog;
  lootLog: LootLog;
  updates: UpdateChecker;
  mobs: MobKnowledgeStore;
  /** Kill positions other players have shared, kept across sessions (`peer-kills.ts`). */
  peerKills: PeerKillStore;
  /** This install's contributor id, stamped onto everything we contribute (`identity.ts`). */
  contributorId: string;
  /** Respawn countdowns for the nameds you kill (ADR 0092). */
  spawns: SpawnTracker;
  /** Which of your buffs are up, and which have lapsed (`buff-tracker.ts`). */
  buffs: BuffTracker;
  lookup: Lookup;
  /** The app's own data folder — where the stores and the remembered zone names live. */
  userData: string;
  /** Path to the debug log file. */
  logFile: string;
  /** The player's current zone (tracked from the log in main.ts). */
  getCurrentZone: () => string | null;
  /** The player's last logged location (tracked from the log in main.ts). */
  getCurrentLoc: () => LocEvent | null;
  /** Diagnostics for the Help section (hotkey registration, …). */
  getAppInfo: () => AppInfo;
  /** Push an event to every window (owned by main.ts). */
  broadcast: (channel: string, payload: unknown) => void;
  watcher: LogWatcher;
}

export function registerIpc(context: IpcContext): void {
  const { wiki, userData } = context;
  // Parsed map files, kept for the life of the app: they don't change under us, and a zone
  // is up to 800KB of text that several windows may ask for.
  const mapReader = createMapReader();
  // Naming a folder reads every map in it, so the answer is kept in userData between runs — see
  // `createZoneNamer`. One namer for the app: the map window, the borrowed-zone backstop and the
  // travel graph all want the same folders named, and this is what makes that one scan.
  const zoneNamer = createZoneNamer(userData);
  // The wiki is what knows which zones the server has open, so the graph asks it rather than carrying
  // a list of its own (see `absentZonesFor`).
  const travel = createTravelRouter({ outOfEraZones: () => wiki.outOfEraZones(), namer: zoneNamer });

  const shared: SharedIpc = { mapReader, zoneNamer, travel };

  // One registrar per subject. The order is for reading only — nothing here depends on it.
  registerListIpc(context);
  registerSettingsIpc(context);
  registerWikiIpc(context);
  registerLucyIpc(context);
  registerStatsIpc(context);
  registerAppIpc(context);
  registerWindowIpc(context, shared);
  registerPeerIpc(context);
}

/**
 * What the registrars share: readers and a router that are expensive to build and safe to reuse.
 *
 * Beside the context rather than inside it, because the context is *given* to `registerIpc` by main
 * while these are made by it — and main has no business holding a map reader.
 */
interface SharedIpc {
  mapReader: ReturnType<typeof createMapReader>;
  zoneNamer: ReturnType<typeof createZoneNamer>;
  travel: ReturnType<typeof createTravelRouter>;
}

/**
 * The shopping list itself: what's on it, what's obtained, and how many runs a group is for.
 */
function registerListIpc(context: IpcContext): void {
  const { store } = context;

  // ── shopping list ──
  ipcMain.handle(CH.listGet, () => store.getList());
  ipcMain.handle(CH.listAdd, (_e, input) => store.addEntry(input));
  ipcMain.handle(CH.listAddFromPage, (_e, page: WikiPage) => store.addFromPage(page));
  ipcMain.handle(CH.listUpdate, (_e, id: string, patch: Partial<ShoppingListEntry>) => store.updateEntry(id, patch));
  ipcMain.handle(CH.listRemove, (_e, id: string) => store.removeEntry(id));
  ipcMain.handle(CH.listClear, () => store.clearList());
  ipcMain.handle(CH.listSetRuns, (_e, originKey: string, runs: number) => store.setQuestRuns(originKey, runs));

}

/**
 * Settings, the cast-alert test, and digesting a past log — the Settings tab's own surface.
 */
function registerSettingsIpc(context: IpcContext): void {
  const { store, watcher, combat, history, killLog, lootLog, broadcast } = context;

  // ── settings ──
  ipcMain.handle(CH.settingsGet, () => store.getSettings());
  ipcMain.handle(CH.settingsUpdate, (_e, patch: DeepPartial<Settings>) => store.updateSettings(patch));
  ipcMain.handle(CH.settingsPickLogDir, async () => {
    const res = await dialog.showOpenDialog({
      title: "Select your EverQuest Logs folder",
      defaultPath: store.getSettings().logDir || undefined,
      properties: ["openDirectory"],
    });
    return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
  });

  // Fire a sample cast alert down the real broadcast path, so it shows in every window and beeps
  // just like a live one — the 🔔 on a rule's row. Named, it's *that* rule: its wording, its shape
  // (a raw-text rule draws a different banner from a cast) and its look. The payload is built by
  // `alert-router.ts`, beside the live ones, so a preview can't drift into showing a banner the
  // real alert never draws.
  ipcMain.handle(CH.alertsTest, (_e, watchId?: string) => {
    const alerts = store.getSettings().castAlerts;
    const watch =
      (watchId && alerts.watches.find((w) => w.id === watchId)) ||
      alerts.watches.find((w) => w.enabled && w.spell.trim());
    getAlertWindow()?.moveTop(); // you're looking at the app, so raise the overlay above it
    broadcast(CH.castAlert, sampleAlert(alerts, watch || undefined, new Date().toISOString()));
  });

  // The same, wearing a look that belongs to no rule yet — the "preview alert" button *inside* the
  // style editor, where the thing being judged is the look rather than any rule wearing it.
  ipcMain.handle(CH.alertsPreview, (_e, style: AlertStyle) => {
    const alerts = store.getSettings().castAlerts;
    getAlertWindow()?.moveTop();
    broadcast(CH.castAlert, sampleAlert(alerts, undefined, new Date().toISOString(), style));
  });

  // ── placing a custom alert spot ──
  // The overlay is click-through and never focused, so it can't catch a click. To place a spot we
  // make it interactive + focusable for the moment, tell it to show the placement layer, and
  // resolve this promise when it reports the click (or null on Esc). No overlay (alerts off) → null.
  //
  // For that moment the overlay is a **solid, transparent, always-on-top sheet over an entire
  // display**: the single most dangerous state any window in this app can be in, because there is
  // nothing to see and every click lands on it. Leaving it is therefore not allowed to depend on the
  // renderer coming back — the page could crash, hang, or never hydrate, and the user would be left
  // with a desktop that ignores the mouse and no clue why. Everything below exists so that state has
  // a guaranteed end: the report, an Escape read in main, a deadline, or the overlay going away.
  let placeResolve: ((p: { fx: number; fy: number } | null) => void) | null = null;
  let placeTimer: NodeJS.Timeout | null = null;
  let placeCleanup: (() => void) | null = null;

  /** How long the overlay may stay solid. Placing a spot is one deliberate click; this is generous. */
  const PLACE_DEADLINE_MS = 30_000;

  /**
   * End a placement, from wherever it ended: click, Escape, timeout, or a dead overlay.
   *
   * Restoring click-through happens **first and unconditionally**, before resolving anything, so no
   * later failure can leave the screen captured. Safe to call when no placement is running.
   */
  function finishPlacement(point: { fx: number; fy: number } | null): void {
    if (placeTimer) clearTimeout(placeTimer);
    placeTimer = null;
    setAlertInteractive(false); // back to harmless, whatever happened
    placeCleanup?.();
    placeCleanup = null;
    placeResolve?.(point);
    placeResolve = null;
  }

  ipcMain.handle(CH.alertPlaceStart, () => {
    const overlay = getAlertWindow();
    if (!overlay || overlay.isDestroyed()) return null;
    finishPlacement(null); // a stray earlier placement never finished — drop it
    setAlertInteractive(true);
    overlay.webContents.send(CH.alertPlaceBegin);
    return new Promise<{ fx: number; fy: number } | null>((resolve) => {
      placeResolve = resolve;
      placeTimer = setTimeout(() => {
        log.warn(`no spot placed within ${PLACE_DEADLINE_MS}ms — giving the screen back`);
        finishPlacement(null);
      }, PLACE_DEADLINE_MS);
      // Escape read in main, before the page sees it: the renderer's own handler needs a hydrated
      // page, and a page that never hydrated is exactly how this state becomes permanent.
      const onKey = (_e: unknown, input: { type: string; key: string }) => {
        if (input.type === "keyDown" && input.key === "Escape") finishPlacement(null);
      };
      overlay.webContents.on("before-input-event", onKey);
      // The overlay being destroyed (a crash takes it down — see `windows.ts`) must not leave the
      // caller waiting for a click nobody can make any more.
      const onClosed = () => finishPlacement(null);
      overlay.once("closed", onClosed);
      placeCleanup = () => {
        if (overlay.isDestroyed()) return;
        overlay.webContents.removeListener("before-input-event", onKey);
        overlay.removeListener("closed", onClosed);
      };
    });
  });
  ipcMain.on(CH.alertPlaceDone, (_e, point: { fx: number; fy: number } | null) => finishPlacement(point ?? null));

  // The tail of the log being watched, so the Alerts tab can test a rule against what the game
  // really said — including last night, which is the case a session buffer got wrong
  // (`log-tail.ts`). Read on demand; the *judging* is pure and runs in the renderer (`dryRun`),
  // because it re-answers on every keystroke while a rule is being written.
  ipcMain.handle(CH.logRecent, (_e, bytes?: number) =>
    readLogTail(context.watcher.status().file, typeof bytes === "number" ? bytes : undefined),
  );

  // "Eat" a log file: a catch-up that digests it into every store that can take it — the kill log
  // (→ mob knowledge), combat history, and the loot feed (→ prices). `digestLog` owns the kill log's
  // change of identity for the duration, since the unattended re-reading needs the identical dance.
  ipcMain.handle(CH.logImport, async () => {
    const res = await dialog.showOpenDialog({
      title: "Choose an EverQuest log to digest",
      properties: ["openFile"],
      filters: [
        { name: "EQ logs", extensions: ["txt"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (res.canceled || !res.filePaths.length) return null;
    const file = res.filePaths[0];
    const live = characterFromLogFile(watcher.status().file) ?? "";
    try {
      const result = digestLog(file, live, killLog, history, lootLog);
      killLog.flush();
      history.flush();
      lootLog.flush();
      // The fights it just filed are new to the history and so new to the **scoreboard**, which was
      // seeded from whatever was on disk when this character was first seen. Silently, by `absorb`'s
      // own contract: an evening you're only now digesting is not news, however good it was. Filed
      // against the character whose log it is, not whoever is logged in — `absorb` insists on that.
      context.scores.absorb(history.search("", Number.MAX_SAFE_INTEGER).fights);
      context.scores.flush();
      log.debug("digested log", { file, ...result });
      // The import lands out-of-band (no live loc/zone event to piggyback on), so nudge every
      // open window to refetch — kills and mob knowledge on `killsChanged`, and everything that
      // reads a stored list once when it opens (history, the loot feed) on `dataChanged`.
      broadcast(CH.killsChanged, undefined);
      broadcast(CH.dataChanged, undefined);
      return { file, ...result };
    } catch (e) {
      log.warn("log import failed:", (e as Error).message);
      return null;
    }
  });

}

/**
 * The wiki client: search, a page, and the refresh that re-mirrors its indexes.
 */
function registerWikiIpc(context: IpcContext): void {
  const { wiki, broadcast } = context;

  // A harvest runs for hours across tab switches and window reopens, so its progress goes to every
  // window rather than being handed back to whichever one happened to press start.
  wiki.onHarvest((progress) => broadcast(CH.wikiHarvestProgress, progress));

  // ── wiki ──
  ipcMain.handle(CH.wikiSearch, (_e, term: string) => wiki.search(term));
  ipcMain.handle(CH.wikiGetPage, (_e, title: string) => wiki.getPage(title));
  ipcMain.handle(CH.wikiSearchZones, (_e, term: string) => wiki.searchZones(term));
  ipcMain.handle(CH.wikiQuestsByZone, (_e, zone: string) => wiki.questsByZone(zone));
  ipcMain.handle(CH.wikiRefresh, () => wiki.refresh());
  // The Items tab's corpus. Cache-only by contract — see `WikiClient.cachedItems`.
  ipcMain.handle(CH.wikiCachedItems, () => wiki.cachedItems());
  // The catalogue harvest (ADR 0153). Only ever starts because a window asked it to — there is no
  // "warm this on launch", which is the difference between a trickle and a crawl nobody consented to.
  ipcMain.handle(CH.wikiHarvestStart, (_e, opts: { gapMs?: number; restart?: boolean } | undefined) =>
    wiki.harvest.start(opts),
  );
  ipcMain.handle(CH.wikiHarvestStop, () => wiki.harvest.stop());
  ipcMain.handle(CH.wikiHarvestStatus, () => wiki.harvest.status());
  // Open a wiki page in the user's browser. `target` is a wikiPath ("/Bone_Chips")
  // or a title ("Bone Chips"); host is validated so only eqlwiki links open.
  ipcMain.handle(CH.wikiOpen, (_e, target: string) => {
    const rel = target.startsWith("/") ? target : `/${target.replace(/ /g, "_")}`;
    const url = `${WIKI_BASE}${rel}`;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && parsed.hostname === "eqlwiki.com") return shell.openExternal(url);
    } catch {
      /* malformed target — ignore */
    }
    return Promise.resolve();
  });
}

/**
 * Lucy — the supplementary item source ([ADR 0124](../specs/decisions/0124-lucy-is-a-second-opinion.md)).
 *
 * Its own registrar rather than a tail on the wiki's, because it is its own subject: a different site,
 * a different trust level, and — the part that needs a boundary — **a switch**.
 *
 * `settings.askLucy` is checked *here* and not inside the client, because "off" has to mean *this app
 * makes no request to lucy.allakhazam.com*, and that is a promise the edge of the app can keep while a
 * data module can only try to. Every handler answers empty rather than throwing when it's off, so no
 * caller has to check first.
 */
function registerLucyIpc(context: IpcContext): void {
  const { lucy, store } = context;
  const asking = () => store.getSettings().askLucy;

  ipcMain.handle(CH.lucySearch, (_e, term: string) => (asking() ? lucy.search(term) : []));
  ipcMain.handle(CH.lucyGetItem, (_e, id: number) => (asking() ? lucy.getItem(id) : null));
  // Cache-only, and still gated: with the switch off nothing new is fetched either way, but a user who
  // turned Lucy off shouldn't keep meeting its cards on every item page.
  ipcMain.handle(CH.lucyCachedByName, (_e, name: string) => (asking() ? lucy.cachedByName(name) : null));
  // Gated for the same reason, and cache-only for the same one: Lucy's items join the Items tab's
  // catalogue only for someone who has that source switched on.
  ipcMain.handle(CH.lucyCachedItems, () => (asking() ? lucy.cachedItems() : []));
  // Cache-only and gated, like the rest: how many names the mirror holds, and when it was taken.
  ipcMain.handle(CH.lucyNameIndex, () => (asking() ? lucy.nameIndex() : { items: 0, fetchedAt: null }));
  // Host-validated like the wiki's, for the same reason: a URL handed to the OS gets checked first.
  // `target` is Lucy's id when a page has been fetched and the item's **name** when it hasn't, which
  // is what lets every item in the app carry a link without one request being made to find an id.
  ipcMain.handle(CH.lucyOpen, (_e, target: number | string) => {
    const url = lucy.itemUrl(target);
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" && parsed.hostname === "lucy.allakhazam.com") return shell.openExternal(url);
    } catch {
      /* unreachable for a URL we generated, but the guard is the pattern rather than the check */
    }
    return Promise.resolve();
  });
}

/**
 * Everything the log taught us: where you are, the damage meter, experience, health, kills,
 * loot and pooled mob knowledge.
 */
function registerStatsIpc(context: IpcContext): void {
  const { watcher, combat, history, xp, hp, killLog, lootLog, mobs, spawns, buffs, getCurrentZone, getCurrentLoc, broadcast } = context;

  // ── watcher / zone / stats ──
  ipcMain.handle(CH.watcherStatus, () => watcher.status());
  ipcMain.handle(CH.zoneGet, () => getCurrentZone());
  ipcMain.handle(CH.locGet, () => getCurrentLoc());
  ipcMain.handle(CH.combatGet, () => combat.snapshot());
  ipcMain.handle(CH.combatReset, () => {
    combat.reset();
    return combat.snapshot();
  });
  ipcMain.handle(CH.combatSessions, () => history.sessions());
  ipcMain.handle(CH.combatFights, (_e, sessionId: string) => history.fights(sessionId));
  ipcMain.handle(CH.combatSearchFights, (_e, term: string) => history.search(term));
  ipcMain.handle(CH.combatZones, () => history.zones());
  ipcMain.handle(CH.combatBests, () => history.bests());
  ipcMain.handle(CH.xpGet, () => xp.state());
  // The one figure the log can't give us, supplied by the player (see xp-progress.ts).
  ipcMain.handle(CH.xpSet, (_e, intoLevel: number, level?: number) => xp.set(intoLevel, level));
  ipcMain.handle(CH.hpGet, () => hp.state());
  ipcMain.handle(CH.hpSet, (_e, max: number) => hp.set(max));
  ipcMain.handle(CH.hpSetRegen, (_e, perTick: number) => hp.setRegen(perTick));
  ipcMain.handle(CH.killsAll, (_e, zone?: string) => killLog.kills(zone));
  // Forget recorded kills and the loot feed. `scope` defaults to the records only — the observed
  // drop rates, roam areas and vendor prices they taught are kept unless the caller says
  // "everything", which the UI only sends after asking a second time (ADR 0056).
  ipcMain.handle(CH.killsClear, (_e, scope: ForgetScope = "records") => {
    killLog.clear(scope);
    lootLog.clear(scope);
    broadcast(CH.killsChanged, undefined);
    broadcast(CH.dataChanged, undefined);
  });
  // Respawn timers. Every mutation answers with the whole view rather than nothing, because each
  // one changes what's derived from the kill log as well as what was stored — typing a figure can
  // start nothing, and clearing one restores the learned bound underneath it (ADR 0092).
  ipcMain.handle(CH.spawnsView, () => spawns.view());
  ipcMain.handle(CH.spawnsState, (_e, key: string, seconds: number | null) => {
    spawns.state(key, seconds);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsMarkNamed, (_e, mob: string, named: boolean) => {
    spawns.markNamed(mob, named);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsPad, (_e, key: string, seconds: number | null) => {
    spawns.pad(key, seconds);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsMarkUp, (_e, key: string, id?: string) => {
    spawns.markUp(key, id);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsMarkDead, (_e, key: string, at?: string) => {
    spawns.markDead(key, at);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsAdd, (_e, name: string, zone: string, seconds?: number | null, kind?: SpawnKind) => {
    spawns.add(name, zone, seconds, kind);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsRemove, (_e, key: string) => {
    spawns.remove(key);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsNotify, (_e, key: string, on: boolean) => {
    spawns.notify(key, on);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsStyle, (_e, key: string, styleId: string | null) => {
    spawns.style(key, styleId);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsOnScreen, (_e, key: string, on: boolean) => {
    spawns.showOnScreen(key, on);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsRelearn, (_e, key: string) => {
    spawns.relearn(key);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsForgetSightings, (_e, key: string) => {
    spawns.forgetSightings(key);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsForgetFloor, (_e, key: string) => {
    spawns.forgetFloor(key);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsDropGap, (_e, key: string, id: string, dropped: boolean) => {
    spawns.setGapDropped(key, id, dropped);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsMarkNotUp, (_e, key: string, id?: string) => {
    spawns.markNotUp(key, id);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsStop, (_e, key: string, id?: string) => {
    spawns.stop(key, id);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsQueue, (_e, key: string, on: boolean) => {
    spawns.queue(key, on);
    return spawns.view();
  });
  ipcMain.handle(CH.spawnsRepeat, (_e, key: string, on: boolean) => {
    spawns.repeat(key, on);
    return spawns.view();
  });
  // The buff board. Every edit hands the whole view back, like the spawn board's — these are small
  // changes to a small list, and returning it means a panel never has to guess what its click did.
  ipcMain.handle(CH.buffsView, () => buffs.view());
  ipcMain.handle(CH.buffsTrack, (_e, key: string, on: boolean) => {
    buffs.track(key, on);
    return buffs.view();
  });
  ipcMain.handle(CH.buffsNotify, (_e, key: string, on: boolean) => {
    buffs.notify(key, on);
    return buffs.view();
  });
  ipcMain.handle(CH.buffsOnScreen, (_e, key: string, on: boolean) => {
    buffs.showOnScreen(key, on);
    return buffs.view();
  });
  ipcMain.handle(CH.buffsStyle, (_e, key: string, styleId: string | null) => {
    buffs.style(key, styleId);
    return buffs.view();
  });
  ipcMain.handle(CH.buffsForget, (_e, key: string) => {
    buffs.forget(key);
    return buffs.view();
  });
  ipcMain.handle(CH.buffsDismiss, (_e, key: string, target: string) => {
    buffs.dismiss(key, target);
    return buffs.view();
  });
  ipcMain.handle(CH.buffsDismissAll, () => {
    buffs.dismissAll();
    return buffs.view();
  });
  // The loot feed's history — tracked in the main process, so the tab shows drops from before
  // it was opened, then follows live ones over CH.lootEvent.
  ipcMain.handle(CH.lootRecent, (_e, limit?: number) => lootLog.recent(limit));
  // Vendor prices, derived from those same auto-sell lines — "what is this trash worth".
  ipcMain.handle(CH.lootPrices, () => lootLog.prices());
  // Every item the ledger has ever held — what search falls back on when the wiki's index has
  // never heard of the thing you looted (ADR 0103).
  ipcMain.handle(CH.lootItems, () => lootLog.items());
  ipcMain.handle(CH.mobsAll, (_e, zone?: string) => mobs.all(zone));
  ipcMain.handle(CH.mobsMine, (_e, zone?: string) => mobs.mine(zone));
  // Who has told us what. Reporting is **not** here: contributions are filed by `registerPeerIpc`
  // as they arrive, so nothing depends on a particular window being open to receive them.
  ipcMain.handle(CH.mobsContributors, () => mobs.contributors());
  ipcMain.handle(CH.mobsForgetPeers, (_e, id?: string) => {
    mobs.forgetPeers(id);
    // Kills and observations are the same person's contribution split across two stores, so
    // forgetting one of them and leaving the other would credit a contributor you had just dropped.
    context.peerKills.forget(id);
    broadcast(CH.peerDataChanged, undefined);
  });
  ipcMain.handle(CH.peerKillsAll, (_e, zone?: string) => context.peerKills.all(zone));
  ipcMain.handle(CH.combatClearHistory, () => {
    history.clear();
    return history.sessions();
  });

  // ── the scoreboard ──
  // Read on demand and pushed on `CH.recordSet` (main.ts), the same shape as every other panel that
  // shows stored data: the board only changes when a record falls, so polling it would be waste.
  ipcMain.handle(CH.recordsBoard, () => context.scores.board());
  ipcMain.handle(CH.recordsClear, () => context.scores.clear());
  // A sample celebration down the real broadcast path, wearing the look records actually use — so
  // "is this loud enough, in the right corner" is answerable without waiting to beat something.
  ipcMain.handle(CH.recordsTest, () => {
    const settings = context.store.getSettings();
    getAlertWindow()?.moveTop(); // you're looking at the app, so raise the overlay above it
    broadcast(CH.castAlert, sampleRecord(settings.castAlerts, settings.highScores, new Date().toISOString()));
  });

}

/**
 * The app itself: the screengrab lookup, diagnostics for the Help section, the monitor list,
 * and the update check.
 */
function registerAppIpc(context: IpcContext): void {
  const { updates, lookup, logFile, getAppInfo } = context;

  // ── screengrab lookup + app info ──
  ipcMain.handle(CH.lookupCapture, (e, rect: Rect, view: { width: number; height: number }) =>
    lookup.capture(rect, view, e.sender),
  );
  ipcMain.handle(CH.lookupOpen, () => lookup.open());
  ipcMain.handle(CH.lookupReady, (e) => lookup.ready(e.sender));
  ipcMain.handle(CH.searchShow, (_e, text: string) => showInSearch(text));
  ipcMain.handle(CH.lookupCancel, () => lookup.cancel());
  ipcMain.handle(CH.appInfo, () => getAppInfo());
  // Which stored data the rules have moved on from. Read from disk per call rather than cached: a
  // stamp only changes when its store is written, and a stale answer here is the one thing this
  // feature exists to prevent.
  ipcMain.handle(CH.dataHealth, () => dataReport(context.userData));
  // "Why isn't it doing anything?" — the whole chain, run on demand, with the first broken link
  // named (ADR 0100). The window question is answered here rather than inside the checker, which
  // is what keeps that module testable without Electron.
  ipcMain.handle(CH.selfCheck, () =>
    selfCheck({
      getSettings: () => context.store.getSettings(),
      getList: () => context.store.getList(),
      watcherStatus: () => context.watcher.status(),
      userDataDir: context.userData,
      alertOverlayUp: () => {
        const overlay = getAlertWindow();
        return !!overlay && !overlay.isDestroyed();
      },
      pingWiki: () => pingWiki(),
    }),
  );
  ipcMain.handle(CH.appOpenLog, () => shell.openPath(logFile));
  // Monitors, for choosing where the alert overlay appears (Settings → cast alerts).
  ipcMain.handle(CH.displaysList, () => {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => ({
      id: d.id,
      label: `Monitor ${i + 1} — ${d.size.width}×${d.size.height}${d.id === primaryId ? " (primary)" : ""}`,
      primary: d.id === primaryId,
    }));
  });

  // ── update notification ──
  // The renderer draws the banner; the URL/commit stay in the main process. `current` lets a
  // tab that mounted after the check still catch the notice.
  ipcMain.handle(CH.updateCurrent, () => {
    const info = updates.latest();
    return info ? { url: info.url, version: info.version } : null;
  });
  ipcMain.handle(CH.updateOpen, () => {
    const info = updates.latest();
    if (info && isGithubUrl(info.url)) void shell.openExternal(info.url);
    updates.markSeen(); // acting on it counts as seen — don't nag for this build again
  });
  ipcMain.handle(CH.updateDismiss, () => updates.markSeen());

}

/**
 * Windows, and the map they draw: opening and sizing them, plus reading the game's own map files
 * and answering a travel route.
 */
function registerWindowIpc(context: IpcContext, shared: SharedIpc): void {
  const { store, wiki } = context;
  const { mapReader, zoneNamer, travel } = shared;

  // ── window control ──
  // Open (or focus) the sibling map window.
  ipcMain.handle(CH.winOpenMap, () => {
    const win = createMapWindow(store.getSettings().overlay);
    win.show();
    win.focus();
  });
  // Open the map window and tell it to view a zone (and optionally drop a marker).
  // `focus` rides along untouched: it names the mob and drop the coordinate came from, so the map
  // can open the panel that explains the marker rather than leaving a bare star (ADR 0104).
  ipcMain.handle(CH.mapOpenAt, (_e, zone: string, loc?: { y: number; x: number }, label?: string, focus?: MapFocus) => {
    const win = createMapWindow(store.getSettings().overlay);
    win.show();
    win.focus();
    const send = () => win.webContents.send(CH.mapViewZone, { zone, loc, label, focus });
    if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
    else send();
  });
  // Pins a peer shared, handed to the window that owns pins. Opens the map the same way `mapOpenAt`
  // does — you asked to put them somewhere, and the somewhere is a map you can see.
  ipcMain.on(CH.mapAddPins, (_e, pins: MapPin[]) => {
    const win = createMapWindow(store.getSettings().overlay);
    win.show();
    win.focus();
    const send = () => win.webContents.send(CH.mapPinsAdded, pins);
    if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
    else send();
  });
  // Point the map at a mob's kills. Only ever forwarded to a map window that's already open —
  // this rides on a hover, and a window that appears because the cursor crossed a name is one
  // nobody asked for.
  ipcMain.on(CH.mapEmphasize, (_e, emphasis: KillEmphasis | null) => {
    getMapWindow()?.webContents.send(CH.mapEmphasis, emphasis);
  });
  // Open a zone's map page on the Project 1999 wiki (host fixed, so it's safe). Through `placeName`
  // like every other map reference: the wiki has a page for Blackburrow and none for "Blackburrow 3",
  // and this is the boundary, so nothing downstream can hand it the log's wording (ADR 0134).
  ipcMain.handle(CH.mapOpenP99, (_e, zone: string) => shell.openExternal(p99ZoneUrl(placeName(zone))));

  // ── the game's own map files (see ADR 0039) ──
  // Listed fresh each call: the user can install a pack, or repoint their log directory,
  // without restarting the app.
  ipcMain.handle(CH.mapSources, () => listSources(store.getSettings().logDir));
  // Named separately from the source list: naming reads every map in the folder, and the picker is
  // usable (by file name) while that's in flight.
  // Per source, because a pack names its own zones and nothing else's (ADR 0060) — asking for one
  // folder's names is also all the picker ever needs, since it only ever shows one pack at a time.
  ipcMain.handle(CH.mapNames, (_e, sourceId: string) => {
    const source = listSources(store.getSettings().logDir).sources.find((s) => s.id === sourceId);
    return source ? zoneNamer.names(source) : {};
  });
  /**
   * How to get from one zone to another. Built from the same folder the map is drawn from, on first
   * ask and then kept — a graph belongs to the pack you picked, so it isn't stored anywhere and can't
   * fall out of step with that choice (see specs/travel).
   *
   * Every failure comes back as a *reason*, because "no route" covers four different situations and a
   * person needs to know which: a zone this pack has no map for, a typo, an island in the graph, or a
   * port they've switched off.
   */
  ipcMain.handle(
    CH.travelRoute,
    (_e, sourceId: string, from: TravelEnd | string, to: TravelEnd | string, options?: TravelOptions) => {
      const source = listSources(store.getSettings().logDir).sources.find((s) => s.id === sourceId);
      if (!source) return { refused: "no-graph", knows: { zones: 0, borders: 0 } } satisfies TravelAnswer;
      return travel.answer(source, from, to, options);
    },
  );

  /**
   * What the graph knows about **one zone** — its nodes, where each sits on this map, and the
   * teleport networks it can reach, counted rather than listed.
   *
   * A route says how to get somewhere and nothing about whether the graph deserves to be believed.
   * This is the other half: it's what the map draws while the 🧭 panel is open, and what an audit of a
   * pack's labels is done against (see specs/travel).
   */
  ipcMain.handle(CH.travelSurvey, (_e, sourceId: string, zone: string, options?: TravelOptions) => {
    const source = listSources(store.getSettings().logDir).sources.find((s) => s.id === sourceId);
    return source ? travel.survey(source, zone, options) : undefined;
  });

  ipcMain.handle(CH.mapLoad, (_e, sourceId: string, zoneFile: string) => {
    const dir = listSources(store.getSettings().logDir).sources.find((s) => s.id === sourceId)?.dir;
    if (!dir) return null;
    // Never let a renderer-supplied name walk out of its source folder.
    if (!/^[a-z0-9_.-]+$/i.test(zoneFile)) return null;
    return mapReader.load(dir, zoneFile) ?? null;
  });

}

/**
 * Which message kinds carry data we keep, rather than something a window draws and forgets.
 *
 * The distinction is the whole of the peer-data pipeline: a `loc` or a `ping` is about *now* and
 * belongs to whichever window is drawing it, while `mobs` and `kills` are contributions — they
 * outlive the session, so they are stamped on the way out and filed on the way in, here, by the
 * process that is always running.
 */
const CONTRIBUTED_KINDS = new Set<string>([AWARI_MSG.mobs, AWARI_MSG.kills]);

/**
 * The peer-networking relay, and the one place contributed data crosses the wire in either
 * direction.
 *
 * Main holds no connection of its own — the always-alive main window owns it (ADR 0012) — but it is
 * the only participant that is always running, which is why the *data* half lives here rather than
 * in a window:
 *
 *   - **Inbound.** Peers' observations used to be filed by the map window, so nothing anyone shared
 *     was kept unless you happened to have the map open. Filing here means a room you are connected
 *     to teaches this install whether or not anybody is looking.
 *   - **Outbound.** Our contributor id is stamped on here rather than sent up to the renderer,
 *     so the id lives in exactly one process, every contribution carries it without a window
 *     having to remember, and a payload that isn't a contribution never gets one — connect without
 *     sharing and nothing stable about you goes out at all (`electron/identity.ts`).
 */
function registerPeerIpc(context: IpcContext): void {
  const { broadcast, mobs, peerKills, contributorId, store, killLog, spawns, buffs, scores, watcher, wiki } = context;

  /** File what a peer just told us, and let every open window know the pool moved. */
  const fileContribution = (payload: AwariPayload): void => {
    // Fails closed (`readContributor`): a peer who announces no id is not filed under their display
    // name as they used to be — see `contributors.ts` for why a name cannot be a key.
    const by = readContributor(payload as { id?: unknown; name?: unknown });
    if (!by) return void log.debug("contribution ignored - no contributor id", { kind: payload.kind });
    if (payload.kind === AWARI_MSG.mobs && Array.isArray(payload.mobs)) mobs.report(by, payload.mobs);
    else if (payload.kind === AWARI_MSG.kills && Array.isArray(payload.kills)) peerKills.report(by, payload.kills);
    else return;
    broadcast(CH.peerDataChanged, undefined);
  };

  /** Send a payload out through the owner window — to the room, or to one peer (ADR 0141). */
  const send = (payload: AwariPayload, to?: string): void => {
    getMainWindow()?.webContents.send(CH.awariPublish, {
      payload: CONTRIBUTED_KINDS.has(payload.kind) ? { ...payload, id: contributorId } : payload,
      to,
    } satisfies AwariOutbound);
  };

  /**
   * The share hub: our catalogue, who may have what, and where a peer's answer lands.
   *
   * Its name comes from the same rule `hello` uses — an explicit `playerName`, else the character
   * the log file is named for — because a buff board resolves `ON_YOU` against it and two answers
   * to "who am I" would put one player's buffs on two rows.
   */
  const shares = createPeerShareHub({
    getSettings: () => store.getSettings(),
    getName: () =>
      (store.getSettings().playerName || "").trim() || characterFromLogFile(watcher.status().file) || "",
    send,
    fileContribution,
    changed: () => broadcast(CH.peerShareChanged, undefined),
    offered: (notice) => broadcast(CH.peerOffered, notice),
    rejoin: () => getMainWindow()?.webContents.send(CH.awariRejoin),
    sources: shareSources({
      getList: () => store.getList(),
      getSettings: () => store.getSettings(),
      killLog,
      spawns,
      buffs,
      scores,
    }),
    // The item catalogue, which is addressed by shard rather than as a whole (ADR 0160).
    items: wiki.items,
    acceptItems: (pages, shard) => wiki.items.accept(pages, shard),
  });

  /**
   * The other half of the cycle: the harvester needs the room, and the hub needs the cache.
   *
   * Wired here, after both exist, because they genuinely depend on each other — the hub answers a
   * shard ask out of the cache, and the cache's harvester decides what to fetch from what the room
   * already holds. Late-binding it is what keeps either of them from having to construct the other.
   */
  wiki.joinRoom({
    peers: () => shares.itemRoom(),
    // The transport's own per-session id. It only has to differ from everyone else's, which is what
    // gives this install a shard order nobody shares (`item-shards.ts`).
    myId: () => shares.room().status.peerId ?? "solo",
    askPeer: (peerId, shard) => shares.askShard(peerId, shard),
    // Publishing a claim is just re-offering the catalogue: the coverage bitmap and the shard we are
    // on both ride in it, so "I've taken this one" needs no message of its own.
    claim: () => shares.touch(),
  });

  // ── awari peer networking broker (see ADR 0012) ──
  // The always-alive main window owns the single WebRTC connection; the main process
  // relays messages, stamps the contributions going out and files the ones coming in.
  ipcMain.on(CH.awariOutbound, (_e, out: AwariOutbound) => send(out.payload, out.to));
  ipcMain.on(CH.awariInbound, (_e, msg: AwariInbound) => {
    // The hub takes `offer`/`ask`/`give` and nothing else; a kind it doesn't own falls through to
    // the windows exactly as before. Contributions still arrive **both ways** on purpose: over a
    // `give` from a client that has the Peers tab, and as a bare broadcast from one that predates
    // it (ADR 0141 changed how a contribution arrives, not what one is).
    if (shares.handle(msg.sender, msg.payload)) return;
    if (CONTRIBUTED_KINDS.has(msg.payload?.kind)) fileContribution(msg.payload);
    broadcast(CH.awariMessage, msg);
  });
  ipcMain.on(CH.awariStatus, (_e, status: AwariStatus) => {
    // Held before it's broadcast, so a window opening a moment later can ask what it missed.
    shares.noteStatus(status);
    // A fresh room has heard no catalogue from us, so joining announces one. (Leaving doesn't need
    // a retraction — `publishOffer` is a no-op while disconnected, and a room we are not in has
    // nobody left to tell.)
    if (status.connected) shares.touch();
    broadcast(CH.awariStatusChanged, status);
  });
  ipcMain.on(CH.awariPeers, (_e, peers: AwariPeer[]) => {
    shares.roster(peers);
    broadcast(CH.awariPeersChanged, peers);
  });

  // ── The share hub, as the Peers tab uses it ──
  ipcMain.handle(CH.peerOffer, () => shares.offer());
  ipcMain.handle(CH.peerRoom, () => shares.room());
  // Relayed to the owner window, which is the only one with a session to re-open (ADR 0012).
  ipcMain.on(CH.peerRejoin, () => getMainWindow()?.webContents.send(CH.awariRejoin));
  ipcMain.handle(CH.peerMine, (_e, kind: ShareKind) => shares.mine(kind));
  ipcMain.handle(CH.peerReceived, (_e, peerId?: string, kind?: ShareKind) => shares.received(peerId, kind));
  ipcMain.on(CH.peerAsk, (_e, peerId: string, kind: ShareKind) => shares.ask(peerId, kind));
  ipcMain.on(CH.peerClearShares, (_e, peerId?: string, kind?: ShareKind) => shares.clear(peerId, kind));
  // Pins are the one shared kind main can't read for itself — they live in the map window's own
  // storage. It reports them here so an ask is answerable whether or not the map is open, which is
  // the same reason contributions stopped being filed by a window (ADR 0132).
  ipcMain.on(CH.peerSetPins, (_e, pins: MapPin[]) => shares.setPins(pins));
  // A toggle is a decision and shows up in the room at once; the catalogue is otherwise measured on
  // its own slow tick (see `OFFER_TICK_MS`).
  store.onSettings(() => shares.touch());

  ipcMain.on(CH.winMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  // Maximize/restore. The click-through alert overlay is `maximizable: false`, so asking is
  // enough to keep it out of this — no window needs to know whether it's the exception.
  ipcMain.on(CH.winToggleMaximize, (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win?.isMaximizable()) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
  // Dragging a frameless window by its titlebar, snapping and all — `window-drag.ts` owns the
  // behaviour; these three carry the gesture the renderer is watching (see `useWindowDrag`).
  ipcMain.on(CH.winDragStart, (e) => startWindowDrag(BrowserWindow.fromWebContents(e.sender)));
  // A pulse, not a position: main reads the cursor itself, in the same coordinates as the bounds
  // it sets, so a window's CSS zoom or a monitor's scale factor can't skew the drag.
  ipcMain.on(CH.winDragMove, () => moveWindowDrag());
  ipcMain.on(CH.winDragEnd, (_e, how: DragEnd) => endWindowDrag(how));
  // Hide to tray (single-window app): keep the process alive so the tray/hotkey can reshow.
  ipcMain.on(CH.winHide, (e) => BrowserWindow.fromWebContents(e.sender)?.hide());
  // How this window was left, and remembering a change to it (see ADR 0074). The renderer doesn't
  // know which window it is, so the role comes from the sender; a window that keeps no state reads
  // as "never said" and writes nowhere. Applying is still the appliers' job below — this only
  // remembers, so a per-crossing click-through flip can't be mistaken for the user's choice.
  ipcMain.handle(CH.winGetState, (e) => {
    const role = roleOf(BrowserWindow.fromWebContents(e.sender));
    return role ? windowToggles(role) : {};
  });
  ipcMain.on(CH.winSaveState, (e, patch: WindowToggles) => {
    const role = roleOf(BrowserWindow.fromWebContents(e.sender));
    if (role) setWindowToggles(role, patch);
  });
  // Transient opacity (the "full opacity" toggle) — doesn't touch the saved setting. Clamped by the
  // same helper the window constructor uses, so "how translucent a window may be" has one definition.
  ipcMain.on(CH.winSetOpacity, (e, value: number) =>
    BrowserWindow.fromWebContents(e.sender)?.setOpacity(clampOpacity(value)),
  );
  ipcMain.on(CH.winSetAlwaysOnTop, (e, enabled: boolean) =>
    BrowserWindow.fromWebContents(e.sender)?.setAlwaysOnTop(!!enabled, "screen-saver"),
  );
  // Click-through, asked for region by region as the cursor moves (see `useClickThrough`).
  // `forward` is what makes it a *mode* rather than a wall: mouse **moves** still reach the
  // renderer while clicks go to the game, so the window can see the cursor arrive over a
  // control and ask for itself back. Windows/macOS only; on Linux it degrades to all-or-nothing.
  ipcMain.on(CH.winSetClickThrough, (e, enabled: boolean) =>
    BrowserWindow.fromWebContents(e.sender)?.setIgnoreMouseEvents(!!enabled, { forward: true }),
  );
  ipcMain.on(CH.winClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close());
  // Forget saved position and recenter the window (for a "lost" window).
  ipcMain.handle(CH.winResetPositions, () => {
    resetPositions();
    getMainWindow()?.center();
  });
}

/** Only ever open a github.com https link — the release URL comes from the API, so pin the host. */
function isGithubUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "github.com" || u.hostname.endsWith(".github.com"));
  } catch {
    return false;
  }
}
