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
  - `session-stats.ts` — session XP/kill tracking (see [log-watching](../log-watching/README.md)).
  - `windows.ts` — the framed control window and the frameless transparent overlay.
    Windows show without stealing focus (overlay uses `showInactive`); DevTools open
    only when `EQL_DEVTOOLS` is set. Each window's renderer console is piped into the
    main-process log (`renderer:<role>`), so renderer output lands in the same terminal
    + debug file as the main process instead of only that window's DevTools.
  - `window-state.ts` — persists window positions + whether the overlay was open, in
    a file separate from settings (bounds change constantly; routing them through the
    reactive store would spam change events). Off-screen bounds are ignored, and a
    "reset window positions" action recenters lost windows.
  - `protocol.ts` — serves the exported renderer over `app://` in production, reading
    files via asar-aware `fs` so it works when packaged.
  - `store.ts` — the one source of truth: shopping list + settings (persisted to
    `userData`), plus loot→list matching.
  - `log-watcher.ts` — tails the EQ log; see [log-watching](../log-watching/README.md).
  - `wiki/` — the eqlwiki data source; see [wiki-data](../wiki-data/README.md).
  - `ipc.ts` — request/response handlers behind `window.eql`.
- **Renderer** (`src/app/`, `src/lib/`) is a static SPA: control window (`page.tsx`)
  and overlay (`overlay/page.tsx`). It never imports Node/Electron — it only calls
  the typed `window.eql` bridge.
- **Shared** (`src/shared/`) is framework-agnostic code imported by both sides:
  `types.ts` (the IPC contract), `ipc-channels.ts`, `logging.ts`, `log-parser.ts`.

## Data flow
- Renderer → main: `window.eql.*` → `ipcRenderer.invoke` → `ipcMain.handle` → store/wiki/watcher.
- Main → renderer (events): store/watcher emit → `main.ts` broadcasts to every window →
  preload `on*` subscriptions → React hooks (`src/lib/hooks.ts`).
- The store is authoritative, so the control window and overlay always agree.

## Non-responsibilities
- No reading or hooking of game memory — logs and the public wiki only (like EQBuddy).
- No SSR / web server — the renderer is fully static (see [ADR 0005](../decisions/0005-renderer-static-export-and-app-protocol.md)).
- The renderer holds no durable state; it renders what the store sends.

## See also
[log-watching](../log-watching/README.md) · [wiki-data](../wiki-data/README.md) ·
[overlay-ui](../overlay-ui/README.md) · [ADR 0002](../decisions/0002-electron-shell-over-nextjs.md) ·
[ADR 0005](../decisions/0005-renderer-static-export-and-app-protocol.md)
