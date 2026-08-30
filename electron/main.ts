/**
 * main.ts — Electron entry point. Boots the store, wiki client and log watcher,
 * registers IPC, opens the control window, and fans out main→renderer events:
 *   - store changes  → every window re-renders the same list/settings
 *   - loot events     → broadcast raw, then matched entries after the store applies them
 *   - settings changes → overlay restyled + watcher re-targeted when the log path moves
 */
import { app, BrowserWindow, dialog, globalShortcut, shell, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";
import { registerAppProtocolScheme, handleAppProtocol } from "./protocol";
import { createStore } from "./store";
import { setAppVersion } from "./json-store";
import { createWikiClient } from "./wiki";
import { createLucyClient } from "./lucy";
import { createLogWatcher } from "./log-watcher";
import { createLogCursor } from "./log-cursor";
import { runMigrations } from "./migrations";
import { createAlertQueue } from "./alert-queue";
import { isSameSitting } from "../src/shared/log-catchup";
import { createCombatStats } from "./combat-stats";
import { createLogClock } from "../src/shared/log-clock";
import { reReadLogs } from "./log-reread";
import { createSpellCatalog } from "./spells";
import { createCombatHistory } from "./combat-history";
import { createHighScores } from "./high-scores";
import { eventCandidates, fightCandidates } from "../src/shared/high-scores";
import { effectiveNeeded, runsFor } from "../src/shared/grouping";
import { createXpProgress } from "./xp-progress";
import { createHpEstimate } from "./hp-estimate";
import { createKillLog } from "./kill-log";
import { createLootLog } from "./loot-log";
import { lootRecord } from "../src/shared/loot-feed";
import { createUpdateChecker } from "./update-check";
import { createMobKnowledge } from "./mob-knowledge";
import { createPeerKills } from "./peer-kills";
import { readIdentity } from "./identity";
import { createOcr } from "./ocr";
import { createLookup } from "./lookup";
import { registerIpc } from "./ipc";
import { createMainWindow, createMapWindow, createAlertWindow, closeAlertWindow, getAlertWindow, getMainWindow, getMapWindow, neutralizeOverlays, setOverlayProvider, showInSearch } from "./windows";
import { resetPositions, beginQuit, wasMapOpen } from "./window-state";
import { CH } from "../src/shared/ipc-channels";
import { OVERLAY_HOTKEY, LOOKUP_HOTKEY } from "../src/shared/constants";
import { createLogger, setLogSink, formatLogParts } from "../src/shared/logging";
import { once } from "../src/shared/once";
import { characterFromLogFile } from "../src/shared/log-parser";
import { createAlertRouter } from "./alert-router";
import { createSpawnTracker } from "./spawn-tracker";
import { createBuffTracker } from "./buff-tracker";
import type { Settings, AppInfo, LocEvent, CastAlertEvent } from "../src/shared/types";

const log = createLogger("main");

// Must run before `ready`.
registerAppProtocolScheme();
// The cast-alert beep is Web Audio with no bundled asset; without this it stays suspended until
// the window gets a user gesture, so the very first alert after launch would be silent.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

/**
 * Wrap `fn` so a burst of calls delivers only the newest value, once, after `ms`.
 * Combat lines arrive in floods (a whole appended chunk per poll — or an entire log
 * read from the top when it first appears), and no UI can use 2000 snapshots; this
 * keeps the renderers fed without making the IPC channel the bottleneck.
 */
/** Run `fn` at most once per `ms` (it pulls whatever state it needs when it fires). */
function coalesce(ms: number, fn: () => void): () => void {
  let timer: NodeJS.Timeout | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

/**
 * How long to pool kill-log changes before telling the renderers. Kills are history, not a live
 * meter, so half a second is imperceptible — and it's the watcher's own poll interval, which
 * makes "one notice per batch of lines" the natural ceiling.
 */
const KILLS_NOTICE_MS = 500;

/**
 * How often to tell the damage meter what time it is, so a fight that ended in quiet is filed then
 * rather than when the next one starts ([ADR 0126](../specs/decisions/0126-a-fight-is-filed-when-it-ends.md)).
 * A second is well inside the ten of quiet a resolved fight needs, and the check is a couple of
 * comparisons when nothing has changed.
 */
const SETTLE_MS = 1000;

/**
 * A deadline on waiting for the control window before starting its siblings anyway.
 *
 * The wait is for `did-finish-load`, which a window that fails to load never fires — and the cast-alert
 * overlay never being created means no alerts at all, which is a feature silently gone rather than a slow
 * launch. So the deferral gives up: long enough that the ordinary case really is "after the window is up",
 * short enough that a broken load costs a couple of seconds rather than the feature.
 */
const SIBLING_WINDOW_DEADLINE_MS = 4000;

/** Run `fn` once `win` has loaded — or at `SIBLING_WINDOW_DEADLINE_MS`, whichever comes first. */
/**
 * How long after the window paints to warm the item catalogue.
 *
 * Late enough that it is not competing with the renderer's own startup, early enough that it is done
 * long before anybody clicks a tab.
 */
const CATALOGUE_WARM_MS = 4_000;

function afterLoad(win: BrowserWindow, fn: () => void): void {
  const go = once(fn);
  win.webContents.once("did-finish-load", go);
  setTimeout(go, SIBLING_WINDOW_DEADLINE_MS);
}

/** Mirror the debug toggle into the env flag that logging.ts reads. */
function syncDebugFlag(settings: Settings): void {
  if (settings.debug) process.env.EQL_DEBUG = "1";
  else delete process.env.EQL_DEBUG;
}

/**
 * This launch's log file. A function rather than a constant because `app.getPath` may not be called
 * before `ready` — and it's named twice: by the sink that writes it, and by the one failure that has
 * to point at it without the app being up (see the startup `catch`).
 */
function debugLogPath(): string {
  return path.join(app.getPath("userData"), "eqlist-debug.log");
}

const DEEP_LINK_SCHEME = "eqlist";

/** Bring the control window to the front (or make one) — for deep links / relaunch. */
function focusMainWindow(): void {
  // Not before `ready`. A second launch while this one is still booting is the ordinary case, not an
  // exotic one — the app takes a moment to appear, so the shortcut gets double-clicked twice — and
  // both routes here would be wrong that early: a window cannot be created before `ready` at all, and
  // one created before startup registers the `app://` handler would load nothing and sit in the
  // taskbar as an invisible pane of glass. Startup's own window is moments away, so wait for it.
  if (!app.isReady()) {
    void app.whenReady().then(focusMainWindow);
    return;
  }
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  } else {
    createMainWindow();
  }
}

// Single instance: a second launch — including an eqlist:// link from a web page —
// focuses the running app instead of starting a duplicate.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME);
  app.on("second-instance", focusMainWindow);
  app.on("open-url", (event) => {
    event.preventDefault();
    focusMainWindow();
  });

  app.whenReady().then(() => {
  const userData = app.getPath("userData");

  // Mirror logs to a file so debug output is visible without a terminal. Fresh each
  // launch; only what passes the debug gate is written (warn/error always).
  const logFile = debugLogPath();
  try {
    fs.writeFileSync(logFile, `EQ List log — ${new Date().toISOString()}\n`);
  } catch {
    /* ignore */
  }
  setLogSink((level, parts) => {
    try {
      fs.appendFileSync(logFile, `${new Date().toISOString()} ${level.toUpperCase()} ${formatLogParts(parts)}\n`);
    } catch {
      /* best effort */
    }
  });

  // Serves the exported renderer, so it only has to be registered before the first window — which is
  // hundreds of lines below. Deliberately *after* the log sink: its one complaint is that there is no
  // renderer to serve, and that is exactly the launch where this file is the only evidence anyone will
  // have (no terminal, and the window the message would have appeared in is the broken one).
  handleAppProtocol(path.join(app.getAppPath(), "out"));

  // Main-process failures land in that same file rather than Electron's default dialog, which
  // pops over the game. Handling `uncaughtException` also means we keep running instead of
  // exiting — for an overlay that's the better trade: a broken feature beats the whole app
  // disappearing mid-fight, and the log says what broke.
  //
  // But "keep running" must not extend to the windows over the game. We have no idea what was
  // half-done when the throw happened — an overlay made solid to place a spot, a set of selectors
  // mid-open — and the code that would have put them back is the code that just died. So every
  // overlay is stripped of its hold on the screen first, and *then* we carry on: a broken feature
  // beats losing the app, and losing the app beats a desktop that won't take a click.
  process.on("uncaughtException", (err) => {
    log.error("uncaught", err);
    try {
      neutralizeOverlays();
    } catch (e) {
      log.error("could not neutralize overlays after a crash", e);
    }
  });
  process.on("unhandledRejection", (reason) => log.error("unhandled rejection", reason));

  // Before any store is built, so every file written this session records the build that wrote it
  // (`data-provenance.ts`). Diagnosis only — what's *compared* is the per-concern revision, since a
  // build number changes on every push and would mark everything stale for ever.
  setAppVersion(app.getVersion());
  const store = createStore(userData);
  // The page TTL is a setting, read per check rather than captured, so changing it takes effect at
  // once — including for a harvest already running (ADR 0161).
  const wiki = createWikiClient(path.join(userData, "wiki-cache"), {
    ttlMs: () => Math.max(1, store.getSettings().wikiPageTtlDays) * 24 * 60 * 60 * 1000,
  });
  // The supplementary item source, in its own cache directory so its month-long TTL and the wiki's
  // week never share a file (ADR 0124). Created eagerly and cheaply: it reads nothing and fetches
  // nothing until something asks it a question.
  const lucy = createLucyClient(path.join(userData, "lucy-cache"));
  // One-time repairs to data already on disk, before anything reads it. Chief among them: a kill
  // recorded before the log had named the zone is stored unplaced, and so counts towards no drop
  // rate and no heatmap — the log itself knows where you were, so it fills them in (ADR 0083).
  runMigrations(userData, store.getSettings().logDir);
  // Where we had read to when we last ran, so anything logged since is read as the news it is
  // rather than being skipped ([ADR 0044](../specs/decisions/0044-the-log-position-outlives-the-app.md)).
  const cursor = createLogCursor(userData);
  const watcher = createLogWatcher(cursor);
  // The game's own spell file, for the facts the log never states — mana above all. Lazy and
  // entirely optional: no install, no file, no mana figures, and nothing else changes.
  const spells = createSpellCatalog();
  const combat = createCombatStats(undefined, (spell, rank) => spells.find(spell, rank)?.mana);
  const history = createCombatHistory(userData);
  /**
   * Personal bests. Silent until the log has been caught up, because everything logged while the app
   * was shut is replayed through the live path — those records are real and belong on the board, but
   * a banner for a hit you landed last night is a lie about the present (see `setQuiet`).
   */
  const scores = createHighScores(userData);
  scores.setQuiet(true);
  const xp = createXpProgress(userData);
  const hp = createHpEstimate(userData);
  const killLog = createKillLog(userData);
  const lootLog = createLootLog(userData);
  const updates = createUpdateChecker(userData, app.getVersion());
  const mobs = createMobKnowledge(userData, killLog);
  // Kept across sessions rather than held by whichever window happens to be open, so a room teaches
  // this install whether or not the map is up (see `peer-kills.ts`).
  const peerKills = createPeerKills(userData);
  // Minted once and then ours for good: what everything we contribute is filed under on other
  // people's machines, and what theirs is filed under here (`identity.ts`).
  const contributorId = readIdentity(userData);
  const ocr = createOcr(path.join(userData, "tesseract-cache"));
  // The wiki's mirrored titles are what tell an OCR misreading from a name we simply don't have.
  const lookup = createLookup(ocr, showInSearch, (readings) => wiki.bestKnownReading(readings));

  let currentZone: string | null = null;
  let currentLoc: LocEvent | null = null;
  let appInfo: AppInfo = { hotkeys: [], logFile };

  syncDebugFlag(store.getSettings());
  // So a window created from anywhere — the tray, the hotkey, a deep link, a search hand-off — opens
  // at the saved translucency without every caller having to remember to pass it.
  setOverlayProvider(() => store.getSettings().overlay);
  // Respawn countdowns. It reads the kill log rather than holding its own copy — the learned
  // interval is derived, and only the due times are its own state (ADR 0092). Its pop goes down
  // the same `raiseAlert` as every other alert, so it wears the alert styling without knowing it.
  // (`raiseAlert` is a declaration below, hoisted — this is built here because the IPC needs it.)
  const spawns = createSpawnTracker({
    userDataDir: userData,
    kills: () => killLog.kills(),
    getSettings: () => store.getSettings().castAlerts,
    raise: raiseAlert,
  });
  spawns.onChanged(() => broadcast(CH.spawnsChanged, undefined));
  // The buff board. The mirror image of the spawn tracker: it holds a fact about *this session*
  // rather than about the world, so nothing about which buffs are up is persisted — only the
  // player's choices about which ones to watch. Both files' headers say why.
  const buffs = createBuffTracker({
    userDataDir: userData,
    getSettings: () => store.getSettings().castAlerts,
    raise: raiseAlert,
    // Injected, so the tracker owns no I/O and tests without a game install. The catalogue reads its
    // two files lazily, so handing these over costs nothing until a buff line actually turns up.
    lexicon: () => spells.lexicon(),
    facts: (spell, rank) => spells.find(spell, rank),
    // Read from the watched log's own filename, and asked each time rather than captured: switching
    // character switches whose pet `Kainos`s warder` is.
    player: () => characterFromLogFile(watcher.status().file) ?? "",
    // Asked rather than re-derived: what counts as a fight is the meter's rule and nobody else's
    // (ADR 0036). It decides whether a "rebuff" banner interrupts you or waits for the pull to end.
    inFight: () => combat.inFight(),
  });
  buffs.onChanged(() => broadcast(CH.buffsChanged, undefined));

  registerIpc({
    store,
    wiki,
    lucy,
    watcher,
    combat,
    history,
    scores,
    xp,
    hp,
    killLog,
    lootLog,
    updates,
    mobs,
    peerKills,
    contributorId,
    spawns,
    buffs,
    lookup,
    userData,
    logFile,
    getCurrentZone: () => currentZone,
    getCurrentLoc: () => currentLoc,
    getAppInfo: () => appInfo,
    broadcast,
  });

  // Quietly ask whether a newer build has been published; the renderer shows a banner if so.
  // Fire-and-forget and fail-safe — a slow or offline network never delays or breaks startup.
  // Only a packaged build has a version CI stamped a build number into; a dev run reports the
  // un-stamped `package.json` version, which every published build outranks, so it would always
  // "have an update" and the banner would only ever be noise.
  if (app.isPackaged) {
    void updates.check().then((info) => {
      if (info) broadcast(CH.updateAvailable, { url: info.url, version: info.version });
    });
  } else {
    log.debug("update check skipped: not a packaged build");
  }

  let watchKey = "";
  function startWatcher(): void {
    const s = store.getSettings();
    watchKey = `${s.logDir}|${s.activeLogFile}`;
    // The spell file lives in the same install the maps do, so a changed log folder may mean a
    // different one — tell the catalog before the first line arrives.
    spells.setLogDir(s.logDir);
    watcher.start(s.logDir, s.activeLogFile);
  }

  /** Put an alert on the overlay, above the app windows as well as the game. */
  function raiseAlert(alert: CastAlertEvent): void {
    getAlertWindow()?.moveTop();
    broadcast(CH.castAlert, alert);
  }
  // The whole alert path — match, style, and hold a cue until it's due — lives in one place
  // (`alert-router.ts`). Main's part is telling it where the player is and where a banner goes.
  const alerts = createAlertRouter({
    getSettings: () => store.getSettings().castAlerts,
    getScoreSettings: () => store.getSettings().highScores,
    getZone: () => currentZone,
    raise: raiseAlert,
  });
  // A record that falls gets a banner (if celebrations are on — the router decides) and a nudge to
  // every window, so a scoreboard that happens to be open updates itself rather than going stale.
  scores.onRecord((record) => {
    alerts.record(record);
    broadcast(CH.recordSet, record);
  });

  // The click-through alert overlay exists only while cast alerts are on — no point floating an
  // invisible window over the game otherwise, and turning alerts off should take it away.
  // Changing the chosen monitor *moves* it (`createAlertWindow` re-covers the display), rather
  // than racing a teardown against its replacement.
  function syncAlertWindow(settings: Settings): void {
    if (!settings.castAlerts.enabled) {
      // Alerts off is a request for silence, including from the cues already waiting — there'd be
      // no overlay left to show them on anyway.
      alerts.clear();
      closeAlertWindow();
      return;
    }
    createAlertWindow(settings.castAlerts.displayId);
  }

  store.onList((list) => broadcast(CH.listChanged, list));
  store.onSettings((settings) => {
    syncDebugFlag(settings);
    broadcast(CH.settingsChanged, settings);
    // Nothing in `overlay` is pushed onto a window from here: the scale is applied by each
    // renderer (ADR 0041), the opacity slider by each window's own `useWindowOpacity` (which
    // knows whether its ◐ is on), and always-on-top is now that window's own state (ADR 0074).
    syncAlertWindow(settings);
    tray?.setContextMenu(buildTrayMenu()); // keep the "Debug logging" checkbox in sync
    // Only re-target the watcher when the log location actually changed.
    if (`${settings.logDir}|${settings.activeLogFile}` !== watchKey) startWatcher();
  });
  watcher.onStatus((status) => {
    broadcast(CH.watcherStatusChanged, status);
    // The log's filename carries the character name, which is how the damage meter
    // knows which rows are yours (you + "<Character>`s warder").
    const character = characterFromLogFile(status.file) ?? "";
    combat.setPlayer(character);
    hp.setPlayer(character); // heals on you are logged by character name, not "you"
    killLog.setPlayer(character); // so your pet's death isn't filed as a mob you farm
    // A board belongs to a character, so naming them is what decides whose records these are — and
    // the first time we meet one, their own past fights seed the board rather than leaving it empty
    // with a dozen bars nobody has ever cleared. Capped high rather than unbounded: `search("")`
    // matches every fight, and the store holds a thousand at most.
    scores.setPlayer(character);
    scores.seed(history.search("", Number.MAX_SAFE_INTEGER).fights);
  });
  watcher.onZone((event) => {
    if (event.zone === currentZone) return;
    // Before `currentZone` moves, so the tracker can compare where you were with where you are:
    // changing the instance difficulty respawns everything, and it arrives as a different *variant*
    // of the same zone.
    spawns.noteZone(event.zone);
    // Buffs cross a zone line, so this is not a reason to drop the board — but a half-finished cast
    // does not, and that is what `noteZone` clears. See the tracker.
    buffs.noteZone(event.zone);
    currentZone = event.zone;
    combat.setZone(currentZone); // so finished fights are filed against the right camp
    broadcast(CH.zoneChanged, currentZone);
    // Your position does not survive the trip. A `/loc` describes a spot in *that* zone, and the
    // map redraws for this one — so keeping it plots you somewhere you have never stood, with
    // nothing on screen to say the dot is from the last zone. The trail is already wiped for this
    // reason (`usePlayerTrail`) and the kill log already refuses a fix from another zone; this is
    // the third reader of a `/loc` catching up with them. Cleared even between two difficulties of
    // one zone: that is the same teleport to the same zone-in point (ADR 0059).
    currentLoc = null;
    broadcast(CH.locChanged, null);
  });
  /**
   * The kill log changed, so whatever draws it — the map's heatmap and kill list, mob knowledge —
   * should re-read. Coalesced, because each notice costs a renderer the *whole* log: kills arrive
   * in bursts (a camp pull, or an entire replayed gap inside one poll), and 600 round trips of
   * 5000 records say nothing that one round trip doesn't.
   *
   * Fired only when something was actually newly recorded — the record/note calls return that —
   * so a re-read log is silent rather than making every window refetch for no change.
   */
  const killsChanged = coalesce(KILLS_NOTICE_MS, () => broadcast(CH.killsChanged, undefined));
  watcher.onLoc((event) => {
    currentLoc = event;
    killLog.noteLoc(event, currentZone); // the fix a later kill will be placed against
    broadcast(CH.locChanged, currentLoc);
  });
  watcher.onLoot((event) => {
    if (killLog.noteLoot(event)) killsChanged(); // ties the drop to the corpse it came from
    combat.recordSale(event); // an auto-sell is the only line that prices an item
    // Where you were standing, stamped the way a kill's is: no loot line names a zone, and a ledger
    // that can't say which camp a drop came from can't answer the question a ledger is for (ADR 0136).
    //
    // Built once and used for both, so the row the tab appends live is the row the ledger keeps — the
    // column fills in without waiting for a refetch. Not a mutation of `event`: that same object is
    // priced, matched against the shopping list and passed to the alert router, and none of those
    // asked for a new field.
    const drop = lootRecord(event, currentZone);
    lootLog.add(drop); // the always-on loot feed, so the tab is complete whenever it's opened
    broadcast(CH.lootEvent, drop);
    for (const entry of store.applyLoot(event)) {
      broadcast(CH.lootMatched, { event, entry });
      // And out loud, for an entry that asked to be told — the router owns every rule about whether
      // it actually speaks. The count it quotes is the row's own, runs and all, so the banner and the
      // list can't disagree about how far along you are (ADR 0105).
      alerts.loot(event, entry, effectiveNeeded(entry, runsFor(store.getList(), entry)));
    }
  });
  // Considering or hailing a mob you're timing counts as seeing it up — free evidence from what a
  // camper does anyway, through exactly the path the "It's up" button uses (ADR 0097).
  watcher.onSighting((event) => spawns.noteSighting(event.target, currentZone));
  watcher.onKill((event) => {
    combat.recordKill(event.target, event.at);
    if (killLog.record(event.target, event.killer, currentZone, event.at, event.logId, event.named, event.killerNamed)) {
      killsChanged();
      // After the record, never before: the tracker learns from the kill log, so the kill that
      // starts a countdown has to already be in it for the second kill of a named to time it.
      spawns.noteKill(event.target, currentZone, event.at, event.named);
    }
    // Your kill streak counts what *you* killed, so it asks the meter's own gate rather than a
    // looser one of its own: the log reports every death in earshot, and a stranger's kill at a busy
    // camp is not a link in your chain (ADR 0027). Asked *after* `recordKill`, so the fight scope has
    // already taken this event.
    if (combat.countsKill(event.target)) scores.noteKill(event.at, currentZone);
  });
  // Coin off a corpse goes to both ledgers it belongs in: the session's money (for a rate) and
  // the mob that paid it (for the long-run per-kill figure). An auto-sold item's coin is skipped
  // by both — the loot line above already priced it, and counting it here would double it.
  watcher.onCoin((event) => {
    combat.recordCoin(event);
    if (killLog.noteCoin(event)) killsChanged();
  });
  // Who's grouped with you decides whose fights the meter counts (ADR 0067). Nothing else
  // needs it, so it goes straight to the tracker that does.
  watcher.onParty((event) => combat.recordParty(event));
  watcher.onXp((event) => {
    combat.recordXp(event);
    if (event.pct) xp.addGain(event.pct); // creeps the player-stated "into level" forward
  });
  watcher.onLevel((event) => {
    xp.levelUp(event.level, event.at);
    hp.levelUp(event.level); // more hit points now, so the old bounds are void
  });
  // Logging in is the log's own "a new sitting starts here" (ADR 0054). Reset *before* the id
  // changes, so the fight in progress — and every counter on the Session tab — files under the
  // sitting it actually happened in.
  watcher.onLogin((event) => {
    combat.reset();
    history.startSession(event.at);
    // A camp arms its own alert once you have killed it twice **in one sitting**, so the tracker has
    // to know where one sitting ends. Nothing about the world is forgotten here — only the tally
    // (ADR 0152).
    spawns.noteSitting();
  });
  watcher.onCombat((event) => {
    combat.record(event);
    hp.record(event);
    // The alert path runs *after* the meter and the HP estimate, always: only an alert may ever wait
    // or be dropped, never the ledger. What it does with the event is `alert-router.ts`.
    alerts.combat(event);
    // After the alert router, and for the same reason it comes after the meter: the buff board is
    // the second thing that can put a banner up off its own bat, and nothing that keeps a ledger
    // may be delayed behind either of them.
    buffs.combat(event);
    // Then the scoreboard, last, for the same reason: a personal best is the only thing here that
    // puts a banner up off its own bat, and nothing else may be delayed behind it. After the meter
    // also means `combat.mine` has seen this line — a pet's first swing proves the pet.
    scores.offer(eventCandidates(event, combat.mine), currentZone);
    // Your own death ends the streak. Only yours: a group-mate's is not your chain, and a mob's
    // death arrives as a kill (above) rather than as this.
    if (event.kind === "death" && combat.mine(event.victim)) scores.noteDeath();
  });
  /**
   * The log's own clock, read off the lines as they arrive — *not* the wall clock, because a
   * replayed gap and the simulator both write old timestamps on purpose (`log-clock.ts`).
   */
  const logClock = createLogClock();
  watcher.onLine((line) => {
    logClock.note(line.at);
    alerts.line(line);
    // Landing sentences ("Bloop is surrounded by a brief lupine aura.") are the one thing that says
    // a buff went *up* on somebody, and no parser models them — they are per-spell prose out of the
    // game's own string file. Cheap to offer every line: the lexicon's first move is a map lookup on
    // the line's last word.
    buffs.line(line);
  });
  /**
   * A fight ends in quiet, and quiet logs nothing — so without this the last pull of a camp was
   * handed to history, and its records to the scoreboard, only when the *next* pull started. On a
   * real log that was a median 32 seconds late, a minute or worse for three fights in ten, and
   * once an hour. It reads as broken chiefly on a fresh install, where there is no history and no
   * board behind it to hide the lag.
   */
  const settleTimer = setInterval(() => combat.settle(logClock.now()), SETTLE_MS);
  settleTimer.unref?.(); // a timer must never be the reason the process stays up
  // Everything logged while the app was closed has just been fed through the live path, which is
  // what makes the app's state independent of when it was launched. The one thing that *isn't*
  // simply "state" is the live meter: its totals mean "this sitting". Restart mid-camp and carrying
  // on is exactly right; come back the next evening and last night's fights belong to history
  // (where they already are, via `onFightEnd`) rather than to the panel you're looking at now.
  watcher.onCaughtUp(({ file, bytes, lastAt }) => {
    if (!bytes) return;
    const continuing = isSameSitting(lastAt);
    log.debug("log gap replayed", { file, bytes, lastAt, continuing });
    // A replayed gap is the best sample we ever get of what the grammar can't read — a whole
    // evening at once — so this is where the tally is worth printing. Debug-gated like
    // everything else, and by *shape* rather than by line: see `unmatched-lines.ts` on why the
    // list is a debugging aid to read rather than something to attach to a report.
    const lines = watcher.unmatched();
    const { seen, ignored, shapes, dropped } = lines.stats();
    if (seen) log.debug("unparsed lines", { seen, ignored, shapes, dropped, top: lines.top(15) });
    // Before the reset, so a fight the gap itself finished is filed as the kill (or death) that
    // finished it rather than as something the app cut short — `taken-survived` reads that field.
    combat.settle(logClock.now());
    if (!continuing) combat.reset();
  });
  /**
   * From here on the log is *news*, so a record is worth saying out loud (see `scores.setQuiet`).
   *
   * Its own listener, registered **after** the one above, for two reasons that pull the same way:
   * that handler returns early when there was no gap — and a launch with nothing to replay still has
   * to come off mute — and its last act is `combat.reset()`, which banks the fight the replay was in
   * the middle of. Those records are as old as the rest of the gap, so unmuting has to follow.
   */
  watcher.onCaughtUp(() => scores.setQuiet(false));
  // Fights are filed as they end, so history survives a crash as well as a clean quit — and the same
  // moment is when a fight's own records are claimed, since "most damage in a fight" isn't knowable
  // until the fight has one. Its hits are re-offered too, which changes nothing while the app is
  // running (the live line got there first and a tie doesn't win) and is what makes a fight a
  // complete record of itself for the day it seeds a board.
  combat.onFightEnd((fight) => {
    history.add(fight, combat.zone(), watcher.status().file);
    scores.offer(fightCandidates(fight), combat.zone());
    // The moment a rebuff reminder becomes actionable, and the moment a root reminder stops being:
    // held banners are said and enemy-targeted rows are dropped. `endReason` is what tells the two
    // apart from a fight that ended by killing *you*, where neither applies.
    buffs.noteFightEnd(fight.endReason ?? "timeout");
  });
  xp.onChange((progress) => broadcast(CH.xpChanged, progress));
  hp.onChange((estimate) => broadcast(CH.hpChanged, estimate));
  combat.onChange(
    coalesce(250, () => {
      // Snapshot pulled here (once per 250ms), not computed on every combat line.
      const snapshot = combat.snapshot();
      // Debug-gated: the one line that answers "is the meter seeing this fight?"
      log.debug("combat", {
        fight: snapshot.fight.totalDealt,
        session: snapshot.session.totalDealt,
        rows: snapshot.fight.byCombatant.length,
      });
      broadcast(CH.combatChanged, snapshot);
    }),
  );

  // Global hotkey to show/hide the app window — always works even when the game has
  // focus, so the float can never get "stuck" behind the game.
  function toggleWindow(): void {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      if (win.isVisible() && !win.isMinimized()) {
        win.hide();
      } else {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    } else {
      createMainWindow(store.getSettings().overlay);
    }
  }
  const overlayReg = globalShortcut.register(OVERLAY_HOTKEY.accelerator, toggleWindow);
  if (!overlayReg) log.warn("could not register window hotkey:", OVERLAY_HOTKEY.accelerator);

  // System tray: show/hide + the dev-only options (kept out of the in-app UI).
  let tray: Tray | null = null;
  function buildTrayMenu(): Menu {
    const s = store.getSettings();
    return Menu.buildFromTemplate([
      { label: "Show / Hide EQ List", click: () => toggleWindow() },
      { type: "separator" },
      {
        label: "Debug logging",
        type: "checkbox",
        checked: s.debug,
        click: (item) => store.updateSettings({ debug: item.checked }),
      },
      { label: "Open debug log", click: () => void shell.openPath(logFile) },
      {
        label: "Open developer tools",
        click: () => {
          // Open devtools for every real window (main + map) so per-window logs —
          // e.g. the map's ping broadcast — are visible in their own console.
          const wins = [getMainWindow(), getMapWindow()].filter(
            (w): w is BrowserWindow => !!w && !w.isDestroyed(),
          );
          if (!wins.length) wins.push(createMainWindow(store.getSettings().overlay));
          for (const w of wins) w.webContents.openDevTools({ mode: "detach" });
        },
      },
      {
        label: "Reset window position",
        click: () => {
          resetPositions();
          const win = getMainWindow() ?? createMainWindow(store.getSettings().overlay);
          win.center();
          win.show();
          win.focus();
        },
      },
      { type: "separator" },
      { label: "Quit EQ List", click: () => { beginQuit(); app.quit(); } },
    ]);
  }
  function createTray(): void {
    const iconPath = path.join(app.getAppPath(), "out", "favicon.ico");
    let image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
      // An empty tray image is a *blank space* in the notification area: still there, still clickable,
      // but nothing to aim at — and the tray is where Quit and the debug log live, so a launch that
      // also failed to show a window would leave the app with no reachable interface at all.
      log.warn("tray icon missing or unreadable:", iconPath);
      image = nativeImage.createEmpty();
    }
    tray = new Tray(image);
    tray.setToolTip("EQ List");
    tray.setContextMenu(buildTrayMenu());
    tray.on("click", () => toggleWindow());
  }
  // The hotkey toggles: a selector that has stopped responding can always be dismissed from the
  // keyboard, without depending on the window itself to have focus for Escape.
  const lookupReg = globalShortcut.register(LOOKUP_HOTKEY.accelerator, () => {
    if (lookup.isOpen()) lookup.cancel();
    else void lookup.open();
  });
  if (!lookupReg) log.warn("could not register lookup hotkey:", LOOKUP_HOTKEY.accelerator);
  appInfo = {
    logFile,
    hotkeys: [
      { action: "Show / hide window", label: OVERLAY_HOTKEY.label, registered: overlayReg },
      { action: "Screengrab item lookup", label: LOOKUP_HOTKEY.label, registered: lookupReg },
    ],
  };

  const mainWin = createMainWindow(store.getSettings().overlay);
  createTray();
  startWatcher();

  // The control window is the one being waited for; the other two are its siblings, and each is a
  // whole Chromium renderer parsing the app bundle. Created in the same tick they spiked every core
  // at once — the launch stutter you could feel in the mouse — for no gain, since none of them can
  // show anything until they've loaded anyway. Started once the control window has painted instead.
  afterLoad(mainWin, () => {
    syncAlertWindow(store.getSettings());
    // Restore the map window if it was open last session.
    if (wasMapOpen()) createMapWindow(store.getSettings().overlay);
    log.debug("sibling windows started");
    // Warm the item catalogue in the background, so the Items tab is instant the *first* time too
    // rather than only afterwards. It is ~400ms of reading our own disk cache — no network, nothing
    // fetched — and the walk yields between chunks, so it costs a freshly-painted window nothing.
    // Here rather than at launch for the same reason the log repair is: after the window has painted,
    // a background job nobody has to know about.
    setTimeout(() => {
      void wiki.cachedItems().catch(() => {
        /* a cache we couldn't read is the Items tab's problem to report, not a launch failure */
      });
    }, CATALOGUE_WARM_MS);
    // A release that changed how a log is read asked for the logs to be read again, and this is the
    // start that does it (ADR 0129). Here rather than earlier because it is seconds of synchronous
    // parsing per log: on the launch path it would be a launch that hangs, and after the window has
    // painted it is a background repair nobody has to know about. Fire-and-forget by design — it
    // never throws, and a repair that didn't happen leaves the data exactly as stale as it was.
    void reReadLogs({
      userDataDir: userData,
      history,
      killLog,
      lootLog,
      logDir: store.getSettings().logDir,
      live: characterFromLogFile(watcher.status().file) ?? "",
    }).then((report) => {
      if (!report) return;
      // The figures behind the scoreboard just moved, so re-offer them — silently, by `absorb`'s own
      // contract, since a record from an evening long past is not news however good it was.
      scores.absorb(history.search("", Number.MAX_SAFE_INTEGER).fights);
      scores.flush();
      // Everything that reads a stored list once when it opens should read it again.
      broadcast(CH.killsChanged, undefined);
      broadcast(CH.dataChanged, undefined);
    });
  });
  log.debug("app ready");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(store.getSettings().overlay);
  });

  // Don't lose the last pull on the way out: close the fight in progress, then get it
  // (and any debounced writes) to disk.
  app.on("before-quit", () => {
    clearInterval(settleTimer);
    combat.flush();
    history.flush();
    xp.flush();
    hp.flush();
    killLog.flush();
    lootLog.flush();
    scores.flush();
    mobs.flush();
    peerKills.flush();
    spawns.flush();
    spawns.dispose();
    buffs.flush();
    watcher.stop(); // records the read position, so the next run resumes exactly here
    cursor.flush();
  });
  })
  .catch((err: unknown) => {
    // Startup threw before it got a window up, so there is nothing on screen and nothing on the way:
    // no window, no tray, and `window-all-closed` deliberately keeps the process alive — which
    // without this leaves the app running as an interface-less process the user can only end from
    // Task Manager, having been given no reason at all.
    //
    // A dialog, which the rest of the app avoids because it pops over the game
    // ([ADR 0052](../specs/decisions/0052-an-error-goes-to-the-log-not-the-screen.md)) — moot when
    // the alternative is silence, and it is the only channel left before any window exists. Then
    // out, rather than sitting there resident: a launch that produced no app has failed.
    log.error("startup failed", err);
    try {
      dialog.showErrorBox("EQ List could not start", `${String(err)}\n\nDetails: ${debugLogPath()}`);
    } catch {
      /* no windowing at all — the log line above is what is left */
    }
    app.exit(1);
  });

  // Flush window state synchronously and mark quitting before windows tear down.
  app.on("before-quit", () => beginQuit());
  app.on("will-quit", () => globalShortcut.unregisterAll());

  // Single-window app with a tray: the ✕ hides to tray, so don't quit when the
  // window closes — the tray (or the hotkey) brings it back. Quit is via the tray.
  app.on("window-all-closed", () => {
    /* stay resident in the tray */
  });
}
