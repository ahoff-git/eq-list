/**
 * windows.ts — creates the app's single window and knows how to load the renderer.
 *
 * There is one window: a frameless, translucent, resizable float (the "overlay"
 * look) that hosts the whole app (list, hunt, search, session, settings). It can be
 * pinned always-on-top and hidden to the tray. In dev the renderer is the `next dev`
 * server; in prod it's the exported bundle served over app:// (see protocol.ts).
 *
 * A window reopens the way it was left — position, size, maximized, and its title-bar toggles
 * (pinned / ◐ opaque / 👻 click-through), all from window-state.ts and applied here as the window
 * is created, so none of it arrives a frame late. DevTools only open when EQL_DEVTOOLS is set,
 * not on every dev run.
 */
import { app, BrowserWindow, screen } from "electron";
import path from "node:path";
import {
  savedBounds,
  rememberBounds,
  setMapOpen,
  isQuitting,
  setMaximized,
  wasMaximized,
  windowToggles,
  type Bounds,
} from "./window-state";
import { CH } from "../src/shared/ipc-channels";
import { windowOpacity } from "../src/shared/constants";
import { createLogger } from "../src/shared/logging";
import type { OverlaySettings, WindowToggles } from "../src/shared/types";

const log = createLogger("windows");

/**
 * Bridge a window's renderer console into the main-process log, so renderer output
 * (e.g. map ping broadcasts) shows up in the same terminal + debug file as everything
 * else — renderer logs otherwise live only in that window's DevTools. Chromium levels
 * (Electron 33: 0=verbose, 1=info, 2=warning, 3=error) map onto the logger: warn/error
 * always print, log/info/debug are gated by the main debug flag (on in dev), which
 * mirrors the renderer's own gate so the two ends agree on what's noise.
 */
function pipeRendererConsole(win: BrowserWindow, role: string): void {
  const rlog = createLogger(`renderer:${role}`);
  win.webContents.on("console-message", (_e, level, message) => {
    if (level >= 3) rlog.error(message);
    else if (level === 2) rlog.warn(message);
    else rlog.debug(message);
  });
}

/**
 * Keep a frameless window's own maximize/restore button honest, and remember the state.
 *
 * A framed window gets this from the OS; ours draw their own titlebar, so the renderer has
 * to be told — including after a reload, which starts the button from scratch. Maximizing
 * from any source (our button, a double-click on the drag region, Win+Up, the taskbar) comes
 * back through the same two window events, so the button can never disagree with reality.
 */
function reportMaximize(role: "main" | "map", win: BrowserWindow): void {
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send(CH.winMaximizeChanged, win.isMaximized());
  };
  win.on("maximize", () => {
    setMaximized(role, true);
    send();
  });
  win.on("unmaximize", () => {
    setMaximized(role, false);
    send();
  });
  win.webContents.on("did-finish-load", send);
}

/**
 * Put a newly created window into the condition it was left in — the rest of "how a window was
 * left" ([ADR 0074](../specs/decisions/0074-how-a-window-was-left-is-window-state.md)), after
 * the bounds and the maximize.
 *
 * Opacity isn't here: it goes in the **constructor** instead (`windowOpacity`), because a window
 * shown translucent and corrected a frame later is a visible flash, while these two aren't.
 */
function applyToggles(win: BrowserWindow, toggles: WindowToggles): void {
  // Pinned is the default: the app is a float over the game, and a float behind it is no use.
  win.setAlwaysOnTop(toggles.pinned ?? true, "screen-saver");
  // The renderer's `useClickThrough` takes it from here; this is so the very first click lands
  // where the user left it pointing, rather than waiting for the window to finish loading.
  if (toggles.clickThrough) win.setIgnoreMouseEvents(true, { forward: true });
}

/** Open maximized if that's how it was left — the same courtesy a normal window extends. */
function restoreMaximized(role: "main" | "map", win: BrowserWindow): void {
  if (wasMaximized(role)) win.maximize();
}

/**
 * Put a restored window on exactly its saved bounds. The constructor can't be trusted with them.
 *
 * On a mixed-DPI setup Electron sizes a new window using the *primary* display's scale factor, so a
 * window reopened on a 125%-scaled monitor opens 1.25× too big (asking for 602×815 measured 754×1022).
 * Those inflated bounds are what got saved on close, so the window grew on every single launch — the
 * "windows resize themselves each time" bug. Re-asserting the bounds once the window exists lands it
 * where the user left it; same fix, same reason, as `coverDisplay` below.
 *
 * Call this *before* `restoreMaximized`, so a window that opens maximized still has the right size to
 * restore down to.
 */
function restoreBounds(win: BrowserWindow, bounds: Bounds | null): void {
  if (!bounds) return;
  const apply = () => {
    // Never fight a maximize: saved bounds are the size to restore *to*, not the size to be.
    if (!win.isDestroyed() && !win.isMaximized()) win.setBounds(bounds);
  };
  apply(); // now, so the window is never shown at the wrong size
  win.once("ready-to-show", apply); // and again once realized, which some builds need
}

/**
 * ── An overlay must not outlive its renderer ───────────────────────────────────────────────
 *
 * Every window this app puts over the game is frameless and always-on-top, and two of them cover a
 * whole display. Their titlebar, their close button, their key handling and — for the alert overlay
 * — the click-through that makes them harmless are all drawn or driven by the renderer. So a
 * renderer that dies, hangs, or never loads leaves a window that **cannot be operated by anyone**:
 * no button to press, no key it will answer, and if it happened to be solid at that moment, a
 * transparent sheet over the whole screen that eats every click.
 *
 * The rule these three helpers enforce is one sentence: **a window that can no longer be operated
 * does not get to keep the screen.** What "not keeping it" means differs — a pure overlay is
 * destroyed, the app's own windows are stripped of their powers and reloaded — but nothing is left
 * both broken and in the way.
 */

/** Everything a window can do to the screen, taken away. Safe on a window mid-teardown. */
function makeHarmless(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  try {
    win.setAlwaysOnTop(false); // drop behind the game rather than sit over it
    win.setIgnoreMouseEvents(true, { forward: true }); // every click goes to whatever is underneath
  } catch (e) {
    log.warn("could not neutralize window:", (e as Error).message);
  }
}

/**
 * Call `react` when a window's renderer is no longer answering — crashed, hung, or failed to load.
 *
 * All three are the same fact from the screen's point of view (nothing is driving this window any
 * more), so they get one handler and the caller decides what that is worth. `unresponsive` can fire
 * for a renderer merely busy and may recover, which is why no reaction here may be worse than the
 * hang it answers.
 */
function guardRenderer(win: BrowserWindow, role: string, react: (why: string, fatal: boolean) => void): void {
  const lost = (why: string, fatal: boolean) => {
    if (win.isDestroyed()) return;
    log.warn(`${role} window: ${why}`);
    react(why, fatal);
  };
  // Hanging is the recoverable one — Chromium says `responsive` when the renderer catches up — so it
  // is reported as non-fatal and the reaction is expected to be reversible.
  win.on("unresponsive", () => lost("renderer stopped responding", false));
  win.webContents.on("render-process-gone", (_e, d) => lost(`renderer gone (${d.reason})`, true));
  win.webContents.on("did-fail-load", (_e, code, desc, _url, isMainFrame) => {
    // -3 is ERR_ABORTED — what a navigation or a destroy mid-load looks like, not a failure.
    if (!isMainFrame || code === -3) return;
    lost(`failed to load (${code} ${desc})`, true);
  });
}

/**
 * The reaction for the app's own windows (main, map): make it harmless, then try once to bring it
 * back. Destroying them is not on the table — they are the app — but a frameless, always-on-top
 * window whose renderer is gone has no titlebar to grab and no ✕ to press, so leaving it as it is
 * would be parking a brick over the game. One reload attempt, because a renderer that dies on load
 * would otherwise reload for ever.
 */
function reviveOnce(win: BrowserWindow, role: "main" | "map"): void {
  let tried = false;
  // Coming back from a hang: the window was stripped to unblock the screen, so give it back what it
  // had. Reloading it instead would throw away a perfectly live window for being slow.
  win.on("responsive", () => {
    log.warn(`${role} window: renderer responsive again`);
    if (!win.isDestroyed()) applyToggles(win, windowToggles(role));
  });
  guardRenderer(win, role, (_why, fatal) => {
    makeHarmless(win); // first, always: whatever else is true, it must stop holding the screen
    if (!fatal) return; // a hang may pass; `responsive` puts it back
    if (tried) {
      log.warn(`${role} window: already tried reviving once — leaving it inert but harmless`);
      return;
    }
    tried = true;
    win.webContents.once("did-finish-load", () => {
      tried = false; // healthy again, so a crash much later still gets its one attempt
      // `makeHarmless` took the pin and the click-through away to unblock the screen; a window that
      // came back has to come back as the user left it, or a crash would quietly demote it.
      applyToggles(win, windowToggles(role));
    });
    try {
      win.reload();
    } catch (e) {
      log.warn(`${role} window: reload failed:`, (e as Error).message);
    }
  });
}

const DEV = !!process.env.EQL_DEV;
const DEV_URL = "http://localhost:3000";
const APP_URL = "app://local";
const PRELOAD = path.join(__dirname, "preload.js");

/**
 * How long after creating a full-display window to re-assert its bounds.
 *
 * Both the alert overlay and the screengrab selector have to cover exactly one monitor, and on a
 * mixed-DPI setup Electron reports the bounds in the *primary* display's scale factor until the
 * window is realized — so the first `setBounds` can land the window half off-screen. Re-asserting
 * once the frame exists fixes it; a beat later than "ready-to-show", because some builds only honour
 * the resize then. Short enough not to be visible, long enough to be after realization.
 */
const REALIZE_DELAY_MS = 60;

/** The app/taskbar icon — the same .ico the tray and web favicon use, packaged in out/. */
function windowIcon(): string {
  return path.join(app.getAppPath(), "out", "favicon.ico");
}

/**
 * Note there's no zoom handling here any more. The interface scale is a CSS `zoom` applied by
 * each window's own renderer (`useUiScale`): Chromium's `setZoomFactor` is per **origin**, and
 * every window is served from one, so it could only ever hold a single scale for all of them —
 * which is why the map's A−/A+ used to move the main window too.
 */

/**
 * Next's dev error overlay, hidden in every window we own (the *why* is [ADR 0052]:
 * full-viewport UI on a frameless always-on-top window reads as the game blacking out,
 * and the overlay takes keyboard focus with it).
 *
 * This has to be injected from the main process rather than written in `globals.css`,
 * because the case that most needs hiding is the one a stylesheet can't cover: on a
 * **compile error** Next serves a document with no app bundle at all, so app CSS — the
 * rule included — never loads, and the overlay mounts straight onto `<body>` and focuses
 * itself. Injected per document, since `insertCSS` is dropped on navigation and `next dev`
 * reloads on its own.
 */
const HIDE_DEV_OVERLAY = "[data-nextjs-dev-overlay], nextjs-portal { display: none !important }";

function load(win: BrowserWindow, route: string): void {
  if (DEV) {
    win.webContents.on("dom-ready", () => void win.webContents.insertCSS(HIDE_DEV_OVERLAY));
    void win.loadURL(`${DEV_URL}/${route}`);
  } else {
    void win.loadURL(`${APP_URL}/${route ? `${route}/` : ""}index.html`);
  }
}

let mainWindow: BrowserWindow | null = null;
let mapWindow: BrowserWindow | null = null;
let alertWindow: BrowserWindow | null = null;
/** The display the overlay was asked for, so a rebuild after a crash lands on the same monitor. */
let alertDisplayId: number | undefined;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
export function getMapWindow(): BrowserWindow | null {
  return mapWindow;
}
export function getAlertWindow(): BrowserWindow | null {
  return alertWindow;
}

export function createMainWindow(overlay?: OverlaySettings): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  const bounds = savedBounds("main");
  const toggles = windowToggles("main");
  mainWindow = new BrowserWindow({
    width: 460,
    height: 780,
    ...(bounds ?? {}),
    minWidth: 340,
    minHeight: 420,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    title: "EQ List",
    icon: windowIcon(),
    alwaysOnTop: toggles.pinned ?? true,
    // Opened at the translucency it was left at — the saved slider, or full if its ◐ was on —
    // so there's no flash; the renderer owns it from then on (`useWindowOpacity`).
    opacity: windowOpacity(toggles.opaque, overlay?.opacity ?? 1),
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=main"],
    },
  });
  restoreBounds(mainWindow, bounds);
  rememberBounds("main", mainWindow);
  reportMaximize("main", mainWindow);
  pipeRendererConsole(mainWindow, "main");
  reviveOnce(mainWindow, "main");
  applyToggles(mainWindow, toggles);
  mainWindow.once("ready-to-show", () => {
    if (mainWindow) restoreMaximized("main", mainWindow);
    mainWindow?.show();
  });
  // Mouse thumb buttons (and some keyboards) fire browser back/forward as an
  // app-command; forward it so the renderer can walk its own page history instead
  // of the OS trying to navigate a non-existent browser.
  mainWindow.on("app-command", (_e, cmd) => {
    if (cmd === "browser-backward") mainWindow?.webContents.send(CH.navCommand, "back");
    else if (cmd === "browser-forward") mainWindow?.webContents.send(CH.navCommand, "forward");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  load(mainWindow, "");
  if (process.env.EQL_DEVTOOLS) mainWindow.webContents.openDevTools({ mode: "detach" });
  return mainWindow;
}

/**
 * The map window — a sibling float (frameless, translucent, resizable, always-on-top)
 * that shows the current zone's map with the player's live location. Opened on
 * demand from the main window's 🗺 button; it receives zone/loc via the same
 * main→renderer broadcasts as every other window. Closing it destroys it (unlike the
 * main window's hide-to-tray) — it's a secondary surface.
 */
export function createMapWindow(overlay?: OverlaySettings): BrowserWindow {
  if (mapWindow && !mapWindow.isDestroyed()) {
    mapWindow.show();
    mapWindow.focus();
    return mapWindow;
  }
  const bounds = savedBounds("map");
  const toggles = windowToggles("map");
  mapWindow = new BrowserWindow({
    width: 680,
    height: 720,
    ...(bounds ?? {}),
    minWidth: 320,
    minHeight: 320,
    show: false,
    frame: false,
    transparent: true,
    resizable: true,
    title: "EQ List — Map",
    icon: windowIcon(),
    alwaysOnTop: toggles.pinned ?? true,
    // The same saved slider as the main window (one look for the app), but this window's own ◐ —
    // set up front for the same reason (no flash) and owned by its renderer from then on.
    opacity: windowOpacity(toggles.opaque, overlay?.opacity ?? 1),
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=map"],
    },
  });
  restoreBounds(mapWindow, bounds);
  rememberBounds("map", mapWindow);
  reportMaximize("map", mapWindow);
  pipeRendererConsole(mapWindow, "map");
  reviveOnce(mapWindow, "map");
  setMapOpen(true); // so the next launch restores it (see main.ts startup)
  applyToggles(mapWindow, toggles);
  mapWindow.once("ready-to-show", () => {
    if (mapWindow) restoreMaximized("map", mapWindow);
    mapWindow?.show();
  });
  const created = mapWindow;
  created.on("closed", () => {
    // Only if it's still this window: reopening while the old one is closing would otherwise
    // let the stale `closed` null out the new reference (the bug the alert overlay hit).
    if (mapWindow === created) mapWindow = null;
    // A user-initiated close forgets the window; a close during app quit keeps the
    // "was open" flag so we can reopen it next launch.
    if (!isQuitting()) setMapOpen(false);
  });
  load(mapWindow, "map");
  if (process.env.EQL_DEVTOOLS) mapWindow.webContents.openDevTools({ mode: "detach" });
  return mapWindow;
}

/**
 * The cast-alert overlay — a frameless, transparent, click-through window pinned above
 * everything and stretched over the primary display, so a dispel-prep banner (and the red
 * border flash) appears *on top of the game*, not buried in the app window behind it.
 *
 * It never takes focus and never eats a click (`setIgnoreMouseEvents`), so it can't disrupt
 * play — which is also why it can't beep (a never-focused window can't unlock audio): the
 * always-alive main window owns the sound, this window owns the visuals. Created only while
 * cast alerts are enabled (see `main.ts`); when empty it's fully transparent, so it's invisible.
 */
export function createAlertWindow(displayId?: number): BrowserWindow {
  const display = alertDisplay(displayId);
  // Already up: a monitor change just moves it. Tearing it down and building another raced with
  // its own teardown — `closed` fires after the replacement is created, and the handler used to
  // null out whichever window was current, so the new overlay became unreachable and the alert
  // kept appearing on the old monitor until some other setting rebuilt it.
  if (alertWindow && !alertWindow.isDestroyed()) {
    coverDisplay(alertWindow, display);
    return alertWindow;
  }
  const { bounds } = display;
  alertWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: false, // never steal focus from the game
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=alert"],
    },
  });
  alertDisplayId = displayId;
  alertWindow.setAlwaysOnTop(true, "screen-saver");
  setAlertInteractive(false); // click-through + unfocusable: every click passes to the game
  // Best-effort: keep showing over a borderless-fullscreen game and across virtual desktops.
  alertWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pipeRendererConsole(alertWindow, "alert");
  // It covers a whole display and can be made solid to place a spot, so a renderer that stops
  // answering is the worst case in the app: a sheet of glass over the screen that nothing can
  // dismiss. Unlike the app's own windows a hang is treated as fatal here — a hung overlay cannot
  // show an alert either, so there is nothing to preserve by waiting — and it holds no state, so it
  // goes and comes back rather than lingering.
  guardRenderer(alertWindow, "alert", () => rebuildAlertWindow(alertWindow));
  const created = alertWindow;
  // Only clear the reference if it's still *this* window — see the note above about the race.
  created.on("closed", () => {
    if (alertWindow === created) alertWindow = null;
  });
  load(created, "alert");
  // `showInactive` so appearing never pulls focus off the game.
  created.once("ready-to-show", () => {
    created.showInactive();
    coverDisplay(created, alertDisplay(displayId));
  });
  coverDisplay(created, display);
  return created;
}

/** The monitor to cover: the chosen one, or primary when it's unset or gone (unplugged). */
function alertDisplay(displayId?: number): Electron.Display {
  return (
    (displayId !== undefined && screen.getAllDisplays().find((d) => d.id === displayId)) ||
    screen.getPrimaryDisplay()
  );
}

/**
 * Make a window cover exactly one display. The constructor can't be trusted with this: a window
 * created for a secondary or HiDPI monitor inherits the *primary* display's work-area size, so
 * the overlay ends up the wrong size and the banner lands off-screen or half-way across. Same
 * fix as the screengrab selector — re-assert the bounds after creation, once the window is
 * realized, and once more a beat later, since some Electron builds only honour it then.
 */
function coverDisplay(win: BrowserWindow, display: Electron.Display): void {
  const apply = () => {
    if (!win.isDestroyed()) win.setBounds(display.bounds);
  };
  apply();
  setTimeout(apply, REALIZE_DELAY_MS);
}

/**
 * Tear down the alert overlay (when cast alerts are turned off) — nothing to show, no window.
 *
 * `destroy()`, not `close()`: closing asks the renderer to unload, so the one case that most needs
 * the window gone — a wedged page — is the one that could refuse. It holds nothing worth saving.
 */
export function closeAlertWindow(): void {
  if (alertWindow && !alertWindow.isDestroyed()) alertWindow.destroy();
  alertWindow = null;
}

/**
 * Whether the overlay may take a click, and therefore focus.
 *
 * The two settings are one decision and are kept together here, because apart is how the overlay
 * ends up solid with nothing to click: interactive is a *borrowed* state ([ipc.ts](./ipc.ts) places
 * a custom alert spot with it) and click-through is the resting one. Callers say which they want and
 * never poke `setIgnoreMouseEvents` themselves, so there is one definition of "harmless".
 */
export function setAlertInteractive(on: boolean): void {
  const win = alertWindow;
  if (!win || win.isDestroyed()) return;
  win.setIgnoreMouseEvents(!on, on ? undefined : { forward: true });
  win.setFocusable(on);
  if (on) win.focus();
}

/**
 * Replace a crashed overlay, once.
 *
 * Destroying it is what stops it holding the screen; rebuilding is what stops that being a silent
 * loss of every alert until the next settings change. A rebuild that dies too is left down — a
 * window that crashes on load would otherwise respawn for ever — and the next thing to enable
 * alerts creates it again from scratch.
 */
let alertRebuilt = false;
function rebuildAlertWindow(dying: BrowserWindow | null): void {
  // A window that has already been replaced (a monitor change, alerts toggled) crashing on its way
  // out must not take its healthy successor with it.
  if (!dying || dying !== alertWindow) return;
  const displayId = alertDisplayId;
  closeAlertWindow();
  if (alertRebuilt) {
    log.warn("alert overlay crashed again — leaving it down until alerts are re-enabled");
    return;
  }
  alertRebuilt = true;
  const rebuilt = createAlertWindow(displayId);
  // A clean load means this one is healthy, so a much later crash still gets its one rebuild.
  rebuilt.webContents.once("did-finish-load", () => {
    alertRebuilt = false;
  });
}

/** Strip every overlay of its hold on the screen. The last resort — see `main.ts`'s crash handler. */
export function neutralizeOverlays(): void {
  destroyLookupWindows();
  if (alertWindow && !alertWindow.isDestroyed()) {
    setAlertInteractive(false); // solid + fullscreen is the state that locks a desktop
    makeHarmless(alertWindow);
  }
}

/**
 * Every selector window that exists, so a cancel can reach one that got away.
 *
 * `lookup.ts` keeps its own set and acts on that — but a window missing from it (created inside a
 * racing open, orphaned by a throw partway through a multi-monitor set) is exactly the one that ends
 * up stuck on screen with nothing able to close it, because every route out goes through that set.
 * This registry is what makes "close them all" true rather than "close the ones we remembered".
 */
const lookupWindows = new Set<BrowserWindow>();

/**
 * Destroy every selector window, optionally sparing one (the read's progress window).
 * Returns how many went, so a caller can log a discrepancy against its own bookkeeping.
 *
 * `destroy()` rather than `close()`: closing asks the renderer to unload, which a wedged or
 * never-hydrated page can refuse — and refusing is the failure being guarded against. These windows
 * hold no state, so there is nothing to be polite about.
 */
export function destroyLookupWindows(except?: BrowserWindow): number {
  let gone = 0;
  for (const win of [...lookupWindows]) {
    if (win === except) continue;
    lookupWindows.delete(win);
    if (!win.isDestroyed()) {
      win.destroy();
      gone += 1;
    }
  }
  return gone;
}

/** Whether any selector window exists — including one its owner has lost track of. */
export function hasLookupWindows(): boolean {
  return [...lookupWindows].some((w) => !w.isDestroyed());
}

/** A selector window and the one thing its owner may do to it beyond closing: put it on screen. */
export interface LookupWindow {
  win: BrowserWindow;
  /**
   * Show it, sized to its display. Idempotent, and deliberately the caller's call rather than this
   * module's: `lookup.ts` waits for the renderer to report that it is listening, because a selector
   * that cannot take a drag or an Escape must never be on screen
   * ([ADR 0102](../specs/decisions/0102-a-lookup-never-holds-the-screen.md)).
   */
  reveal(): void;
}

/**
 * A frameless, transparent, fullscreen window over ONE display for the screengrab
 * region selector. One is created per display (lookup.ts manages the set) so you
 * can grab from any monitor, including a non-rectangular layout (monitors at
 * different heights) — each window covers exactly its own display. It takes focus
 * for the drag + Escape.
 *
 * Created **hidden**: it is fullscreen and takes input, so it is only worth showing once something
 * on the other side can act on a click.
 */
export function createLookupWindow(bounds: { x: number; y: number; width: number; height: number }): LookupWindow {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    // Shown from the start, this is a fullscreen pane of glass that eats every click while the page
    // loads and hydrates — and for ever if either never finishes. `reveal()` is the only way on screen.
    show: false,
    // Must stay resizable/movable so the setBounds below can take effect —
    // the constructor mis-sizes windows created on a secondary/HiDPI monitor
    // (they inherit the PRIMARY display's work-area size), so we re-assert the
    // target display's full bounds after creation and once it's ready.
    resizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: ["--eql-role=select"],
    },
  });
  win.setAlwaysOnTop(true, "screen-saver");
  lookupWindows.add(win);
  win.on("closed", () => lookupWindows.delete(win));
  const cover = () => {
    if (!win.isDestroyed()) win.setBounds(bounds);
  };
  cover();
  load(win, "select");
  return {
    win,
    reveal() {
      if (win.isDestroyed() || win.isVisible()) return;
      cover();
      win.show();
      win.focus(); // the drag and Escape both need it; nothing else is competing for focus by now
      setTimeout(cover, REALIZE_DELAY_MS); // some builds only honour the resize once realized
    },
  };
}

/**
 * Surface `text` in the control window's Search box, creating/showing that window first.
 * The one path anything outside the control window uses to hand it something to look up —
 * the screengrab OCR result, and a clicked name in the map window (which has no search of
 * its own). Waits for the load when the window was only just created, since a send to a
 * loading frame is dropped.
 */
export function showInSearch(text: string): void {
  const win = getMainWindow() ?? createMainWindow();
  win.show();
  win.focus();
  const send = () => win.webContents.send(CH.searchPrefill, text);
  if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
  else send();
}

/**
 * Which of our two persisted windows this is, or null for the ones that keep no state (the alert
 * overlay, the screengrab selectors). The renderer never says which window it is — it doesn't know —
 * so anything stored per window is keyed by asking the sender's window this.
 */
export function roleOf(win: BrowserWindow | null): "main" | "map" | null {
  if (!win || win.isDestroyed()) return null;
  if (win === mainWindow) return "main";
  if (win === mapWindow) return "map";
  return null;
}

