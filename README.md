# EQ List

A floating **loot shopping-list overlay** for [EverQuest Legends](https://eqlwiki.com).

Build a list of items you want — add them directly, or pull all the turn-ins from a
quest or all the ingredients from a recipe — then a translucent, always-on-top
window sits over the game and **lights up the moment one of them drops** in your log.

Item, quest, and recipe data comes from [eqlwiki.com](https://eqlwiki.com); drops are
detected by tailing your EQ log (no memory reading or game hooking).

## How it works

- **Electron main process** watches the log, fetches/caches wiki data, and owns the
  windows and the shopping list (persisted to disk).
- **Renderer** (React / Next.js, static-exported) is the control window plus the
  overlay. It talks to main only through a typed `window.eql` bridge.

See [`specs/`](./specs/README.md) for the full picture and the
[decision records](./specs/decisions/README.md) for the *why*.

## Getting started

```bash
npm install
npm run dev      # next dev + electron, pointed at the dev server
```

In-game, enable logging (`/log on`). By default EQ List watches
`C:\Users\Public\Daybreak Game Company\Installed Games\EverQuest Legends\Logs` and
follows the most recently written `eqlog_*.txt`; change the folder in **Settings**.

1. **Search** for an item / quest / recipe by name (spelling can be rough — search
   is fuzzy), or switch to **By zone** to browse a zone's quests. Add items, or
   **Add full quest** to queue all of a quest's turn-ins grouped together. Or press
   **Ctrl/Cmd+Shift+L** to drag a box over an item name on screen and look it up (OCR).
2. Click **⧉ Open overlay** and position the float over your game window
   (toggle it any time with **Ctrl/Cmd+Shift+O**). Click a list item on the overlay
   to see who drops it, by zone — your current zone is highlighted.
3. Kill things — matching drops flash gold and tick the count up. The **Session** tab
   tracks XP gains and kills (with XP attributed to the mob you just killed).

**No game handy?** Run `npm run sim` to replay a sample log into a `replay-logs/`
folder with live timestamps, then set the app's Log folder to that directory
(Settings → Browse). Add items like *Bone Chips* or *Aviak Talon* and watch them
tick up. Use `npm run sim -- --loop --loot-only` for a continuous stream.

## Launching

- **Develop** with hot reload: `npm run dev`.
- **Run locally** (no dev server): `npm run app` — builds once if needed, then starts
  the app. On Windows you can just double-click **`EQ-List.cmd`**.
- **Install it**: `npm run dist` builds a distributable (electron-builder / NSIS). The
  installed app gets a normal shortcut and registers the **`eqlist://`** URL scheme, so
  a link like `<a href="eqlist://open">Launch EQ List</a>` on any page (including a
  landing page) opens the app — or focuses it if it's already running (single-instance).

Only one instance runs at a time; launching again just focuses the existing window.

A simple **landing page** lives in [`landing/index.html`](./landing/index.html) —
a self-contained page (host it anywhere) with **Launch** (`eqlist://`) and
**Download** buttons. Build the installer with `npm run dist` (output in `release/`),
host it (e.g. GitHub Releases), and point the landing page's Download link at it.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server + Electron (hot reload). |
| `npm run build` | Build the renderer (`out/`) and the Electron main (`dist-electron/`). |
| `npm start` | Build, then run the packaged production path. |
| `npm run app` | Build if needed, then launch (also via double-click `EQ-List.cmd`). |
| `npm test` | Compile + run the parser/fuzzy/grouping/watcher/stats tests (`node --test`). |
| `npm run sim` | Replay a sample log into a watched file to test the loot pipeline without playing. |
| `npm run typecheck` | Typecheck both the renderer and the Electron sides. |
| `npm run dist` | Build an installer via electron-builder (registers `eqlist://`). |

## Debug logging

Debug logs are off by default (see [`src/shared/logging.ts`](./src/shared/logging.ts)).
Turn them on with the **Settings → Debug logging** toggle, the `EQL_DEBUG=1` env var
(main process), or `localStorage.eqlDebug = "1"` in the renderer devtools.

## Prior art

Inspired by [EQBuddy](https://github.com/DranakCorps-bot/EQBuddy) (log parsing) and
[eql-tooltip](https://github.com/DavisChappins/eql-tooltip) (overlay), and reuses the
eqlwiki scraping approach from the `eql-buff-calc` sample.
