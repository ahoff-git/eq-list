# Architecture

## Purpose
Describe how EQ List is assembled: an Electron desktop shell wrapping a static
React (Next.js) renderer, with all privileged work (filesystem, network, windows)
in the main process and all UI in the renderer.

## Responsibilities
- **Electron main** (`electron/`) owns everything the browser can't do:
  - `main.ts` — lifecycle, event fan-out, wiring, global hotkeys, single-instance
    lock, and the `eqlist://` deep-link (a web/landing-page link launches or focuses
    the app; relaunching just focuses the running instance).
  - `ocr.ts` / `lookup.ts` — the screengrab lookup: screenshots every display up
    front (each at its own **native** resolution, so differing monitor resolutions
    aren't stretched/distorted), shows a per-monitor transparent selector; the crop
    is OCR'd (Tesseract.js) and the text is routed into the control window's Search box.
  - `combat-stats.ts` — the one session tracker: experience/kill counters, per-combatant
    and per-spell tallies, per-mob rates; `combat-history.ts` — finished fights persisted
    for later; `xp-progress.ts` / `hp-estimate.ts` — persistent player state that outlives
    a session reset (all see [log-watching](../log-watching/README.md)).
    See [ADR 0019](../decisions/0019-parse-once-and-one-tracker.md).
  - `windows.ts` — the framed control window and the frameless transparent overlay.
    Windows show without stealing focus (overlay uses `showInactive`); DevTools open
    only when `EQL_DEVTOOLS` is set. Each window's renderer console is piped into the
    main-process log (`renderer:<role>`), so renderer output lands in the same terminal
    + debug file as the main process instead of only that window's DevTools.
  - `window-state.ts` — persists window positions + whether the map window was open
    (so the next launch reopens it), in a file separate from settings (bounds change
    constantly; routing them through the reactive store would spam change events).
    Off-screen bounds are ignored, bounds bigger than the display they sit on are shrunk to
    fit it, and a "reset window positions" action recenters lost windows. On restore, `windows.ts`
    re-asserts the saved bounds with `setBounds` after creation: the constructor sizes a new
    window by the **primary** display's scale factor, so on a mixed-DPI desktop a window reopened
    on a scaled monitor came out proportionally too big — and since that inflated size was what
    got saved on close, the window grew on every launch. Sub-pixel differences aren't persisted,
    since a fractionally-scaled display reads bounds back a pixel off what was set.
    Per-window UI toggles (active tab, map pin/key/zone/share) persist
    separately in the renderer via `usePersistentState` (localStorage).
  - `protocol.ts` — serves the exported renderer over `app://` in production, reading
    files via asar-aware `fs` so it works when packaged.
  - `store.ts` — the one source of truth: shopping list + settings (persisted to
    `userData`), plus loot→list matching.
  - `log-watcher.ts` — tails the EQ log; see [log-watching](../log-watching/README.md).
  - `log-cursor.ts` — how far each log has been read, kept across restarts, so the app's state
    doesn't depend on when it was launched
    ([ADR 0044](../decisions/0044-the-log-position-outlives-the-app.md)).
  - `wiki/` — the eqlwiki data source; see [wiki-data](../wiki-data/README.md).
  - `ipc.ts` — request/response handlers behind `window.eql`.
- **Renderer** (`src/app/`, `src/lib/`) is a static SPA: control window (`page.tsx`)
  and overlay (`overlay/page.tsx`). It never imports Node/Electron — it only calls
  the typed `window.eql` bridge.
- **Shared** (`src/shared/`) is framework-agnostic code imported by both sides:
  `types.ts` (the IPC contract), `ipc-channels.ts`, `logging.ts`, and the log pipeline —
  `log-parser.ts` (which owns the one place a raw line is split), `combat-parser.ts`, and
  `parse-line.ts`, the single-pass dispatcher every line goes through exactly once
  ([ADR 0019](../decisions/0019-parse-once-and-one-tracker.md)) — plus the pure analysis the
  two sides share, like `damage-tree.ts`, which the tracker fills and the meter rolls up
  ([ADR 0053](../decisions/0053-damage-is-cells-rolled-up.md)).

## Data flow
- Renderer → main: `window.eql.*` → `ipcRenderer.invoke` → `ipcMain.handle` → store/wiki/watcher.
- Main → renderer (events): store/watcher emit → `main.ts` broadcasts to every window →
  preload `on*` subscriptions → React hooks (`src/lib/hooks.ts`). High-rate streams are
  coalesced before broadcast (the damage meter's snapshot) so a burst of log lines can't
  flood the channel.
- The store is authoritative, so the control window and overlay always agree.

## Non-responsibilities
- No reading or hooking of game memory — logs and the public wiki only (like EQBuddy).
- No SSR / web server — the renderer is fully static (see [ADR 0005](../decisions/0005-renderer-static-export-and-app-protocol.md)).
- The renderer holds no durable state; it renders what the store sends.

## See also
[log-watching](../log-watching/README.md) · [wiki-data](../wiki-data/README.md) ·
[overlay-ui](../overlay-ui/README.md) · [ADR 0002](../decisions/0002-electron-shell-over-nextjs.md) ·
[ADR 0005](../decisions/0005-renderer-static-export-and-app-protocol.md)
