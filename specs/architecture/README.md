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
    What OCR read is **corrected before it's searched** — `src/shared/ocr-variants.ts` holds
    the EQ-font confusion table (`rn` read as `m`, …) and the wiki's mirrored titles pick
    between the readings; see
    [ADR 0081](../decisions/0081-an-ocr-grab-is-corrected-before-it-is-searched.md).
    The selectors cover every display and take input, so **nothing may hold them open
    indefinitely**: a selector is created hidden and shown only once its renderer reports
    (`lookup:ready`) that it is listening, a per-phase deadline closes them, `destroy()` means a
    wedged page can't refuse, Escape is held globally while one is open, the hotkey toggles, and
    every OCR wait is bounded (a blown budget discards the worker) — see
    [ADR 0102](../decisions/0102-a-lookup-never-holds-the-screen.md).
  - `windows.ts` — every window's creation, and the rule that **an overlay which can no longer be
    operated does not keep the screen**: a crashed, hung or unloadable renderer is one fact
    (`guardRenderer`), the window is stripped of its pin and its clicks (`makeHarmless`) before
    anything else, and then either destroyed (the alert overlay, rebuilt once) or revived (main,
    map). A main-process crash neutralizes the lot. See
    [ADR 0131](../decisions/0131-an-overlay-that-cannot-be-operated-does-not-keep-the-screen.md).
  - `buff-tracker.ts` — the buff board: which of your buffs are up, which have lapsed, and the
    banner and standing message that say so
    ([ADR 0140](../decisions/0140-a-buff-is-watched-until-it-lapses.md)). Deliberately the mirror
    image of `spawn-tracker.ts`, and the contrast is the point of both: a respawn is a fact about the
    **world**, so it is persisted; a buff is a fact about a **login**, so only the player's choices
    are. Both raise their alerts down the same `raiseAlert` path rather than growing a notification
    system apiece. Its rules are pure and shared (`src/shared/buff-tracking.ts`), and so is the
    sentence lookup that makes a nameless fade attributable (`src/shared/spell-strings.ts`, reading
    the game's own `spells_us_str.txt` via `spells.ts`).
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
  - `window-state.ts` — **how each window was left**: its position and size, whether it was
    maximized, whether the map window was open (so the next launch reopens it), and its three
    title-bar toggles — pinned, ◐ opaque, 👻 click-through (`WindowToggles`, applied by `windows.ts`
    as the window is created; see
    [ADR 0074](../decisions/0074-how-a-window-was-left-is-window-state.md)). A file separate from
    settings, for two reasons: bounds change constantly and routing them through the reactive store
    would spam change events, and all of this is per *window* rather than a preference for the app.
    Off-screen bounds are ignored, bounds bigger than the display they sit on are shrunk to
    fit it, and a "reset window positions" action recenters lost windows. On restore, `windows.ts`
    re-asserts the saved bounds with `setBounds` after creation: the constructor sizes a new
    window by the **primary** display's scale factor, so on a mixed-DPI desktop a window reopened
    on a scaled monitor came out proportionally too big — and since that inflated size was what
    got saved on close, the window grew on every launch. Sub-pixel differences aren't persisted,
    since a fractionally-scaled display reads bounds back a pixel off what was set.
    Per-window UI toggles (active tab, map pin/key/zone/share, the Items tab's criteria and
    weights) persist via `usePersistentState`, which writes **both** `localStorage` and
    `ui-state.ts` in main — the local copy for the first synchronous paint, main's copy as the
    authority, because `localStorage` belongs to an *origin* and a packaged launch (`app://local`)
    and a dev one (`http://localhost:3000`) otherwise keep separate settings
    ([ADR 0166](../decisions/0166-a-panel-setting-belongs-to-the-app-not-to-an-origin.md)).
  - `protocol.ts` — serves the exported renderer over `app://` in production, reading
    files via asar-aware `fs` so it works when packaged.
  - `store.ts` — the one source of truth: shopping list + settings (persisted to
    `userData`), plus loot→list matching.
  - `ui-state.ts` — the renderer's own panel settings, as one untyped key/value file in `userData`.
    Not the same thing as `store.ts`'s **settings**, which are the app's and have a shape.
  - `log-watcher.ts` — tails the EQ log; see [log-watching](../log-watching/README.md).
  - `self-check.ts` — "why isn't it doing anything?", answered as a chain of steps with the first
    broken link named and everything downstream reported as *not checked yet* rather than as further
    faults. The judging (the step table, the skip rule, the verdict) is pure and shared in
    `src/shared/self-check.ts`; this is the looking, with the network and the alert window injected
    by `ipc.ts` so the whole thing tests without Electron. See
    [ADR 0100](../decisions/0100-a-setup-check-is-a-chain.md).
  - `log-cursor.ts` — how far each log has been read, kept across restarts, so the app's state
    doesn't depend on when it was launched
    ([ADR 0044](../decisions/0044-the-log-position-outlives-the-app.md)).
  - `wiki/` — the eqlwiki data source; see [wiki-data](../wiki-data/README.md).
  - `lucy/` — the supplementary item source, asked only where the wiki is silent; see
    [lucy-data](../lucy-data/README.md). Same three-file shape as `wiki/` on purpose (`api` /
    pure `parse` / caching `index`), and it shares the HTML-to-lines reader (`html-text.ts`) and
    the request throttle (`src/shared/polite-queue.ts`) rather than copying either.
  - `ipc.ts` — request/response handlers behind `window.eql`. One registrar per subject
    (`registerListIpc`, `registerSettingsIpc`, `registerWikiIpc`, `registerStatsIpc`, `registerAppIpc`,
    `registerWindowIpc`, `registerPeerIpc`), each taking the same `IpcContext` and destructuring what
    its own handlers name, so `registerIpc` reads as a table of contents rather than a flat list of
    every channel in the app.
- **Renderer** (`src/app/`, `src/lib/`) is a static SPA: control window (`page.tsx`)
  and overlay (`overlay/page.tsx`). It never imports Node/Electron — it only calls
  the typed `window.eql` bridge.
- **Shared** (`src/shared/`) is framework-agnostic code imported by both sides:
  `types.ts` (the IPC contract), `ipc-channels.ts`, `logging.ts`, and the log pipeline —
  `log-parser.ts` (which owns the one place a raw line is split), `combat-parser.ts`, and
  `parse-line.ts`, the single-pass dispatcher every line goes through exactly once
  ([ADR 0019](../decisions/0019-parse-once-and-one-tracker.md)) — plus the pure analysis the
  two sides share, like `damage-tree.ts`, which the tracker fills and the meter rolls up
  ([ADR 0053](../decisions/0053-damage-is-cells-rolled-up.md)), and `names.ts`, which states once
  which numbers in a name are part of its identity — an item's grade and a zone's difficulty are
  not ([ADR 0057](../decisions/0057-a-grade-is-not-an-identity.md)).
  Three small modules are there because *both* sides did the same arithmetic by hand: `numbers.ts`
  (`round`, and `ratio`/`over` for a divide whose denominator can legitimately be zero — the guard
  matters, since `NaN%` on screen is what an unguarded rate looks like), `format.ts` (the strings the
  panels show, including `percent`, which takes the fraction so it composes with `ratio`, and `count` /
  `countOf`, which say "1 kill" and "12 of 340 drops" once rather than once per panel), and
  `constants.ts` (the numbers both processes have to agree on — the scale ranges, and the opacity floor
  the renderer bounds a slider with and main clamps IPC against).

## Data flow
- Renderer → main: `window.eql.*` → `ipcRenderer.invoke` → `ipcMain.handle` → store/wiki/watcher.
- Main → renderer (events): store/watcher emit → `main.ts` broadcasts to every window →
  preload `on*` subscriptions → React hooks (`src/lib/hooks.ts`). High-rate streams are
  coalesced before broadcast (the damage meter's snapshot) so a burst of log lines can't
  flood the channel.
- The store is authoritative, so the control window and overlay always agree.

## Non-responsibilities
- No reading or hooking of game memory — logs and public websites only (like EQBuddy).
- No unasked traffic on a **borrowed** source. eqlwiki is the community's own and expects us;
  lucy.allakhazam.com has never heard of us, so it is asked once per user action, cached for a
  month, throttled, and switchable off at the IPC boundary
  ([ADR 0124](../decisions/0124-lucy-is-a-second-opinion.md)).
- No SSR / web server — the renderer is fully static (see [ADR 0005](../decisions/0005-renderer-static-export-and-app-protocol.md)).
- The renderer holds no durable state; it renders what the store sends.

## See also
[log-watching](../log-watching/README.md) · [wiki-data](../wiki-data/README.md) ·
[lucy-data](../lucy-data/README.md) ·
[overlay-ui](../overlay-ui/README.md) · [ADR 0002](../decisions/0002-electron-shell-over-nextjs.md) ·
[ADR 0005](../decisions/0005-renderer-static-export-and-app-protocol.md)
