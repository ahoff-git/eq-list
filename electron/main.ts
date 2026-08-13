/**
 * main.ts — Electron entry point. Boots the store, wiki client and log watcher,
 * registers IPC, opens the control window, and fans out main→renderer events:
 *   - store changes  → every window re-renders the same list/settings
 *   - loot events     → broadcast raw, then matched entries after the store applies them
 *   - settings changes → overlay restyled + watcher re-targeted when the log path moves
 */
import { app, BrowserWindow, globalShortcut, shell, Tray, Menu, nativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";
import { registerAppProtocolScheme, handleAppProtocol } from "./protocol";
import { createStore } from "./store";
import { createWikiClient } from "./wiki";
import { createLogWatcher } from "./log-watcher";
import { createLogCursor } from "./log-cursor";
import { isSameSitting } from "../src/shared/log-catchup";
import { createCombatStats } from "./combat-stats";
import { createCombatHistory } from "./combat-history";
import { createXpProgress } from "./xp-progress";
import { createHpEstimate } from "./hp-estimate";
import { createKillLog } from "./kill-log";
import { createLootLog } from "./loot-log";
import { createUpdateChecker } from "./update-check";
import { createMobKnowledge } from "./mob-knowledge";
import { createOcr } from "./ocr";
import { createLookup } from "./lookup";
import { registerIpc } from "./ipc";
import { createMainWindow, createMapWindow, createAlertWindow, closeAlertWindow, getAlertWindow, getMainWindow, getMapWindow, showInSearch } from "./windows";
import { resetPositions, beginQuit, wasMapOpen } from "./window-state";
import { CH } from "../src/shared/ipc-channels";
import { OVERLAY_HOTKEY, LOOKUP_HOTKEY } from "../src/shared/constants";
import { createLogger, setLogSink, formatLogParts } from "../src/shared/logging";
import { characterFromLogFile } from "../src/shared/log-parser";
import { alertStyle, matchCast, matchFade, matchLine, watchesLines } from "../src/shared/cast-alerts";
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
 * A deadline on waiting for the control window before starting its siblings anyway.
 *
 * The wait is for `did-finish-load`, which a window that fails to load never fires — and the cast-alert
 * overlay never being created means no alerts at all, which is a feature silently gone rather than a slow
 * launch. So the deferral gives up: long enough that the ordinary case really is "after the window is up",
 * short enough that a broken load costs a couple of seconds rather than the feature.
 */
const SIBLING_WINDOW_DEADLINE_MS = 4000;

/** Run `fn` once `win` has loaded — or at `SIBLING_WINDOW_DEADLINE_MS`, whichever comes first. */
function afterLoad(win: BrowserWindow, fn: () => void): void {
  let ran = false;
  const once = () => {
    if (ran) return;
    ran = true;
    fn();
  };
  win.webContents.once("did-finish-load", once);
  setTimeout(once, SIBLING_WINDOW_DEADLINE_MS);
}

/** Mirror the debug toggle into the env flag that logging.ts reads. */
function syncDebugFlag(settings: Settings): void {
  if (settings.debug) process.env.EQL_DEBUG = "1";
  else delete process.env.EQL_DEBUG;
}

const DEEP_LINK_SCHEME = "eqlist";

/** Bring the control window to the front (or make one) — for deep links / relaunch. */
function focusMainWindow(): void {
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
    handleAppProtocol(path.join(app.getAppPath(), "out"));

  const userData = app.getPath("userData");

  // Mirror logs to a file so debug output is visible without a terminal. Fresh each
  // launch; only what passes the debug gate is written (warn/error always).
  const logFile = path.join(userData, "eqlist-debug.log");
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

  // Main-process failures land in that same file rather than Electron's default dialog, which
  // pops over the game. Handling `uncaughtException` also means we keep running instead of
  // exiting — for an overlay that's the better trade: a broken feature beats the whole app
  // disappearing mid-fight, and the log says what broke.
  process.on("uncaughtException", (err) => log.error("uncaught", err));
  process.on("unhandledRejection", (reason) => log.error("unhandled rejection", reason));

  const store = createStore(userData);
  const wiki = createWikiClient(path.join(userData, "wiki-cache"));
  // Where we had read to when we last ran, so anything logged since is read as the news it is
  // rather than being skipped ([ADR 0044](../specs/decisions/0044-the-log-position-outlives-the-app.md)).
  const cursor = createLogCursor(userData);
  const watcher = createLogWatcher(cursor);
  const combat = createCombatStats();
  const history = createCombatHistory(userData);
  const xp = createXpProgress(userData);
  const hp = createHpEstimate(userData);
  const killLog = createKillLog(userData);
  const lootLog = createLootLog(userData);
  const updates = createUpdateChecker(userData, app.getVersion());
  const mobs = createMobKnowledge(userData, killLog);
  const ocr = createOcr(path.join(userData, "tesseract-cache"));
  const lookup = createLookup(ocr, showInSearch);

  let currentZone: string | null = null;
  let currentLoc: LocEvent | null = null;
  let appInfo: AppInfo = { hotkeys: [], logFile };

  syncDebugFlag(store.getSettings());
  registerIpc({
    store,
    wiki,
    watcher,
    combat,
    history,
    xp,
    hp,
    killLog,
    lootLog,
    updates,
    mobs,
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
    watcher.start(s.logDir, s.activeLogFile);
  }

  // The click-through alert overlay exists only while cast alerts are on — no point floating an
  // invisible window over the game otherwise, and turning alerts off should take it away.
  // Changing the chosen monitor *moves* it (`createAlertWindow` re-covers the display), rather
  // than racing a teardown against its replacement.
  function syncAlertWindow(settings: Settings): void {
    if (!settings.castAlerts.enabled) {
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
  });
  watcher.onZone((event) => {
    if (event.zone === currentZone) return;
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
    lootLog.add(event); // the always-on loot feed, so the tab is complete whenever it's opened
    broadcast(CH.lootEvent, event);
    for (const entry of store.applyLoot(event)) {
      broadcast(CH.lootMatched, { event, entry });
    }
  });
  watcher.onKill((event) => {
    combat.recordKill(event.target, event.at);
    if (killLog.record(event.target, event.killer, currentZone, event.at, event.logId)) killsChanged();
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
  });
  /** Put an alert on the overlay, above the app windows as well as the game. */
  function raiseAlert(alert: CastAlertEvent): void {
    getAlertWindow()?.moveTop();
    broadcast(CH.castAlert, alert);
  }
  watcher.onCombat((event) => {
    combat.record(event);
    hp.record(event);
    // Dispel prep: flash the overlay when a watched spell begins casting — and, for a watch
    // that asked, when one fades ("your root is gone, re-root").
    const alerts = store.getSettings().castAlerts;
    const cast = event.kind === "cast" ? matchCast(event, alerts) : null;
    const fade = event.kind === "buff-faded" ? matchFade(event, alerts) : null;
    // The style and the wording are both resolved here, from the watch that matched, and travel
    // with the alert — the overlay window never sees the watch itself.
    if (cast && event.kind === "cast") {
      raiseAlert({
        caster: event.caster,
        spell: event.spell,
        at: event.at,
        event: "cast",
        message: cast.message,
        style: alertStyle(alerts, cast),
      });
    } else if (fade && event.kind === "buff-faded") {
      raiseAlert({
        caster: "",
        spell: event.spell,
        at: event.at,
        event: "fade",
        target: event.pet ? "your pet" : event.target,
        message: fade.message,
        style: alertStyle(alerts, fade),
      });
    }
  });
  // The log says plenty no parser models — "BunnySlayer invites you to a party", a tell. A watch
  // pointed at raw lines catches those. Every line comes through here, so the cheap "is anyone
  // even watching lines?" check comes first; only then do we match.
  watcher.onLine((line) => {
    const alerts = store.getSettings().castAlerts;
    if (!watchesLines(alerts)) return;
    const watch = matchLine(line, alerts);
    if (!watch) return;
    raiseAlert({
      caster: "",
      spell: watch.spell,
      text: line.message,
      at: line.at,
      event: "line",
      message: watch.message,
      style: alertStyle(alerts, watch),
    });
  });
  // Everything logged while the app was closed has just been fed through the live path, which is
  // what makes the app's state independent of when it was launched. The one thing that *isn't*
  // simply "state" is the live meter: its totals mean "this sitting". Restart mid-camp and carrying
  // on is exactly right; come back the next evening and last night's fights belong to history
  // (where they already are, via `onFightEnd`) rather than to the panel you're looking at now.
  watcher.onCaughtUp(({ file, bytes, lastAt }) => {
    if (!bytes) return;
    const continuing = isSameSitting(lastAt);
    log.debug("log gap replayed", { file, bytes, lastAt, continuing });
    if (!continuing) combat.reset();
  });
  // Fights are filed as they end, so history survives a crash as well as a clean quit.
  combat.onFightEnd((fight) => history.add(fight, combat.zone(), watcher.status().file));
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
    if (image.isEmpty()) image = nativeImage.createEmpty();
    tray = new Tray(image);
    tray.setToolTip("EQ List");
    tray.setContextMenu(buildTrayMenu());
    tray.on("click", () => toggleWindow());
  }
  const lookupReg = globalShortcut.register(LOOKUP_HOTKEY.accelerator, () => lookup.open());
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
  });
  log.debug("app ready");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow(store.getSettings().overlay);
  });

  // Don't lose the last pull on the way out: close the fight in progress, then get it
  // (and any debounced writes) to disk.
  app.on("before-quit", () => {
    combat.flush();
    history.flush();
    xp.flush();
    hp.flush();
    killLog.flush();
    lootLog.flush();
    mobs.flush();
    watcher.stop(); // records the read position, so the next run resumes exactly here
    cursor.flush();
  });
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
